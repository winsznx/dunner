import "../env";

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  callAttempts,
  failedInvoices,
  merchants,
  recoveries,
} from "../db/schema";
import { stripe } from "./stripe";
import { sendSms } from "./twilio";

type ResolvedContext = {
  merchant: typeof merchants.$inferSelect;
  recovery: typeof recoveries.$inferSelect;
  failedInvoice: typeof failedInvoices.$inferSelect;
  callAttempt: typeof callAttempts.$inferSelect | null;
};

export class ToolError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export async function resolveCallContext(
  merchantId: string,
  recoveryId: string,
): Promise<ResolvedContext> {
  const merchant = await db.query.merchants.findFirst({
    where: eq(merchants.id, merchantId),
  });
  if (!merchant) throw new ToolError("merchant_not_found", "Merchant missing");

  const recovery = await db.query.recoveries.findFirst({
    where: and(
      eq(recoveries.id, recoveryId),
      eq(recoveries.merchantId, merchantId),
    ),
  });
  if (!recovery) throw new ToolError("recovery_not_found", "Recovery missing or not yours");

  const failedInvoice = await db.query.failedInvoices.findFirst({
    where: eq(failedInvoices.id, recovery.failedInvoiceId),
  });
  if (!failedInvoice)
    throw new ToolError("failed_invoice_not_found", "Failed invoice missing");

  const callAttempt =
    (await db.query.callAttempts.findFirst({
      where: eq(callAttempts.recoveryId, recovery.id),
      orderBy: desc(callAttempts.initiatedAt),
    })) ?? null;

  return { merchant, recovery, failedInvoice, callAttempt };
}

export async function appendToolCall(
  callAttemptId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<void> {
  const entry = { name, args, timestamp: Date.now() };
  await db
    .update(callAttempts)
    .set({
      toolCallsFired: sql`COALESCE(${callAttempts.toolCallsFired}, '[]'::jsonb) || ${JSON.stringify([entry])}::jsonb`,
    })
    .where(eq(callAttempts.id, callAttemptId));
}

// ----------------- Tools -----------------

export async function pauseSubscription(
  ctx: ResolvedContext,
  params: {
    behavior?: "void" | "keep_as_draft" | "mark_uncollectible";
    resumes_in_days?: 7 | 14 | 30;
  },
): Promise<{ ok: true; status: string; resumes_at: number }> {
  if (!ctx.failedInvoice.stripeSubscriptionId) {
    throw new ToolError("no_subscription", "Invoice has no linked subscription");
  }
  const behavior = params.behavior ?? "keep_as_draft";
  const days = params.resumes_in_days ?? 30;
  const resumesAt = Math.floor(Date.now() / 1000) + days * 86_400;

  await stripe.subscriptions.update(
    ctx.failedInvoice.stripeSubscriptionId,
    {
      pause_collection: { behavior, resumes_at: resumesAt },
    },
    {
      stripeAccount: ctx.merchant.stripeAccountId!,
      idempotencyKey: `pause-${ctx.recovery.id}-${days}`,
    },
  );

  return { ok: true, status: "paused", resumes_at: resumesAt };
}

export async function applyCoupon(
  ctx: ResolvedContext,
  params: {
    percent_off?: 5 | 10 | 15 | 20;
    duration?: "once" | "repeating";
    duration_in_months?: number;
  },
): Promise<{ ok: true; coupon_id: string; percent_off: number }> {
  if (!ctx.failedInvoice.stripeSubscriptionId) {
    throw new ToolError("no_subscription", "Invoice has no linked subscription");
  }
  const percentOff = params.percent_off ?? 10;
  if (percentOff < 1 || percentOff > 50) {
    throw new ToolError("bad_percent", "percent_off must be 1..50");
  }
  const duration = params.duration ?? "once";

  const coupon = await stripe.coupons.create(
    {
      percent_off: percentOff,
      duration,
      duration_in_months:
        duration === "repeating" ? params.duration_in_months ?? 3 : undefined,
      name: `Recovery ${percentOff}% off (${ctx.recovery.id.slice(0, 8)})`,
    },
    {
      stripeAccount: ctx.merchant.stripeAccountId!,
      idempotencyKey: `coupon-${ctx.recovery.id}-${percentOff}-${duration}`,
    },
  );

  await stripe.subscriptions.update(
    ctx.failedInvoice.stripeSubscriptionId,
    { discounts: [{ coupon: coupon.id }] },
    {
      stripeAccount: ctx.merchant.stripeAccountId!,
      idempotencyKey: `sub-coupon-${ctx.recovery.id}`,
    },
  );

  return { ok: true, coupon_id: coupon.id, percent_off: percentOff };
}

export async function sendRecoveryLink(
  ctx: ResolvedContext,
): Promise<{ ok: true; url: string; sms_sid?: string }> {
  // Re-fetch the invoice on the connected account to get a fresh hosted URL.
  const invoice = await stripe.invoices.retrieve(
    ctx.failedInvoice.stripeInvoiceId,
    {},
    { stripeAccount: ctx.merchant.stripeAccountId! },
  );
  const url = invoice.hosted_invoice_url;
  if (!url) {
    throw new ToolError("no_hosted_url", "Stripe didn't return a hosted invoice URL");
  }

  let sms_sid: string | undefined;
  if (ctx.failedInvoice.customerPhone) {
    try {
      const r = await sendSms({
        to: ctx.failedInvoice.customerPhone,
        body: `${ctx.merchant.name}: pay your past-due invoice here — ${url}`,
      });
      sms_sid = r.sid;
    } catch (err) {
      console.warn("[send_recovery_link] SMS failed:", err);
    }
  }

  return { ok: true, url, sms_sid };
}

export async function logCallback(
  ctx: ResolvedContext,
  params: { preferred_time?: string; notes?: string },
): Promise<{ ok: true }> {
  // Record on the call_attempts row; full callback queue is a Step 12 polish.
  if (ctx.callAttempt) {
    await appendToolCall(ctx.callAttempt.id, "log_callback", params);
  }
  await db
    .update(recoveries)
    .set({
      finalOutcome: "customer_cancelled",
      updatedAt: new Date(),
    })
    .where(eq(recoveries.id, ctx.recovery.id));
  return { ok: true };
}

export async function logChurn(
  ctx: ResolvedContext,
  params: { reason?: string; notes?: string },
): Promise<{ ok: true }> {
  if (ctx.callAttempt) {
    await appendToolCall(ctx.callAttempt.id, "log_churn", params);
  }
  await db
    .update(recoveries)
    .set({
      state: "CHURNED",
      finalOutcome: "customer_cancelled",
      updatedAt: new Date(),
    })
    .where(eq(recoveries.id, ctx.recovery.id));
  return { ok: true };
}
