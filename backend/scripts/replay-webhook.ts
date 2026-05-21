import "../src/env";

import { createHmac } from "node:crypto";
import { requireEnv } from "../src/env";

// Replays a synthetic invoice.payment_failed event TWICE to verify
// idempotency on stripe_webhook_events.event_id (UNIQUE).
const EVENT_ID = process.argv[2] ?? `evt_replay_${Date.now()}`;
const ACCOUNT_ID = process.argv[3] ?? "acct_1TYwIX0IoB1auLeX";
const INVOICE_ID = `in_replay_${Date.now()}`;

const payload = {
  id: EVENT_ID,
  object: "event",
  api_version: "2026-04-22.dahlia",
  created: Math.floor(Date.now() / 1000),
  account: ACCOUNT_ID,
  type: "invoice.payment_failed",
  data: {
    object: {
      id: INVOICE_ID,
      object: "invoice",
      amount_due: 4242,
      amount_paid: 0,
      currency: "usd",
      customer: "cus_replay_idem",
      customer_email: "replay@example.com",
      customer_name: "Replay Tester",
      customer_phone: "+14155550143",
      payment_intent: null,
      subscription: null,
      attempt_count: 1,
      lines: { data: [{ description: "Replay plan" }] },
    },
  },
};

const body = JSON.stringify(payload);
const ts = Math.floor(Date.now() / 1000);
const secret = requireEnv("STRIPE_WEBHOOK_SECRET");
const signed = createHmac("sha256", secret)
  .update(`${ts}.${body}`)
  .digest("hex");
const signature = `t=${ts},v1=${signed}`;

async function post(label: string): Promise<void> {
  const res = await fetch("http://localhost:3000/webhooks/stripe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": signature,
    },
    body,
  });
  const text = await res.text();
  console.log(`[${label}] ${res.status} ${text}`);
}

await post("first");
await post("second");
