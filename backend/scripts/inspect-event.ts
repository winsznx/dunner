import "../src/env";
import { Pool } from "pg";
const p = new Pool({
  connectionString: process.env.PROD_DATABASE_URL ?? process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 8000,
});
const r = await p.query(
  `SELECT raw_event FROM failed_invoices ORDER BY created_at DESC LIMIT 1`,
);
const inv = r.rows[0].raw_event;
console.log("invoice keys:", Object.keys(inv));
console.log("subscription:", inv.subscription);
console.log("subscription_details:", inv.subscription_details);
console.log("parent:", inv.parent);
console.log("billing_reason:", inv.billing_reason);
console.log("payment_intent:", inv.payment_intent);
await p.end();
