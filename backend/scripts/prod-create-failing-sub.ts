// Creates a real product + recurring price + customer + failing subscription
// on Tim's prod Stripe Connect account. The failed invoice will hit our
// webhook with a real stripe_subscription_id, so pause_subscription can act
// on it during the demo call.

import "../src/env";

import Stripe from "stripe";
import { Pool } from "pg";
import { requireEnv } from "../src/env";

const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
const ACCT = "acct_1TZ66N176F8hAVRn"; // Tim's prod Connect account
const PHONE = "+2347026426016";
const NAME = "Tim (demo)";

const pool = new Pool({
  connectionString: process.env.PROD_DATABASE_URL ?? requireEnv("DATABASE_URL"),
  max: 1,
  connectionTimeoutMillis: 8000,
});

// 1. product + price (idempotent: re-use if name matches)
const products = await stripe.products.list(
  { limit: 5 },
  { stripeAccount: ACCT },
);
let product = products.data.find((p) => p.name === "Dunner Demo Plan");
if (!product) {
  product = await stripe.products.create(
    { name: "Dunner Demo Plan" },
    { stripeAccount: ACCT },
  );
  console.log("created product", product.id);
} else {
  console.log("reusing product", product.id);
}

const prices = await stripe.prices.list(
  { product: product.id, limit: 5, active: true },
  { stripeAccount: ACCT },
);
let price = prices.data.find(
  (p) => p.recurring?.interval === "month" && p.unit_amount === 2000,
);
if (!price) {
  price = await stripe.prices.create(
    {
      product: product.id,
      unit_amount: 2000,
      currency: "usd",
      recurring: { interval: "month" },
    },
    { stripeAccount: ACCT },
  );
  console.log("created price", price.id);
} else {
  console.log("reusing price", price.id);
}

// 2. customer with phone (so our webhook captures phone properly)
const customer = await stripe.customers.create(
  {
    name: NAME,
    phone: PHONE,
    email: "tim+demo@example.com",
  },
  { stripeAccount: ACCT },
);
console.log("created customer", customer.id);

// 3. Attach Stripe's test PM that attaches OK but fails on customer charge.
//    pm_card_chargeCustomerFail is a Stripe magic shortcut — attaching it
//    materializes a real PM id; we must use that id when setting the
//    customer's default (not the shortcut string).
const attachedPm = await stripe.paymentMethods.attach(
  "pm_card_chargeCustomerFail",
  { customer: customer.id },
  { stripeAccount: ACCT },
);
await stripe.customers.update(
  customer.id,
  { invoice_settings: { default_payment_method: attachedPm.id } },
  { stripeAccount: ACCT },
);
console.log("attached failing pm", attachedPm.id);

// 4. subscription — Stripe will try to charge, decline, and fire
//    invoice.payment_failed webhook to our deployed backend.
// default_incomplete lets the create succeed; Stripe finalizes the invoice,
// attempts charge, declines, and fires invoice.payment_failed via webhook.
const sub = await stripe.subscriptions.create(
  {
    customer: customer.id,
    items: [{ price: price.id }],
    collection_method: "charge_automatically",
    payment_behavior: "default_incomplete",
  },
  { stripeAccount: ACCT },
);
console.log("subscription:", sub.id, "status:", sub.status);

// Force Stripe to attempt payment NOW (otherwise it may schedule for later).
const latestInvoiceId =
  typeof sub.latest_invoice === "string"
    ? sub.latest_invoice
    : sub.latest_invoice?.id;
if (latestInvoiceId) {
  console.log("paying latest invoice", latestInvoiceId);
  try {
    await stripe.invoices.pay(
      latestInvoiceId,
      {},
      { stripeAccount: ACCT },
    );
  } catch (err) {
    console.log(
      "invoice.pay declined as expected:",
      (err as Error).message?.slice(0, 120),
    );
  }
}

// 5. Poll our DB until the webhook has created a recovery row with a non-null
//    stripe_subscription_id.
console.log("\nwaiting for webhook → recovery row…");
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const rows = await pool.query(
    `SELECT r.id as recovery_id, fi.stripe_subscription_id, fi.amount_due, fi.customer_phone, r.state
     FROM recoveries r
     JOIN failed_invoices fi ON fi.id = r.failed_invoice_id
     WHERE fi.stripe_customer_id = $1
     ORDER BY r.created_at DESC LIMIT 1`,
    [customer.id],
  );
  const row = rows.rows[0];
  if (row?.stripe_subscription_id) {
    console.log("✅ recovery ready:", row);
    await pool.end();
    process.exit(0);
  }
  process.stdout.write(".");
}
console.log("\n❌ webhook didn't land — check Stripe Dashboard webhook logs");
await pool.end();
process.exit(1);
