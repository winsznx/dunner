import { Hono } from "hono";
import { stream } from "hono/streaming";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import {
  agentApiTokens,
  callAttempts,
  failedInvoices,
  knowledgeBaseDocs,
  merchants,
  recoveries,
  users,
} from "../db/schema";
import { clerk } from "../services/clerk";
import { getAuth, requireAuth } from "../middleware/auth";
import { loadMerchantContext, MissingEmailError } from "../services/merchant";
import { requireEnv } from "../env";

type Env = {
  Variables: {
    auth: { userId: string; sessionId: string | null };
  };
};

export const agentConfigRoute = new Hono<Env>();

agentConfigRoute.use("/agent/*", requireAuth);

/**
 * Returns the merchant's current knowledge base content so the edit screen
 * can pre-populate. Concatenates docs in insertion order — in practice there's
 * one doc per merchant (the `/onboarding/knowledge` POST replaces).
 */
agentConfigRoute.get("/agent/knowledge", async (c) => {
  const { userId } = getAuth(c);
  try {
    const ctx = await loadMerchantContext(userId);
    const docs = await db
      .select({ content: knowledgeBaseDocs.content })
      .from(knowledgeBaseDocs)
      .where(eq(knowledgeBaseDocs.merchantId, ctx.merchant.id));
    const content = docs.map((d) => d.content).join("\n\n");
    return c.json({ content });
  } catch (err) {
    if (err instanceof MissingEmailError) {
      return c.json({ error: "no_email_on_clerk_user" }, 400);
    }
    console.error("[agent/knowledge GET]", err);
    return c.json({ error: "knowledge_get_failed" }, 500);
  }
});

agentConfigRoute.get("/agent/config", async (c) => {
  const { userId } = getAuth(c);
  try {
    const ctx = await loadMerchantContext(userId);
    const kbCountRow = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(knowledgeBaseDocs)
      .where(eq(knowledgeBaseDocs.merchantId, ctx.merchant.id));

    const voicePreviewAvailable =
      !!ctx.merchant.defaultVoiceId &&
      ctx.merchant.defaultVoiceId !== "__SKIP__";

    return c.json({
      merchant: {
        name: ctx.merchant.name,
        applicationFeePercent: ctx.merchant.applicationFeePercent,
        workingHoursStart: ctx.merchant.workingHoursStart,
        workingHoursEnd: ctx.merchant.workingHoursEnd,
        timezone: ctx.merchant.timezone,
        maxRetryAttempts: ctx.merchant.maxRetryAttempts,
      },
      agent: {
        agentId: ctx.merchant.agentId,
        defaultVoiceId: ctx.merchant.defaultVoiceId,
        agentPhoneNumberId: ctx.merchant.agentPhoneNumberId,
        knowledgeBaseDocsCount: kbCountRow[0]?.count ?? 0,
      },
      voicePreviewAvailable,
    });
  } catch (err) {
    if (err instanceof MissingEmailError) {
      return c.json({ error: "no_email_on_clerk_user" }, 400);
    }
    console.error("[agent/config GET]", err);
    return c.json({ error: "config_failed" }, 500);
  }
});

const patchSchema = z
  .object({
    applicationFeePercent: z.number().int().min(5).max(25).optional(),
    workingHoursStart: z.number().int().min(0).max(23).optional(),
    workingHoursEnd: z.number().int().min(0).max(23).optional(),
    timezone: z.string().min(1).max(64).optional(),
    maxRetryAttempts: z.number().int().min(1).max(6).optional(),
  })
  .refine(
    (v) =>
      v.workingHoursStart === undefined ||
      v.workingHoursEnd === undefined ||
      v.workingHoursStart < v.workingHoursEnd,
    {
      message: "workingHoursStart must be < workingHoursEnd",
      path: ["workingHoursStart"],
    },
  );

agentConfigRoute.patch("/agent/config", async (c) => {
  const { userId } = getAuth(c);
  try {
    const ctx = await loadMerchantContext(userId);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "bad_payload", issues: parsed.error.issues }, 400);
    }

    const updates = parsed.data;
    if (Object.keys(updates).length === 0) {
      return c.json({ ok: true, unchanged: true });
    }

    await db
      .update(merchants)
      .set(updates)
      .where(eq(merchants.id, ctx.merchant.id));

    return c.json({ ok: true, applied: updates });
  } catch (err) {
    if (err instanceof MissingEmailError) {
      return c.json({ error: "no_email_on_clerk_user" }, 400);
    }
    console.error("[agent/config PATCH]", err);
    return c.json({ error: "config_patch_failed" }, 500);
  }
});

agentConfigRoute.post("/agent/test-voice", async (c) => {
  const { userId } = getAuth(c);
  try {
    const ctx = await loadMerchantContext(userId);
    if (
      !ctx.merchant.defaultVoiceId ||
      ctx.merchant.defaultVoiceId === "__SKIP__"
    ) {
      return c.json({ error: "no_voice_configured" }, 400);
    }

    const elKey = requireEnv("EL_KEY");
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ctx.merchant.defaultVoiceId}?optimize_streaming_latency=2&output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": elKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: "Hi! This is your Dunner voice. Whenever a customer's card declines, I'll call them sounding exactly like this.",
          model_id: "eleven_turbo_v2_5",
        }),
      },
    );

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text();
      console.error("[agent/test-voice] EL error:", upstream.status, errText);
      return c.json({ error: "tts_failed", status: upstream.status }, 502);
    }

    c.header("Content-Type", "audio/mpeg");
    c.header("Cache-Control", "no-store");
    return stream(c, async (s) => {
      const reader = upstream.body!.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) await s.write(value);
        }
      } finally {
        reader.releaseLock();
      }
    });
  } catch (err) {
    if (err instanceof MissingEmailError) {
      return c.json({ error: "no_email_on_clerk_user" }, 400);
    }
    console.error("[agent/test-voice]", err);
    return c.json({ error: "test_voice_failed" }, 500);
  }
});

/**
 * Reset the merchant's cloned voice so they can re-record. Clears
 * default_voice_id; the root layout will route them back to the IVC step.
 * We don't call ElevenLabs to delete the old voice — orphaned voices in the
 * EL workspace are harmless and the merchant may want to re-use the prior
 * audio if the new attempt is worse.
 */
agentConfigRoute.post("/agent/reset-voice", async (c) => {
  const { userId } = getAuth(c);
  try {
    const ctx = await loadMerchantContext(userId);
    await db
      .update(merchants)
      .set({ defaultVoiceId: null })
      .where(eq(merchants.id, ctx.merchant.id));
    return c.json({ ok: true });
  } catch (err) {
    if (err instanceof MissingEmailError) {
      return c.json({ error: "no_email_on_clerk_user" }, 400);
    }
    console.error("[agent/reset-voice]", err);
    return c.json({ error: "reset_voice_failed" }, 500);
  }
});

/** Delete all knowledge base docs so the merchant can re-author. */
agentConfigRoute.post("/agent/reset-knowledge", async (c) => {
  const { userId } = getAuth(c);
  try {
    const ctx = await loadMerchantContext(userId);
    await db
      .delete(knowledgeBaseDocs)
      .where(eq(knowledgeBaseDocs.merchantId, ctx.merchant.id));
    return c.json({ ok: true });
  } catch (err) {
    if (err instanceof MissingEmailError) {
      return c.json({ error: "no_email_on_clerk_user" }, 400);
    }
    console.error("[agent/reset-knowledge]", err);
    return c.json({ error: "reset_knowledge_failed" }, 500);
  }
});

/**
 * Disconnect the merchant's Stripe Connect account.
 *
 * Strategy: we don't call Stripe to formally "delete" the account (Connect
 * accounts can't be deleted via API once they have a non-zero payout balance).
 * Instead we de-associate by clearing the merchant's stripe_account_id +
 * marking status as 'disconnected'. New webhooks for the old account_id are
 * ignored (no merchant row matches). The merchant can connect a new account
 * via the onboarding flow.
 */
agentConfigRoute.post("/agent/disconnect-stripe", async (c) => {
  const { userId } = getAuth(c);
  try {
    const ctx = await loadMerchantContext(userId);
    await db
      .update(merchants)
      .set({
        stripeAccountId: null,
        stripeAccountStatus: "disconnected",
      })
      .where(eq(merchants.id, ctx.merchant.id));
    return c.json({ ok: true });
  } catch (err) {
    if (err instanceof MissingEmailError) {
      return c.json({ error: "no_email_on_clerk_user" }, 400);
    }
    console.error("[agent/disconnect-stripe]", err);
    return c.json({ error: "disconnect_failed" }, 500);
  }
});

/**
 * Delete the merchant workspace AND the underlying Clerk user.
 * Cascades: call_attempts → recoveries → failed_invoices → knowledge → tokens
 * → users → merchant → clerk user.
 */
agentConfigRoute.delete("/agent/account", async (c) => {
  const { userId } = getAuth(c);
  try {
    const ctx = await loadMerchantContext(userId);
    const merchantId = ctx.merchant.id;

    await db.transaction(async (tx) => {
      // Get all recovery ids for this merchant so we can null call_attempts.
      const rRows = await tx
        .select({ id: recoveries.id })
        .from(recoveries)
        .where(eq(recoveries.merchantId, merchantId));
      const recoveryIds = rRows.map((r) => r.id);
      if (recoveryIds.length > 0) {
        for (const rid of recoveryIds) {
          await tx.delete(callAttempts).where(eq(callAttempts.recoveryId, rid));
        }
      }
      await tx.delete(recoveries).where(eq(recoveries.merchantId, merchantId));
      await tx
        .delete(failedInvoices)
        .where(eq(failedInvoices.merchantId, merchantId));
      await tx
        .delete(knowledgeBaseDocs)
        .where(eq(knowledgeBaseDocs.merchantId, merchantId));
      await tx
        .delete(agentApiTokens)
        .where(eq(agentApiTokens.merchantId, merchantId));
      await tx.delete(users).where(eq(users.merchantId, merchantId));
      await tx.delete(merchants).where(eq(merchants.id, merchantId));
    });

    // Best-effort: delete the Clerk user too so they can re-sign-up cleanly.
    try {
      await clerk.users.deleteUser(userId);
    } catch (err) {
      console.warn("[agent/account] clerk delete failed:", err);
    }

    return c.json({ ok: true });
  } catch (err) {
    if (err instanceof MissingEmailError) {
      return c.json({ error: "no_email_on_clerk_user" }, 400);
    }
    console.error("[agent/account] delete failed:", err);
    return c.json({ error: "delete_failed" }, 500);
  }
});
