import { Hono } from "hono";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { failedInvoices, recoveries } from "../db/schema";
import { getAuth, requireAuth } from "../middleware/auth";
import { loadMerchantContext, MissingEmailError } from "../services/merchant";

type Env = {
  Variables: {
    auth: { userId: string; sessionId: string | null };
  };
};

export const analyticsRoute = new Hono<Env>();

analyticsRoute.use("/analytics/*", requireAuth);

const rangeSchema = z.enum(["7d", "30d", "90d"]).default("30d");
const TERMINAL_STATES = [
  "RECOVERED",
  "ABANDONED",
  "CHURNED",
  "ABUSE_TERMINATED",
] as const;

function rangeStart(range: "7d" | "30d" | "90d"): Date {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return new Date(Date.now() - days * 86_400_000);
}

analyticsRoute.get("/analytics/summary", async (c) => {
  const { userId } = getAuth(c);
  try {
    const ctx = await loadMerchantContext(userId);
    const range = rangeSchema.parse(c.req.query("range") ?? "30d");
    const start = rangeStart(range);
    const end = new Date();
    const periodMs = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - periodMs);

    // Current period aggregates.
    const cur = await db
      .select({
        totalRecoveredAmount: sql<number>`COALESCE(SUM(${recoveries.recoveredAmount}), 0)::bigint`,
        feeEarnedAmount: sql<number>`COALESCE(SUM(${recoveries.applicationFeeCollected}), 0)::bigint`,
        recoveredCount: sql<number>`COUNT(*) FILTER (WHERE ${recoveries.state} = 'RECOVERED')::int`,
        terminalCount: sql<number>`COUNT(*) FILTER (WHERE ${recoveries.state} IN ('RECOVERED','ABANDONED','CHURNED','ABUSE_TERMINATED'))::int`,
      })
      .from(recoveries)
      .where(
        and(
          eq(recoveries.merchantId, ctx.merchant.id),
          gte(recoveries.createdAt, start),
        ),
      );

    const prev = await db
      .select({
        totalRecoveredAmount: sql<number>`COALESCE(SUM(${recoveries.recoveredAmount}), 0)::bigint`,
        recoveredCount: sql<number>`COUNT(*) FILTER (WHERE ${recoveries.state} = 'RECOVERED')::int`,
        terminalCount: sql<number>`COUNT(*) FILTER (WHERE ${recoveries.state} IN ('RECOVERED','ABANDONED','CHURNED','ABUSE_TERMINATED'))::int`,
      })
      .from(recoveries)
      .where(
        and(
          eq(recoveries.merchantId, ctx.merchant.id),
          gte(recoveries.createdAt, prevStart),
          lt(recoveries.createdAt, start),
        ),
      );

    // Most-common currency in window.
    const currencyRow = await db
      .select({
        currency: failedInvoices.currency,
        n: sql<number>`COUNT(*)::int`,
      })
      .from(recoveries)
      .innerJoin(
        failedInvoices,
        eq(recoveries.failedInvoiceId, failedInvoices.id),
      )
      .where(
        and(
          eq(recoveries.merchantId, ctx.merchant.id),
          gte(recoveries.createdAt, start),
        ),
      )
      .groupBy(failedInvoices.currency)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(1);

    const c0 = cur[0]!;
    const p0 = prev[0]!;
    const totalRecovered = Number(c0.totalRecoveredAmount);
    const recoveredCount = Number(c0.recoveredCount);
    const terminalCount = Number(c0.terminalCount);
    const avgRecovered =
      recoveredCount > 0 ? Math.round(totalRecovered / recoveredCount) : 0;
    const recoveryRatePct =
      terminalCount > 0 ? (recoveredCount / terminalCount) * 100 : 0;

    const prevTotal = Number(p0.totalRecoveredAmount);
    const prevTerminal = Number(p0.terminalCount);
    const prevRate =
      prevTerminal > 0 ? (Number(p0.recoveredCount) / prevTerminal) * 100 : 0;

    return c.json({
      totalRecoveredAmount: totalRecovered,
      recoveryRatePct,
      avgRecoveredAmount: avgRecovered,
      feeEarnedAmount: Number(c0.feeEarnedAmount),
      currency: currencyRow[0]?.currency?.toUpperCase() ?? "USD",
      rangeStart: start.toISOString(),
      rangeEnd: end.toISOString(),
      previousTotalRecoveredAmount: prevTotal,
      previousRecoveryRatePct: prevRate,
    });
  } catch (err) {
    if (err instanceof MissingEmailError) {
      return c.json({ error: "no_email_on_clerk_user" }, 400);
    }
    console.error("[analytics/summary]", err);
    return c.json({ error: "analytics_failed" }, 500);
  }
});

analyticsRoute.get("/analytics/timeseries", async (c) => {
  const { userId } = getAuth(c);
  try {
    const ctx = await loadMerchantContext(userId);
    const range = rangeSchema.parse(c.req.query("range") ?? "30d");
    const metric = z
      .enum(["recovered", "count"])
      .parse(c.req.query("metric") ?? "recovered");
    const start = rangeStart(range);

    const rows = await db.execute(sql`
      SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS date,
             ${metric === "recovered"
               ? sql`COALESCE(SUM(recovered_amount), 0)::bigint`
               : sql`COUNT(*)::int`} AS value
      FROM recoveries
      WHERE merchant_id = ${ctx.merchant.id}
        AND created_at >= ${start}
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    const points = (rows.rows as Array<{ date: string; value: string | number }>).map(
      (r) => ({ date: r.date, value: Number(r.value) }),
    );
    return c.json({ points });
  } catch (err) {
    if (err instanceof MissingEmailError) {
      return c.json({ error: "no_email_on_clerk_user" }, 400);
    }
    console.error("[analytics/timeseries]", err);
    return c.json({ error: "analytics_failed" }, 500);
  }
});

analyticsRoute.get("/analytics/outcomes", async (c) => {
  const { userId } = getAuth(c);
  try {
    const ctx = await loadMerchantContext(userId);
    const range = rangeSchema.parse(c.req.query("range") ?? "30d");
    const start = rangeStart(range);

    const rows = await db
      .select({
        state: recoveries.state,
        n: sql<number>`COUNT(*)::int`,
      })
      .from(recoveries)
      .where(
        and(
          eq(recoveries.merchantId, ctx.merchant.id),
          gte(recoveries.createdAt, start),
        ),
      )
      .groupBy(recoveries.state);

    const breakdown = {
      recovered: 0,
      churned: 0,
      abandoned: 0,
      abuse_terminated: 0,
      retrying: 0,
    };
    let total = 0;
    for (const r of rows) {
      const n = Number(r.n);
      total += n;
      switch (r.state) {
        case "RECOVERED":
          breakdown.recovered += n;
          break;
        case "CHURNED":
          breakdown.churned += n;
          break;
        case "ABANDONED":
          breakdown.abandoned += n;
          break;
        case "ABUSE_TERMINATED":
          breakdown.abuse_terminated += n;
          break;
        case "RETRY_QUEUED":
        case "FAILED_NEEDS_RETRY":
          breakdown.retrying += n;
          break;
        // QUEUED/SCHEDULED/etc don't count in outcome breakdown.
      }
    }

    return c.json({ breakdown, total });
  } catch (err) {
    if (err instanceof MissingEmailError) {
      return c.json({ error: "no_email_on_clerk_user" }, 400);
    }
    console.error("[analytics/outcomes]", err);
    return c.json({ error: "analytics_failed" }, 500);
  }
});

// silence unused
void inArray;
void TERMINAL_STATES;
