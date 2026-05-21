import "../src/env";
import { Pool } from "pg";
const p = new Pool({
  connectionString: process.env.PROD_DATABASE_URL ?? process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 8000,
});
const r = await p.query(`
  SELECT r.id, r.state, r.attempts, fi.stripe_subscription_id, fi.customer_phone, fi.amount_due
  FROM recoveries r JOIN failed_invoices fi ON fi.id = r.failed_invoice_id
  ORDER BY r.created_at DESC LIMIT 3`);
console.log("recoveries:", r.rows);
await p.end();
