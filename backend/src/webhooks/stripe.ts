import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "../db/client";
import {
  broadcastCallEvent,
  broadcastMerchantEvent,
  broadcastRecoveryEvent,
} from "../lib/broadcast";
import { captureWithContext } from "../lib/sentry";
import {
  callAttempts,
  failedInvoices,
  merchants,
  recoveries,
  stripeWebhookEvents,
} from "../db/schema";
import { stripe } from "../services/stripe";
import { triggerScheduler } from "../services/scheduler";
import { requireEnv } from "../env";

export const stripeWebhookRoute = new Hono();

stripeWebhookRoute.post("/webhooks/stripe", async (c) => {
  const signature = c.req.header("stripe-signature");
  if (!signature) {
    return c.text("missing signature", 400);
  }

  // IMPORTANT: read raw body BEFORE any other body parsing.
  const rawBody = await c.req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      requireEnv("STRIPE_WEBHOOK_SECRET"),
    );
  } catch (err) {
    console.error("[webhooks/stripe] signature error:", err);
    return c.text(
      `signature_invalid: ${err instanceof Error ? err.message : "unknown"}`,
      400,
    );
  }

  try {
    await db.transaction(async (tx) => {
      // The UNIQUE constraint on stripe_webhook_events.event_id is the
      // idempotency guard: duplicate deliveries trip 23505 and we report
      // duplicate to the outer handler.
      await tx.insert(stripeWebhookEvents).values({
        eventId: event.id,
        eventType: event.type,
        status: "processing",
      });

      switch (event.type) {
        case "invoice.payment_failed":
          await handleInvoiceFailed(tx, event);
          // Kick the scheduler — runs async after we respond 200 to Stripe.
          triggerScheduler();
          break;
        case "invoice.paid":
        case "invoice.payment_succeeded":
          await handleInvoicePaid(tx, event);
          break;
        case "account.updated":
          await handleAccountUpdated(tx, event);
          break;
        default:
          console.log("[webhooks/stripe] ignored event:", event.type);
      }

      await tx
        .update(stripeWebhookEvents)
        .set({ status: "processed", processedAt: new Date() })
        .where(eq(stripeWebhookEvents.eventId, event.id));
    });

    return c.json({ received: true });
  } catch (err) {
    // Postgres unique-violation -> idempotent replay.
    if (isUniqueViolation(err)) {
      return c.json({ received: true, duplicate: true });
    }
    console.error("[webhooks/stripe] handler error:", err);
    captureWithContext(err, { surface: "stripe_webhook" });
    return c.json({ error: "webhook_handler_failed" }, 500);
  }
});

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function isUniqueViolation(err: unknown): boolean {
  // node-postgres surfaces the underlying error with code '23505'. Drizzle
  // sometimes wraps it in a DrizzleQueryError whose .cause carries the original.
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code === "23505" || e.cause?.code === "23505";
}

async function handleInvoiceFailed(tx: Tx, event: Stripe.Event): Promise<void> {
  const connectedAccountId = event.account;
  if (!connectedAccountId) {
    console.log("[invoice.payment_failed] no event.account, skipping");
    return;
  }

  const merchant = await tx.query.merchants.findFirst({
    where: eq(merchants.stripeAccountId, connectedAccountId),
  });
  if (!merchant) {
    console.log(
      "[invoice.payment_failed] no merchant for account",
      connectedAccountId,
    );
    return;
  }

  const invoice = event.data.object as Stripe.Invoice;

  // Set application_fee_amount on the PaymentIntent BEFORE the customer pays.
  // We swallow errors here — the recovery flow still proceeds; the worst case
  // is a missed fee that gets logged and can be reconciled later.
  const paymentIntentId =
    typeof (invoice as unknown as { payment_intent?: unknown }).payment_intent ===
    "string"
      ? ((invoice as unknown as { payment_intent: string }).payment_intent as string)
      : null;
  if (paymentIntentId) {
    const fee = Math.round(
      invoice.amount_due * (merchant.applicationFeePercent / 100),
    );
    try {
      await stripe.paymentIntents.update(
        paymentIntentId,
        { application_fee_amount: fee },
        {
          stripeAccount: connectedAccountId,
          idempotencyKey: `pi-fee-${event.id}`,
        },
      );
    } catch (e) {
      console.warn(
        "[invoice.payment_failed] application_fee update failed:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  // Resolve customer phone — invoice.customer_phone is captured at finalize
  // time and may be null. Fall back to a Customer retrieve.
  let phone =
    (invoice as unknown as { customer_phone?: string | null }).customer_phone ??
    null;
  let name =
    (invoice as unknown as { customer_name?: string | null }).customer_name ??
    null;
  if (!phone && typeof invoice.customer === "string") {
    try {
      const customer = (await stripe.customers.retrieve(
        invoice.customer,
        {},
        { stripeAccount: connectedAccountId },
      )) as Stripe.Customer;
      if (!customer.deleted) {
        phone = customer.phone ?? null;
        name = name ?? customer.name ?? null;
      }
    } catch (e) {
      console.warn(
        "[invoice.payment_failed] customer retrieve failed:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  const planName =
    invoice.lines?.data?.[0]?.description ??
    (invoice.lines?.data?.[0] as unknown as { plan?: { nickname?: string } })
      ?.plan?.nickname ??
    null;

  // Stripe API 2026-04-22 moved `invoice.subscription` to
  // `invoice.parent.subscription_details.subscription`. Read the new path
  // first; fall back to the legacy field for older API versions.
  const parent = (invoice as unknown as {
    parent?: {
      subscription_details?: { subscription?: string };
    };
  }).parent;
  const subscriptionId =
    parent?.subscription_details?.subscription ??
    (typeof (invoice as unknown as { subscription?: unknown }).subscription ===
    "string"
      ? ((invoice as unknown as { subscription: string }).subscription as string)
      : null);

  const inserted = await tx
    .insert(failedInvoices)
    .values({
      merchantId: merchant.id,
      stripeInvoiceId: invoice.id as string,
      stripeCustomerId: invoice.customer as string,
      stripeSubscriptionId: subscriptionId,
      stripePaymentIntentId: paymentIntentId,
      customerName: name,
      customerEmail: invoice.customer_email ?? null,
      customerPhone: phone,
      amountDue: invoice.amount_due,
      currency: invoice.currency,
      planName,
      attemptCountStripe: invoice.attempt_count ?? 1,
      rawEvent: invoice as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing({ target: failedInvoices.stripeInvoiceId })
    .returning();

  const failedInvoice = inserted[0];
  if (!failedInvoice) {
    console.log(
      "[invoice.payment_failed] duplicate stripe_invoice_id, no new recovery",
    );
    return;
  }

  const recoveryRows = await tx
    .insert(recoveries)
    .values({
      merchantId: merchant.id,
      failedInvoiceId: failedInvoice.id,
      state: "QUEUED",
    })
    .returning();
  const newRecovery = recoveryRows[0];
  if (newRecovery) {
    broadcastMerchantEvent(merchant.id, {
      type: "recovery.queued",
      data: {
        recoveryId: newRecovery.id,
        failedInvoiceId: failedInvoice.id,
      },
    });
  }
}

// State sets governing the invoice.paid transition.
const ALLOWED_TRANSITION_STATES = [
  "CALLING",
  "IN_CALL",
  "RECOVERED_PENDING",
  "FAILED_NEEDS_RETRY",
  "RETRY_QUEUED",
] as const;
const TERMINAL_FAILED_STATES = [
  "ABANDONED",
  "CHURNED",
  "ABUSE_TERMINATED",
] as const;

async function handleInvoicePaid(tx: Tx, event: Stripe.Event): Promise<void> {
  const connectedAccountId = event.account;
  if (!connectedAccountId) return;

  const merchant = await tx.query.merchants.findFirst({
    where: eq(merchants.stripeAccountId, connectedAccountId),
  });
  if (!merchant) return;

  const invoice = event.data.object as Stripe.Invoice;
  if (!invoice.id) return;

  const failedInvoice = await tx.query.failedInvoices.findFirst({
    where: eq(failedInvoices.stripeInvoiceId, invoice.id),
  });
  if (!failedInvoice) {
    // Normal first-payment invoice with no prior recovery — ignore.
    return;
  }
  if (failedInvoice.merchantId !== merchant.id) {
    console.warn(
      "[invoice.paid] merchant mismatch, ignoring",
      invoice.id,
      merchant.id,
      failedInvoice.merchantId,
    );
    return;
  }

  const recovery = await tx.query.recoveries.findFirst({
    where: eq(recoveries.failedInvoiceId, failedInvoice.id),
  });
  if (!recovery) return;

  // Idempotency: invoice.paid can fire multiple times. If we've already
  // transitioned to RECOVERED, do nothing.
  if (recovery.state === "RECOVERED") {
    return;
  }
  // Terminal-failed states: merchant may have collected outside our flow.
  // Don't reverse the failure — but log so we can investigate.
  if (
    TERMINAL_FAILED_STATES.includes(
      recovery.state as (typeof TERMINAL_FAILED_STATES)[number],
    )
  ) {
    console.warn(
      "[invoice.paid] for terminal-failed recovery — not transitioning",
      { recoveryId: recovery.id, state: recovery.state, invoice: invoice.id },
    );
    return;
  }
  if (
    !ALLOWED_TRANSITION_STATES.includes(
      recovery.state as (typeof ALLOWED_TRANSITION_STATES)[number],
    )
  ) {
    // QUEUED/SCHEDULED/READY_TO_CALL — extremely unlikely to see invoice.paid
    // for these, but log + skip rather than half-transition.
    console.warn(
      "[invoice.paid] for unexpected non-terminal state — skipping",
      { recoveryId: recovery.id, state: recovery.state },
    );
    return;
  }

  // Capture the platform fee. Prefer the invoice field; some Stripe API
  // versions expose it only on the charge object. If absent, log + 0.
  let applicationFeeCollected: number | null =
    (invoice as unknown as { application_fee_amount?: number | null })
      .application_fee_amount ?? null;
  if (applicationFeeCollected == null) {
    const chargeRef = (invoice as unknown as { charge?: unknown }).charge;
    if (
      chargeRef &&
      typeof chargeRef === "object" &&
      "application_fee_amount" in chargeRef
    ) {
      applicationFeeCollected =
        (chargeRef as { application_fee_amount?: number | null })
          .application_fee_amount ?? null;
    }
  }
  if (applicationFeeCollected == null) {
    console.warn(
      "[invoice.paid] no application_fee_amount on invoice/charge; fee=0",
      { invoice: invoice.id },
    );
    applicationFeeCollected = 0;
  }

  const recoveredAmount = invoice.amount_paid ?? invoice.amount_due;

  await tx
    .update(recoveries)
    .set({
      state: "RECOVERED",
      recoveredAmount,
      applicationFeeCollected,
      finalOutcome: "agreement_reached",
      updatedAt: new Date(),
    })
    .where(eq(recoveries.id, recovery.id));

  // Promote the latest call_attempt outcome from placeholder to agreement.
  const latest = await tx.query.callAttempts.findFirst({
    where: eq(callAttempts.recoveryId, recovery.id),
    orderBy: desc(callAttempts.initiatedAt),
  });
  if (latest && (latest.outcome == null || latest.outcome === "no_agreement")) {
    await tx
      .update(callAttempts)
      .set({ outcome: "agreement_reached" })
      .where(eq(callAttempts.id, latest.id));
  }

  // Broadcast AFTER the row updates above are queued in the tx. Note: this
  // fires before the transaction commits, matching the convention from
  // Step 9's other broadcasts. A pending-broadcast queue would be more
  // correct (broadcast only after commit) — logged as a Step 12 polish item.
  broadcastRecoveryEvent(recovery.id, recovery.merchantId, {
    type: "recovery.recovered",
    data: {
      recoveryId: recovery.id,
      amount: recoveredAmount,
      fee: applicationFeeCollected,
      currency: failedInvoice.currency,
    },
  });
}

async function handleAccountUpdated(
  tx: Tx,
  event: Stripe.Event,
): Promise<void> {
  const account = event.data.object as Stripe.Account;
  if (!account.id) return;

  const merchant = await tx.query.merchants.findFirst({
    where: eq(merchants.stripeAccountId, account.id),
  });
  if (!merchant) return;

  const currentlyDue = account.requirements?.currently_due ?? [];
  const detailsSubmitted = account.details_submitted ?? false;
  const isActive = detailsSubmitted && currentlyDue.length === 0;

  // Don't downgrade an already-active merchant unless we have a clear signal.
  // For now: only set 'active'; 'pending' is the initial state and gets set
  // when we create the account at /onboarding/stripe/start.
  if (isActive && merchant.stripeAccountStatus !== "active") {
    await tx
      .update(merchants)
      .set({ stripeAccountStatus: "active" })
      .where(eq(merchants.id, merchant.id));
  }
}
