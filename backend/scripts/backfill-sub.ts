import "../src/env";
import { Pool } from "pg";
const p = new Pool({
  connectionString: process.env.PROD_DATABASE_URL ?? process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 8000,
});
// Backfill subscription id on the most recent failed_invoice from the raw event.
const r = await p.query(
  `SELECT id, raw_event FROM failed_invoices ORDER BY created_at DESC LIMIT 1`,
);
const row = r.rows[0];
const subId = row.raw_event?.parent?.subscription_details?.subscription;
if (subId) {
  await p.query(
    "UPDATE failed_invoices SET stripe_subscription_id = $1 WHERE id = $2",
    [subId, row.id],
  );
  console.log("backfilled", row.id, "with sub", subId);
} else {
  console.log("no sub_id in raw event");
}
// Mark every prior recovery ABANDONED so scheduler doesn't outbound-dial again
// during the inbound demo. Keep only the most recent recovery as QUEUED-ish.
await p.query(
  "UPDATE recoveries SET state = 'ABANDONED', final_outcome = 'no_agreement' WHERE state IN ('QUEUED','SCHEDULED','RETRY_QUEUED','CALLING','IN_CALL')",
);
const newest = await p.query(
  `SELECT r.id FROM recoveries r JOIN failed_invoices fi ON fi.id = r.failed_invoice_id
   WHERE fi.stripe_subscription_id IS NOT NULL ORDER BY r.created_at DESC LIMIT 1`,
);
const demoRecoveryId = newest.rows[0]?.id;
if (demoRecoveryId) {
  // Leave it in CALLING so tools resolve cleanly without scheduler re-dialing
  // (scheduler only picks QUEUED/SCHEDULED/RETRY_QUEUED).
  await p.query(
    "UPDATE recoveries SET state = 'CALLING', final_outcome = NULL WHERE id = $1",
    [demoRecoveryId],
  );
  console.log("demo recovery (CALLING, no re-dial):", demoRecoveryId);
} else {
  console.log("no recovery with sub_id found");
}
await p.end();
