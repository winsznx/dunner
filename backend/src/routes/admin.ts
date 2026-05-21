/**
 * Admin API surface. Used by the Next.js admin pages in /landing/admin.
 *
 * All routes layered with `requireAuth + requireAdmin`. The allowlist lives
 * in env (`ADMIN_EMAILS=...`), so adding/removing admins is a config change,
 * not a deploy.
 *
 * Endpoints:
 *   GET  /admin/overview          → high-level counters
 *   GET  /admin/waitlist          → paginated list
 *   POST /admin/waitlist/invite   → flip status pending → invited, resend email
 *   POST /admin/waitlist/unsub    → mark unsubscribed
 *   GET  /admin/merchants         → list with onboarding status
 *   GET  /admin/recoveries        → recent recoveries across all merchants
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import {
  callAttempts,
  failedInvoices,
  merchants,
  recoveries,
  users,
  waitlistSubscribers,
} from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin-auth";
import { sendEmail } from "../services/email";

export const adminRoute = new Hono<{
  Variables: {
    auth: { userId: string; sessionId: string | null };
    adminEmail: string;
  };
}>();

adminRoute.use("/admin/*", requireAuth, requireAdmin);

adminRoute.get("/admin/overview", async (c) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [merchantsCount] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(merchants);
  const [waitlistCount] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(waitlistSubscribers);
  const [recoveriesCount] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(recoveries);
  const [recoveredCount] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(recoveries)
    .where(eq(recoveries.state, "RECOVERED"));
  const [recoveredAmount] = await db
    .select({
      total: sql<number>`COALESCE(SUM(recovered_amount), 0)::bigint`,
    })
    .from(recoveries)
    .where(eq(recoveries.state, "RECOVERED"));
  const [feeAmount] = await db
    .select({
      total: sql<number>`COALESCE(SUM(application_fee_collected), 0)::bigint`,
    })
    .from(recoveries)
    .where(eq(recoveries.state, "RECOVERED"));
  const [newWaitlist7d] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(waitlistSubscribers)
    .where(gte(waitlistSubscribers.createdAt, sevenDaysAgo));

  return c.json({
    merchants: merchantsCount?.n ?? 0,
    waitlistTotal: waitlistCount?.n ?? 0,
    waitlistNew7d: newWaitlist7d?.n ?? 0,
    recoveriesTotal: recoveriesCount?.n ?? 0,
    recoveriesRecovered: recoveredCount?.n ?? 0,
    totalRecoveredAmountCents: Number(recoveredAmount?.total ?? 0),
    totalFeeAmountCents: Number(feeAmount?.total ?? 0),
  });
});

adminRoute.get("/admin/waitlist", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "100", 10) || 100, 500);
  const status = c.req.query("status");
  const where = status
    ? eq(waitlistSubscribers.status, status)
    : undefined;
  const rows = await db
    .select()
    .from(waitlistSubscribers)
    .where(where)
    .orderBy(desc(waitlistSubscribers.createdAt))
    .limit(limit);
  return c.json({ items: rows });
});

adminRoute.post("/admin/waitlist/invite", async (c) => {
  let body: { id?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (!body.id) return c.json({ error: "missing_id" }, 400);

  const row = await db.query.waitlistSubscribers.findFirst({
    where: eq(waitlistSubscribers.id, body.id),
  });
  if (!row) return c.json({ error: "not_found" }, 404);
  if (!row.accessCode) {
    return c.json({ error: "no_access_code" }, 400);
  }

  const downloadUrl =
    process.env.ANDROID_APK_URL ?? "https://dunner.xyz/download";

  try {
    await sendEmail(row.email, "waitlist_invite", {
      accessCode: row.accessCode,
      downloadUrl,
    });
  } catch (err) {
    console.error("[admin/waitlist/invite] send failed:", err);
    return c.json({ error: "email_send_failed" }, 502);
  }

  await db
    .update(waitlistSubscribers)
    .set({
      status: "invited",
      invitedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(waitlistSubscribers.id, row.id));

  return c.json({ ok: true });
});

adminRoute.post("/admin/waitlist/unsub", async (c) => {
  let body: { id?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (!body.id) return c.json({ error: "missing_id" }, 400);
  await db
    .update(waitlistSubscribers)
    .set({
      status: "unsubscribed",
      unsubscribedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(waitlistSubscribers.id, body.id));
  return c.json({ ok: true });
});

adminRoute.get("/admin/merchants", async (c) => {
  const rows = await db
    .select({
      id: merchants.id,
      name: merchants.name,
      clerkOrgId: merchants.clerkOrgId,
      stripeAccountId: merchants.stripeAccountId,
      stripeAccountStatus: merchants.stripeAccountStatus,
      defaultVoiceId: merchants.defaultVoiceId,
      agentId: merchants.agentId,
      applicationFeePercent: merchants.applicationFeePercent,
      createdAt: merchants.createdAt,
    })
    .from(merchants)
    .orderBy(desc(merchants.createdAt))
    .limit(200);

  // Attach user emails (best effort — one merchant can have multiple users
  // in theory but our schema enforces 1:1 today).
  const merchantIds = rows.map((r) => r.id);
  const userRows = merchantIds.length
    ? await db
        .select({ merchantId: users.merchantId, email: users.email })
        .from(users)
    : [];
  const byMerchant = new Map<string, string>();
  for (const u of userRows) byMerchant.set(u.merchantId, u.email);

  return c.json({
    items: rows.map((r) => ({ ...r, email: byMerchant.get(r.id) ?? null })),
  });
});

adminRoute.get("/admin/recoveries", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "100", 10) || 100, 500);
  const rows = await db
    .select({
      id: recoveries.id,
      merchantId: recoveries.merchantId,
      state: recoveries.state,
      attempts: recoveries.attempts,
      recoveredAmount: recoveries.recoveredAmount,
      applicationFeeCollected: recoveries.applicationFeeCollected,
      finalOutcome: recoveries.finalOutcome,
      createdAt: recoveries.createdAt,
      updatedAt: recoveries.updatedAt,
      customerName: failedInvoices.customerName,
      customerEmail: failedInvoices.customerEmail,
      amountDue: failedInvoices.amountDue,
      currency: failedInvoices.currency,
      planName: failedInvoices.planName,
      merchantName: merchants.name,
    })
    .from(recoveries)
    .leftJoin(failedInvoices, eq(recoveries.failedInvoiceId, failedInvoices.id))
    .leftJoin(merchants, eq(recoveries.merchantId, merchants.id))
    .orderBy(desc(recoveries.createdAt))
    .limit(limit);
  return c.json({ items: rows });
});

adminRoute.get("/admin/recoveries/:id", async (c) => {
  const id = c.req.param("id");
  const row = await db.query.recoveries.findFirst({
    where: eq(recoveries.id, id),
  });
  if (!row) return c.json({ error: "not_found" }, 404);
  const fi = await db.query.failedInvoices.findFirst({
    where: eq(failedInvoices.id, row.failedInvoiceId),
  });
  const m = await db.query.merchants.findFirst({
    where: eq(merchants.id, row.merchantId),
  });
  const attempts = await db
    .select()
    .from(callAttempts)
    .where(eq(callAttempts.recoveryId, row.id))
    .orderBy(desc(callAttempts.initiatedAt));
  return c.json({ recovery: row, failedInvoice: fi, merchant: m, attempts });
});

void and;
