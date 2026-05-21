import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  callAttempts,
  elevenLabsWebhookEvents,
  recoveries,
} from "../db/schema";
import { requireEnv } from "../env";
import { broadcastCallEvent, broadcastRecoveryEvent } from "../lib/broadcast";
import { captureWithContext } from "../lib/sentry";

export const elevenLabsWebhookRoute = new Hono();

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

elevenLabsWebhookRoute.post("/webhooks/elevenlabs", async (c) => {
  const signatureHeader =
    c.req.header("elevenlabs-signature") ??
    c.req.header("ElevenLabs-Signature") ??
    "";
  const rawBody = await c.req.text();

  const secret = requireEnv("ELEVENLABS_WEBHOOK_SECRET");
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const presented = signatureHeader.replace(/^sha256=/, "");

  if (
    presented.length !== expected.length ||
    !timingSafeEqual(Buffer.from(presented), Buffer.from(expected))
  ) {
    return c.json({ error: "invalid_signature" }, 401);
  }

  let payload: ELWebhook;
  try {
    payload = JSON.parse(rawBody) as ELWebhook;
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const conversationId =
    payload.data?.conversation_id ?? payload.data?.metadata?.conversation_id;
  if (!conversationId) {
    return c.json({ error: "missing_conversation_id" }, 400);
  }

  try {
    await db.transaction(async (tx) => {
      // Idempotency key: conversation_id is PK on eleven_labs_webhook_events.
      // For events that arrive multiple times for the same conversation (e.g.
      // post_call_transcription vs post_call_audio), append event_type into
      // a synthetic key so both can land.
      const eventKey = `${conversationId}:${payload.type}`;
      await tx.insert(elevenLabsWebhookEvents).values({
        conversationId: eventKey,
        eventType: payload.type,
      });

      switch (payload.type) {
        case "post_call_transcription":
          await handlePostCallTranscription(tx, conversationId, payload.data);
          break;
        case "call_initiation_failure":
          await handleCallInitiationFailure(tx, conversationId, payload.data);
          break;
        case "post_call_audio":
          // V1: acknowledge without storage. Step 11+ can persist to S3.
          break;
        default:
          console.log("[el webhook] ignored event:", payload.type);
      }
    });
    return c.json({ received: true });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return c.json({ received: true, duplicate: true });
    }
    console.error("[el webhook] handler error:", err);
    captureWithContext(err, { surface: "el_webhook" });
    return c.json({ error: "el_webhook_failed" }, 500);
  }
});

type ELWebhook = {
  type: string;
  data: {
    conversation_id?: string;
    metadata?: {
      conversation_id?: string;
      call_duration_secs?: number;
      cost?: number;
      cost_usd?: number;
    };
    transcript?: Array<{
      role: "agent" | "user";
      message: string;
      time_in_call_secs: number;
    }>;
    analysis?: {
      transcript_summary?: string;
    };
    failure_reason?: string;
    [key: string]: unknown;
  };
};

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code === "23505" || e.cause?.code === "23505";
}

async function handlePostCallTranscription(
  tx: Tx,
  conversationId: string,
  data: ELWebhook["data"],
): Promise<void> {
  const attempt = await tx.query.callAttempts.findFirst({
    where: eq(callAttempts.elevenLabsConversationId, conversationId),
  });
  if (!attempt) {
    console.warn(
      "[el webhook] post_call_transcription for unknown conversation:",
      conversationId,
    );
    return;
  }

  const durationSecs = data.metadata?.call_duration_secs ?? null;
  const costRaw = data.metadata?.cost_usd ?? data.metadata?.cost ?? null;
  const costUsd = costRaw === null ? null : String(costRaw);

  // Decide outcome from tool_calls_fired on the attempt row.
  const firedNames = ((attempt.toolCallsFired ?? []) as Array<{ name: string }>)
    .map((t) => t.name);
  const agreementTools = new Set([
    "pause_subscription",
    "apply_coupon",
    "downgrade_plan",
    "swap_payment_method",
    "send_recovery_link",
  ]);
  const churnFired = firedNames.includes("log_churn");
  const abuseEnded = firedNames.includes("end_call_abuse");
  const agreementFired = firedNames.some((n) => agreementTools.has(n));

  const callOutcome: "agreement_reached" | "customer_cancelled" | "abusive_termination" | "no_agreement" =
    agreementFired
      ? "agreement_reached"
      : churnFired
        ? "customer_cancelled"
        : abuseEnded
          ? "abusive_termination"
          : "no_agreement";

  await tx
    .update(callAttempts)
    .set({
      endedAt: new Date(),
      durationSecs,
      costUsd,
      transcript: data.transcript ?? null,
      transcriptSummary: data.analysis?.transcript_summary ?? null,
      outcome: callOutcome,
    })
    .where(eq(callAttempts.id, attempt.id));

  // Look up recovery + merchant for state transition + merchant broadcast.
  const recovery = await tx.query.recoveries.findFirst({
    where: eq(recoveries.id, attempt.recoveryId),
  });
  if (!recovery) return;
  const merchant = await tx.query.merchants.findFirst({
    where: (m, { eq: eq2 }) => eq2(m.id, recovery.merchantId),
  });
  const maxRetries = merchant?.maxRetryAttempts ?? 4;

  let nextState:
    | "RECOVERED_PENDING"
    | "CHURNED"
    | "ABUSE_TERMINATED"
    | "RETRY_QUEUED"
    | "ABANDONED";
  let scheduledFor: Date | null = null;
  let finalOutcome:
    | "agreement_reached"
    | "customer_cancelled"
    | "abusive_termination"
    | "no_agreement"
    | null = null;

  if (agreementFired) {
    nextState = "RECOVERED_PENDING";
  } else if (churnFired) {
    nextState = "CHURNED";
    finalOutcome = "customer_cancelled";
  } else if (abuseEnded) {
    nextState = "ABUSE_TERMINATED";
    finalOutcome = "abusive_termination";
  } else if (recovery.attempts < maxRetries) {
    nextState = "RETRY_QUEUED";
    scheduledFor = new Date(Date.now() + 24 * 60 * 60_000);
  } else {
    nextState = "ABANDONED";
    finalOutcome = "no_agreement";
  }

  await tx
    .update(recoveries)
    .set({
      state: nextState,
      scheduledFor,
      finalOutcome,
      updatedAt: new Date(),
    })
    .where(eq(recoveries.id, recovery.id));

  broadcastRecoveryEvent(recovery.id, recovery.merchantId, {
    type: "call.ended",
    data: {
      recoveryId: recovery.id,
      durationSecs: durationSecs ?? 0,
      summary: data.analysis?.transcript_summary ?? "",
      outcome: callOutcome,
    },
  });
}

async function handleCallInitiationFailure(
  tx: Tx,
  conversationId: string,
  data: ELWebhook["data"],
): Promise<void> {
  const attempt = await tx.query.callAttempts.findFirst({
    where: eq(callAttempts.elevenLabsConversationId, conversationId),
  });

  const failureReason = data.failure_reason ?? "unknown";
  const outcome =
    failureReason === "busy"
      ? "busy"
      : failureReason === "no-answer" || failureReason === "no_answer"
        ? "no_answer"
        : "unknown_failure";

  if (attempt) {
    await tx
      .update(callAttempts)
      .set({
        endedAt: new Date(),
        outcome,
      })
      .where(eq(callAttempts.id, attempt.id));
  }

  // Find the recovery by attempt → otherwise we can't update state.
  if (!attempt) return;

  const recovery = await tx.query.recoveries.findFirst({
    where: eq(recoveries.id, attempt.recoveryId),
  });
  if (!recovery) return;

  const merchant = await tx.query.merchants.findFirst({
    where: (m, { eq: eq2 }) => eq2(m.id, recovery.merchantId),
  });
  const maxRetries = merchant?.maxRetryAttempts ?? 4;

  if (recovery.attempts < maxRetries) {
    await tx
      .update(recoveries)
      .set({
        state: "RETRY_QUEUED",
        scheduledFor: new Date(Date.now() + 24 * 60 * 60_000),
        updatedAt: new Date(),
      })
      .where(eq(recoveries.id, recovery.id));
  } else {
    await tx
      .update(recoveries)
      .set({
        state: "ABANDONED",
        finalOutcome: outcome,
        updatedAt: new Date(),
      })
      .where(eq(recoveries.id, recovery.id));
  }

  const wsReason: "busy" | "no-answer" | "unknown" =
    outcome === "busy"
      ? "busy"
      : outcome === "no_answer"
        ? "no-answer"
        : "unknown";
  broadcastRecoveryEvent(recovery.id, recovery.merchantId, {
    type: "call.failed_to_connect",
    data: { recoveryId: recovery.id, reason: wsReason },
  });
}

// Silence unused import for sql
void sql;
