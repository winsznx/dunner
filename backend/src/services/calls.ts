import "../env";

import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { callAttempts, failedInvoices, merchants, recoveries } from "../db/schema";
import { requireEnv } from "../env";
import { broadcastCallEvent, broadcastRecoveryEvent } from "../lib/broadcast";

const EL_BASE = "https://api.elevenlabs.io";
const E164 = /^\+[1-9]\d{6,14}$/;

// Per https://docs.stripe.com/currencies#zero-decimal — these currencies do
// not use a "minor unit" subdivision; the amount field is the actual count.
const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

export function formatAmount(minorUnits: number, currency: string): string {
  const upper = currency.toUpperCase();
  const value = ZERO_DECIMAL_CURRENCIES.has(upper)
    ? minorUnits
    : minorUnits / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: upper,
    }).format(value);
  } catch {
    return `${value} ${upper}`;
  }
}

export type InitiateResult =
  | {
      ok: true;
      conversationId: string;
      callSid: string;
    }
  | {
      ok: false;
      reason:
        | "missing_voice"
        | "missing_agent"
        | "missing_phone_number_id"
        | "invalid_customer_phone"
        | "max_attempts"
        | "el_4xx"
        | "el_5xx"
        | "already_in_flight";
      detail?: string;
    };

type FailureReason =
  | "missing_voice"
  | "missing_agent"
  | "missing_phone_number_id"
  | "invalid_customer_phone"
  | "max_attempts"
  | "el_4xx"
  | "el_5xx"
  | "already_in_flight";

type Prep =
  | { kind: "skip"; reason: FailureReason }
  | {
      kind: "abandon";
      reason: FailureReason;
      detail?: string;
      merchantId?: string;
    }
  | {
      kind: "go";
      recoveryId: string;
      merchantId: string;
      agentId: string;
      phoneNumberId: string;
      toNumber: string;
      dynamicVariables: Record<string, string>;
    };

export async function initiateRecoveryCall(
  recoveryId: string,
): Promise<InitiateResult> {
  // Phase 1: lock + preflight + state transition + payload prep — all in tx.
  const prep: Prep = await db.transaction(async (tx) => {
    // FOR UPDATE SKIP LOCKED so concurrent scheduler ticks don't double-fire.
    const locked = await tx
      .select()
      .from(recoveries)
      .where(eq(recoveries.id, recoveryId))
      .for("update", { skipLocked: true })
      .limit(1);

    const recovery = locked[0];
    if (!recovery) {
      return { kind: "skip", reason: "already_in_flight" as const };
    }

    if (recovery.state !== "QUEUED" && recovery.state !== "SCHEDULED") {
      return { kind: "skip", reason: "already_in_flight" as const };
    }

    const failedInvoice = await tx.query.failedInvoices.findFirst({
      where: eq(failedInvoices.id, recovery.failedInvoiceId),
    });
    const merchant = await tx.query.merchants.findFirst({
      where: eq(merchants.id, recovery.merchantId),
    });
    if (!failedInvoice || !merchant) {
      await tx
        .update(recoveries)
        .set({ state: "ABANDONED", finalOutcome: "unknown_failure", updatedAt: new Date() })
        .where(eq(recoveries.id, recovery.id));
      return { kind: "abandon", reason: "missing_voice" as const };
    }

    const maxRetries = merchant.maxRetryAttempts ?? 4;
    if (recovery.attempts >= maxRetries) {
      await tx
        .update(recoveries)
        .set({ state: "ABANDONED", finalOutcome: "no_agreement", updatedAt: new Date() })
        .where(eq(recoveries.id, recovery.id));
      return { kind: "abandon", reason: "max_attempts" as const };
    }

    if (!merchant.defaultVoiceId || merchant.defaultVoiceId === "__SKIP__") {
      await tx
        .update(recoveries)
        .set({ state: "ABANDONED", finalOutcome: "unknown_failure", updatedAt: new Date() })
        .where(eq(recoveries.id, recovery.id));
      return { kind: "abandon", reason: "missing_voice" as const };
    }

    if (!merchant.agentId) {
      await tx
        .update(recoveries)
        .set({ state: "ABANDONED", finalOutcome: "unknown_failure", updatedAt: new Date() })
        .where(eq(recoveries.id, recovery.id));
      return { kind: "abandon", reason: "missing_agent" as const };
    }

    if (
      !failedInvoice.customerPhone ||
      !E164.test(failedInvoice.customerPhone)
    ) {
      await tx
        .update(recoveries)
        .set({ state: "ABANDONED", finalOutcome: "unknown_failure", updatedAt: new Date() })
        .where(eq(recoveries.id, recovery.id));
      return {
        kind: "abandon",
        reason: "invalid_customer_phone" as const,
        detail: failedInvoice.customerPhone ?? "null",
      };
    }

    const phoneNumberId =
      merchant.agentPhoneNumberId ??
      process.env.ELEVENLABS_PHONE_NUMBER_ID ??
      null;
    if (!phoneNumberId) {
      await tx
        .update(recoveries)
        .set({ state: "ABANDONED", finalOutcome: "unknown_failure", updatedAt: new Date() })
        .where(eq(recoveries.id, recovery.id));
      return { kind: "abandon", reason: "missing_phone_number_id" as const };
    }

    // Commit-time state transition.
    await tx
      .update(recoveries)
      .set({
        state: "CALLING",
        attempts: sql`${recoveries.attempts} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(recoveries.id, recovery.id));

    return {
      kind: "go" as const,
      recoveryId: recovery.id,
      merchantId: recovery.merchantId,
      agentId: merchant.agentId,
      phoneNumberId,
      toNumber: failedInvoice.customerPhone,
      dynamicVariables: {
        customer_name: failedInvoice.customerName ?? "there",
        merchant_name: merchant.name,
        plan: failedInvoice.planName ?? "your subscription",
        amount_due: formatAmount(failedInvoice.amountDue, failedInvoice.currency),
        currency: failedInvoice.currency.toUpperCase(),
        // Used by tool URLs (substituted server-side by EL before the call
        // fires) so every tool invocation carries the recovery id.
        recovery_id: recovery.id,
      },
    };
  });

  if (prep.kind === "skip") {
    return { ok: false, reason: prep.reason };
  }
  if (prep.kind === "abandon") {
    console.warn("[calls] recovery abandoned:", prep.reason, prep);
    broadcastCallEvent(recoveryId, {
      type: "recovery.failed",
      data: { recoveryId, reason: prep.reason },
    });
    return { ok: false, reason: prep.reason, detail: prep.detail };
  }

  // Phase 2: outside any DB tx, hit EL. If EL returns 4xx/5xx, transition
  // recovery to ABANDONED or RETRY_QUEUED and decrement attempts.
  const elKey = requireEnv("EL_KEY");
  const body = {
    agent_id: prep.agentId,
    agent_phone_number_id: prep.phoneNumberId,
    to_number: prep.toNumber,
    conversation_initiation_client_data: {
      dynamic_variables: prep.dynamicVariables,
    },
  };

  let res: Response;
  try {
    res = await fetch(`${EL_BASE}/v1/convai/twilio/outbound-call`, {
      method: "POST",
      headers: {
        "xi-api-key": elKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("[calls] EL network error:", err);
    await db
      .update(recoveries)
      .set({
        state: "RETRY_QUEUED",
        attempts: sql`${recoveries.attempts} - 1`,
        scheduledFor: new Date(Date.now() + 5 * 60_000),
        updatedAt: new Date(),
      })
      .where(eq(recoveries.id, prep.recoveryId));
    broadcastCallEvent(prep.recoveryId, {
      type: "call.failed_to_connect",
      data: { recoveryId: prep.recoveryId, reason: "unknown" },
    });
    return { ok: false, reason: "el_5xx", detail: String(err) };
  }

  const text = await res.text();
  if (!res.ok) {
    if (res.status >= 500) {
      console.error("[calls] EL 5xx:", res.status, text);
      await db
        .update(recoveries)
        .set({
          state: "RETRY_QUEUED",
          attempts: sql`${recoveries.attempts} - 1`,
          scheduledFor: new Date(Date.now() + 5 * 60_000),
          updatedAt: new Date(),
        })
        .where(eq(recoveries.id, prep.recoveryId));
      broadcastCallEvent(prep.recoveryId, {
        type: "call.failed_to_connect",
        data: { recoveryId: prep.recoveryId, reason: "unknown" },
      });
      return { ok: false, reason: "el_5xx", detail: text };
    }
    console.error("[calls] EL 4xx:", res.status, text);
    await db
      .update(recoveries)
      .set({
        state: "ABANDONED",
        finalOutcome: "unknown_failure",
        updatedAt: new Date(),
      })
      .where(eq(recoveries.id, prep.recoveryId));
    broadcastCallEvent(prep.recoveryId, {
      type: "recovery.failed",
      data: { recoveryId: prep.recoveryId, reason: "el_rejected" },
    });
    return { ok: false, reason: "el_4xx", detail: text };
  }

  const parsed = JSON.parse(text) as {
    conversation_id?: string;
    callSid?: string;
  };
  if (!parsed.conversation_id || !parsed.callSid) {
    console.error("[calls] EL 2xx without ids:", text);
    await db
      .update(recoveries)
      .set({
        state: "ABANDONED",
        finalOutcome: "unknown_failure",
        updatedAt: new Date(),
      })
      .where(eq(recoveries.id, prep.recoveryId));
    return { ok: false, reason: "el_4xx", detail: text };
  }

  await db.insert(callAttempts).values({
    recoveryId: prep.recoveryId,
    elevenLabsConversationId: parsed.conversation_id,
    twilioCallSid: parsed.callSid,
  });

  broadcastRecoveryEvent(prep.recoveryId, prep.merchantId, {
    type: "call.initiated",
    data: {
      recoveryId: prep.recoveryId,
      conversationId: parsed.conversation_id,
    },
  });

  return {
    ok: true,
    conversationId: parsed.conversation_id,
    callSid: parsed.callSid,
  };
}
