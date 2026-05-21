import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { db } from "../db/client";
import { merchants, knowledgeBaseDocs } from "../db/schema";
import { getAuth, requireAuth } from "../middleware/auth";
import { loadMerchantContext, MissingEmailError } from "../services/merchant";
import { stripe } from "../services/stripe";
import { convertM4aToMp3, getDurationSecs } from "../services/audio";
import {
  buildFirstMessage,
  buildSystemPrompt,
  createAgent,
  createIVC,
  createKnowledgeBaseDoc,
  ElevenLabsError,
} from "../services/elevenlabs";
import { isNotNull } from "drizzle-orm";
import { requireEnv } from "../env";

const UPLOAD_DIR = join(tmpdir(), "dunner-uploads");
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB

async function safeUnlink(path: string) {
  try {
    await unlink(path);
  } catch {
    // best-effort cleanup
  }
}

type Env = {
  Variables: {
    auth: { userId: string; sessionId: string | null };
  };
};

export const onboardingRoute = new Hono<Env>();

async function createAccountLink(stripeAccountId: string) {
  const appUrl = requireEnv("APP_URL");
  return stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${appUrl}/onboarding/stripe/refresh?account=${stripeAccountId}`,
    // Stripe requires an http(s) return_url. We bounce through the backend
    // so we can 302 to the dunner:// custom scheme that WebBrowser is
    // listening for.
    return_url: `${appUrl}/onboarding/stripe/return?account=${stripeAccountId}`,
    type: "account_onboarding",
    collection_options: { fields: "eventually_due" },
  });
}

onboardingRoute.post("/onboarding/stripe/start", requireAuth, async (c) => {
  const { userId } = getAuth(c);

  try {
    const ctx = await loadMerchantContext(userId);
    let merchant = ctx.merchant;

    if (merchant.stripeAccountStatus === "active" && merchant.stripeAccountId) {
      return c.json({
        complete: true,
        accountId: merchant.stripeAccountId,
        url: null,
      });
    }

    if (!merchant.stripeAccountId) {
      // NB: `type` and `controller` are mutually exclusive on accounts.create.
      // The controller below fully defines an Express-equivalent account
      // (Stripe dashboard, platform-paid fees, Stripe-owned loss liability).
      const account = await stripe.accounts.create({
        email: ctx.email,
        controller: {
          stripe_dashboard: { type: "express" },
          fees: { payer: "application" },
          // Stripe requires `losses.payments = "application"` when the
          // dashboard type is "express". (Connect platform is liable for
          // chargebacks/refunds; that's the Express contract.)
          losses: { payments: "application" },
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          dunner_merchant_id: merchant.id,
          dunner_clerk_user_id: userId,
        },
      });

      const [updated] = await db
        .update(merchants)
        .set({
          stripeAccountId: account.id,
          stripeAccountStatus: "pending",
        })
        .where(eq(merchants.id, merchant.id))
        .returning();
      if (!updated) {
        return c.json({ error: "failed_to_persist_account" }, 500);
      }
      merchant = updated;
    }

    if (!merchant.stripeAccountId) {
      return c.json({ error: "missing_stripe_account_after_create" }, 500);
    }

    const link = await createAccountLink(merchant.stripeAccountId);
    return c.json({
      complete: false,
      accountId: merchant.stripeAccountId,
      url: link.url,
    });
  } catch (err) {
    if (err instanceof MissingEmailError) {
      return c.json({ error: "no_email_on_clerk_user" }, 400);
    }
    console.error("[onboarding/stripe/start]", err);
    return c.json({ error: "stripe_start_failed" }, 500);
  }
});

// Stripe's hosted onboarding navigates here when the user finishes (or aborts
// from a finished state). We immediately 302 to the dunner:// deeplink, which
// the iOS in-app browser is listening for via WebBrowser.openAuthSessionAsync —
// that triggers it to close and resume the app with the result.
onboardingRoute.get("/onboarding/stripe/return", (c) => {
  const accountId = c.req.query("account") ?? "";
  const scheme = requireEnv("DEEPLINK_SCHEME");
  const target = `${scheme}://stripe/onboarding-return?account=${encodeURIComponent(accountId)}`;
  return c.redirect(target, 302);
});

// NOTE: No Clerk auth here. The in-app browser (WebBrowser.openAuthSessionAsync)
// does NOT carry Clerk-Expo's bearer token, so the Clerk session is unreachable
// from inside this redirect. We look up the merchant by stripeAccountId instead.
// Risk surface: an attacker who knows a stripeAccountId can re-issue an
// account_link for that account. Stripe's own identity verification gates any
// actual change, so this is acceptable for our V1.
onboardingRoute.get("/onboarding/stripe/refresh", async (c) => {
  const accountId = c.req.query("account");
  if (!accountId) {
    return c.html(refreshErrorHtml("Missing account id."), 400);
  }
  const merchant = await db.query.merchants.findFirst({
    where: eq(merchants.stripeAccountId, accountId),
  });
  if (!merchant) {
    return c.html(refreshErrorHtml("Unknown Stripe account."), 404);
  }
  try {
    const link = await createAccountLink(accountId);
    return c.redirect(link.url, 302);
  } catch (err) {
    console.error("[onboarding/stripe/refresh]", err);
    return c.html(refreshErrorHtml("Failed to refresh onboarding link."), 500);
  }
});

onboardingRoute.get(
  "/onboarding/stripe/status/:accountId",
  requireAuth,
  async (c) => {
    const { userId } = getAuth(c);
    const accountId = c.req.param("accountId");

    try {
      const ctx = await loadMerchantContext(userId);
      if (ctx.merchant.stripeAccountId !== accountId) {
        return c.json({ error: "forbidden" }, 403);
      }

      const account = await stripe.accounts.retrieve(accountId);
      const currentlyDue = account.requirements?.currently_due ?? [];
      const pastDue = account.requirements?.past_due ?? [];
      const complete =
        account.details_submitted === true && currentlyDue.length === 0;

      if (complete && ctx.merchant.stripeAccountStatus !== "active") {
        await db
          .update(merchants)
          .set({ stripeAccountStatus: "active" })
          .where(eq(merchants.id, ctx.merchant.id));
      }

      return c.json({
        complete,
        detailsSubmitted: account.details_submitted ?? false,
        chargesEnabled: account.charges_enabled ?? false,
        payoutsEnabled: account.payouts_enabled ?? false,
        currentlyDue,
        pastDue,
      });
    } catch (err) {
      if (err instanceof MissingEmailError) {
        return c.json({ error: "no_email_on_clerk_user" }, 400);
      }
      console.error("[onboarding/stripe/status]", err);
      return c.json({ error: "stripe_status_failed" }, 500);
    }
  },
);

onboardingRoute.get("/onboarding/state", requireAuth, async (c) => {
  const { userId } = getAuth(c);
  try {
    const ctx = await loadMerchantContext(userId);
    // Knowledge requires a real EL Knowledge Base doc id. The legacy
    // __SKIP__ row from Step 3 has eleven_labs_doc_id = NULL, so merchants
    // who skipped during Step 3 will be re-routed to the knowledge screen.
    const realKnowledgeRow = await db.query.knowledgeBaseDocs.findFirst({
      where: and(
        eq(knowledgeBaseDocs.merchantId, ctx.merchant.id),
        isNotNull(knowledgeBaseDocs.elevenLabsDocId),
      ),
    });

    // Voice: any non-null voice id counts (the legacy __SKIP__ sentinel is
    // treated as done for merchants onboarded under Step 3, but new signups
    // must produce a real EL voice_id via /onboarding/voice/upload).
    const recordVoice = !!ctx.merchant.defaultVoiceId;

    return c.json({
      connectStripe: ctx.merchant.stripeAccountStatus === "active",
      recordVoice,
      knowledge: !!realKnowledgeRow,
    });
  } catch (err) {
    if (err instanceof MissingEmailError) {
      return c.json({ error: "no_email_on_clerk_user" }, 400);
    }
    console.error("[onboarding/state]", err);
    return c.json({ error: "state_failed" }, 500);
  }
});

onboardingRoute.post("/onboarding/voice/upload", requireAuth, async (c) => {
  const { userId } = getAuth(c);

  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return c.json({ error: "content_type_must_be_multipart" }, 400);
  }

  const declaredLength = Number(c.req.header("content-length") ?? "0");
  if (declaredLength > MAX_UPLOAD_BYTES) {
    return c.json({ error: "file_too_large" }, 413);
  }

  let m4aPath: string | null = null;
  let mp3Path: string | null = null;

  try {
    const ctx = await loadMerchantContext(userId);

    const body = await c.req.parseBody();
    const file = body["files"];
    if (!(file instanceof File)) {
      return c.json({ error: "missing_files_field" }, 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return c.json({ error: "file_too_large" }, 413);
    }

    await mkdir(UPLOAD_DIR, { recursive: true });
    const id = randomUUID();
    m4aPath = join(UPLOAD_DIR, `${id}.m4a`);
    mp3Path = join(UPLOAD_DIR, `${id}.mp3`);

    const arrayBuffer = await file.arrayBuffer();
    await writeFile(m4aPath, new Uint8Array(arrayBuffer));

    await convertM4aToMp3(m4aPath, mp3Path);

    const durationSecs = await getDurationSecs(mp3Path);
    if (durationSecs < 60) {
      return c.json(
        {
          error: "too_short",
          message: "Recording must be at least 60 seconds.",
          durationSecs,
        },
        400,
      );
    }
    if (durationSecs > 180) {
      return c.json(
        {
          error: "too_long",
          message: "Recording must be under 3 minutes.",
          durationSecs,
        },
        400,
      );
    }

    const { voice_id } = await createIVC(
      `Merchant ${ctx.merchant.id} voice`,
      mp3Path,
    );

    await db
      .update(merchants)
      .set({ defaultVoiceId: voice_id })
      .where(eq(merchants.id, ctx.merchant.id));

    return c.json({ voice_id, durationSecs });
  } catch (err) {
    if (err instanceof MissingEmailError) {
      return c.json({ error: "no_email_on_clerk_user" }, 400);
    }
    if (err instanceof ElevenLabsError) {
      console.error("[onboarding/voice/upload] ElevenLabs error:", err.status, err.body);
      return c.json({ error: "elevenlabs_failed", status: err.status }, 502);
    }
    console.error("[onboarding/voice/upload]", err);
    return c.json({ error: "voice_upload_failed" }, 500);
  } finally {
    if (m4aPath) await safeUnlink(m4aPath);
    if (mp3Path) await safeUnlink(mp3Path);
  }
});

onboardingRoute.post("/onboarding/knowledge", requireAuth, async (c) => {
  const { userId } = getAuth(c);

  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const content =
    payload && typeof payload === "object" && "content" in payload
      ? String((payload as { content: unknown }).content ?? "").trim()
      : "";
  if (content.length < 40) {
    return c.json(
      {
        error: "content_too_short",
        message: "Tell Dunner a bit more — at least 40 characters.",
      },
      400,
    );
  }

  try {
    const ctx = await loadMerchantContext(userId);
    const docName = `${ctx.merchant.name} product knowledge`;

    const { id: elevenLabsDocId } = await createKnowledgeBaseDoc(
      docName,
      content,
    );

    // Replace any existing rows (skips, prior drafts) so /state's
    // "non-null eleven_labs_doc_id" check has one canonical row.
    await db
      .delete(knowledgeBaseDocs)
      .where(eq(knowledgeBaseDocs.merchantId, ctx.merchant.id));

    const [inserted] = await db
      .insert(knowledgeBaseDocs)
      .values({
        merchantId: ctx.merchant.id,
        title: docName,
        content,
        elevenLabsDocId,
      })
      .returning();
    if (!inserted) {
      return c.json({ error: "failed_to_persist_kb_doc" }, 500);
    }

    // Auto-provision the per-merchant agent the moment we have voice + KB.
    // If an agent already exists for this merchant, leave it alone — Step 8
    // will introduce a "rebuild agent" flow when tools change.
    let agentId = ctx.merchant.agentId;
    if (!agentId && ctx.merchant.defaultVoiceId) {
      const { agent_id } = await createAgent({
        name: `Dunner: ${ctx.merchant.name}`,
        prompt: buildSystemPrompt(ctx.merchant.name),
        firstMessage: buildFirstMessage(ctx.merchant.name),
        voiceId: ctx.merchant.defaultVoiceId,
        knowledgeBaseDocId: elevenLabsDocId,
        knowledgeBaseDocName: docName,
      });
      agentId = agent_id;
      await db
        .update(merchants)
        .set({ agentId })
        .where(eq(merchants.id, ctx.merchant.id));
    }

    return c.json({
      docId: inserted.id,
      elevenLabsDocId,
      agentId,
    });
  } catch (err) {
    if (err instanceof MissingEmailError) {
      return c.json({ error: "no_email_on_clerk_user" }, 400);
    }
    if (err instanceof ElevenLabsError) {
      console.error(
        "[onboarding/knowledge] ElevenLabs error:",
        err.status,
        err.body,
      );
      return c.json({ error: "elevenlabs_failed", status: err.status }, 502);
    }
    console.error("[onboarding/knowledge]", err);
    return c.json({ error: "knowledge_failed" }, 500);
  }
});

function refreshErrorHtml(message: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Dunner</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #0F0F11; color: #EEEEEF; padding: 32px; line-height: 1.5; }
      h1 { font-size: 20px; margin-bottom: 12px; }
      p  { color: #A0A0AB; font-size: 15px; }
    </style>
  </head>
  <body>
    <h1>Onboarding link expired</h1>
    <p>${message}</p>
    <p>Please return to the Dunner app and tap "Resume onboarding".</p>
  </body>
</html>`;
}
