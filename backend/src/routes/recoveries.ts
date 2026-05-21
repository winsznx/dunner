import { Hono } from "hono";
import { and, desc, eq, inArray, ilike, or, sql, lt, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import {
  callAttempts,
  failedInvoices,
  recoveries,
} from "../db/schema";
import { getAuth, requireAuth } from "../middleware/auth";
import { loadMerchantContext, MissingEmailError } from "../services/merchant";
import { broadcastCallEvent } from "../lib/broadcast";

type Env = {
  Variables: {
    auth: { userId: string; sessionId: string | null };
  };
};

export const recoveriesRoute = new Hono<Env>();

recoveriesRoute.use("/recoveries", requireAuth);
recoveriesRoute.use("/recoveries/*", requireAuth);

const ACTIVE_STATES = [
  "QUEUED",
  "SCHEDULED",
  "READY_TO_CALL",
  "CALLING",
  "IN_CALL",
  "RECOVERED_PENDING",
  "RETRY_QUEUED",
  "FAILED_NEEDS_RETRY",
] as const;
const FAILED_STATES = ["ABANDONED", "CHURNED", "ABUSE_TERMINATED"] as const;
const RECOVERED_STATES = ["RECOVERED"] as const;

const listQuerySchema = z.object({
  state: z.enum(["all", "active", "recovered", "failed"]).default("all"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().optional(),
});

type Cursor = { updatedAt: string; id: string };
function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}
function decodeCursor(s: string): Cursor | null {
  try {
    const json = Buffer.from(s, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as Cursor;
    if (
      typeof parsed.updatedAt !== "string" ||
      typeof parsed.id !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

recoveriesRoute.get("/recoveries", async (c) => {
  const { userId } = getAuth(c);
  try {
    const ctx = await loadMerchantContext(userId);
    const parsed = listQuerySchema.safeParse({
      state: c.req.query("state"),
      cursor: c.req.query("cursor"),
      limit: c.req.query("limit"),
      q: c.req.query("q"),
    });
    if (!parsed.success) {
      return c.json({ error: "bad_query", issues: parsed.error.issues }, 400);
    }
    const { state, cursor, limit, q } = parsed.data;

    const conditions = [eq(recoveries.merchantId, ctx.merchant.id)];

    if (state === "active") {
      conditions.push(inArray(recoveries.state, [...ACTIVE_STATES]));
    } else if (state === "failed") {
      conditions.push(inArray(recoveries.state, [...FAILED_STATES]));
    } else if (state === "recovered") {
      conditions.push(inArray(recoveries.state, [...RECOVERED_STATES]));
    }

    if (q && q.trim().length > 0) {
      const term = `%${q.trim()}%`;
      const search = or(
        ilike(failedInvoices.customerName, term),
        ilike(failedInvoices.customerEmail, term),
      );
      if (search) conditions.push(search);
    }

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        // Strict tuple comparison: (updated_at, id) < (cursor.updated_at, cursor.id)
        // Using SQL fragment because Drizzle doesn't expose tuple-compare directly.
        conditions.push(
          sql`(${recoveries.updatedAt}, ${recoveries.id}) < (${new Date(decoded.updatedAt)}, ${decoded.id})`,
        );
      }
    }

    const whereExpr = and(...conditions);

    const rows = await db
      .select({
        id: recoveries.id,
        state: recoveries.state,
        attempts: recoveries.attempts,
        recoveredAmount: recoveries.recoveredAmount,
        applicationFeeCollected: recoveries.applicationFeeCollected,
        finalOutcome: recoveries.finalOutcome,
        createdAt: recoveries.createdAt,
        updatedAt: recoveries.updatedAt,
        failedInvoiceId: recoveries.failedInvoiceId,
        customerName: failedInvoices.customerName,
        customerEmail: failedInvoices.customerEmail,
        planName: failedInvoices.planName,
        amountDue: failedInvoices.amountDue,
        currency: failedInvoices.currency,
        attemptCountStripe: failedInvoices.attemptCountStripe,
        latestCallAttemptAt: sql<Date | null>`(
          SELECT MAX(${callAttempts.initiatedAt})
          FROM ${callAttempts}
          WHERE ${callAttempts.recoveryId} = ${recoveries.id}
        )`,
      })
      .from(recoveries)
      .innerJoin(
        failedInvoices,
        eq(recoveries.failedInvoiceId, failedInvoices.id),
      )
      .where(whereExpr)
      .orderBy(desc(recoveries.updatedAt), desc(recoveries.id))
      .limit(limit + 1); // +1 to peek for next page

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({
            updatedAt: last.updatedAt.toISOString(),
            id: last.id,
          })
        : null;

    const responseItems = items.map((r) => ({
      id: r.id,
      state: r.state,
      attempts: r.attempts,
      recoveredAmount: r.recoveredAmount,
      applicationFeeCollected: r.applicationFeeCollected,
      finalOutcome: r.finalOutcome,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      latestCallAttemptAt: r.latestCallAttemptAt,
      failedInvoice: {
        customerName: r.customerName,
        customerEmail: r.customerEmail,
        planName: r.planName,
        amountDue: r.amountDue,
        currency: r.currency,
        attemptCountStripe: r.attemptCountStripe,
      },
    }));

    const body: {
      items: typeof responseItems;
      nextCursor: string | null;
      total?: number;
    } = { items: responseItems, nextCursor };

    if (!cursor) {
      const totalRow = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(recoveries)
        .innerJoin(
          failedInvoices,
          eq(recoveries.failedInvoiceId, failedInvoices.id),
        )
        .where(whereExpr);
      body.total = totalRow[0]?.count ?? 0;
    }

    return c.json(body);
  } catch (err) {
    if (err instanceof MissingEmailError) {
      return c.json({ error: "no_email_on_clerk_user" }, 400);
    }
    console.error("[recoveries list]", err);
    return c.json({ error: "recoveries_failed" }, 500);
  }
});

recoveriesRoute.get("/recoveries/:id", async (c) => {
  const { userId } = getAuth(c);
  const recoveryId = c.req.param("id");
  try {
    const ctx = await loadMerchantContext(userId);
    const recovery = await db.query.recoveries.findFirst({
      where: and(
        eq(recoveries.id, recoveryId),
        eq(recoveries.merchantId, ctx.merchant.id),
      ),
    });
    if (!recovery) return c.json({ error: "not_found" }, 404);

    const failedInvoice = await db.query.failedInvoices.findFirst({
      where: eq(failedInvoices.id, recovery.failedInvoiceId),
    });
    if (!failedInvoice) return c.json({ error: "not_found" }, 404);

    const attempts = await db
      .select({
        id: callAttempts.id,
        elevenLabsConversationId: callAttempts.elevenLabsConversationId,
        twilioCallSid: callAttempts.twilioCallSid,
        initiatedAt: callAttempts.initiatedAt,
        endedAt: callAttempts.endedAt,
        durationSecs: callAttempts.durationSecs,
        costUsd: callAttempts.costUsd,
        outcome: callAttempts.outcome,
        transcript: callAttempts.transcript,
        transcriptSummary: callAttempts.transcriptSummary,
        audioUrl: callAttempts.audioUrl,
        toolCallsFired: callAttempts.toolCallsFired,
      })
      .from(callAttempts)
      .where(eq(callAttempts.recoveryId, recovery.id))
      .orderBy(desc(callAttempts.initiatedAt));

    return c.json({
      recovery: {
        id: recovery.id,
        state: recovery.state,
        attempts: recovery.attempts,
        recoveredAmount: recovery.recoveredAmount,
        applicationFeeCollected: recovery.applicationFeeCollected,
        finalOutcome: recovery.finalOutcome,
        scheduledFor: recovery.scheduledFor,
        createdAt: recovery.createdAt,
        updatedAt: recovery.updatedAt,
      },
      failedInvoice: {
        id: failedInvoice.id,
        stripeInvoiceId: failedInvoice.stripeInvoiceId,
        customerName: failedInvoice.customerName,
        customerEmail: failedInvoice.customerEmail,
        customerPhone: failedInvoice.customerPhone,
        planName: failedInvoice.planName,
        amountDue: failedInvoice.amountDue,
        currency: failedInvoice.currency,
        attemptCountStripe: failedInvoice.attemptCountStripe,
        createdAt: failedInvoice.createdAt,
      },
      callAttempts: attempts,
    });
  } catch (err) {
    if (err instanceof MissingEmailError) {
      return c.json({ error: "no_email_on_clerk_user" }, 400);
    }
    console.error("[recoveries/:id]", err);
    return c.json({ error: "recovery_detail_failed" }, 500);
  }
});

// End-call hatch from the live call screen (carried over from Step 9).
recoveriesRoute.delete("/recoveries/:id/call", async (c) => {
  const { userId } = getAuth(c);
  const recoveryId = c.req.param("id");
  try {
    const ctx = await loadMerchantContext(userId);
    const recovery = await db.query.recoveries.findFirst({
      where: and(
        eq(recoveries.id, recoveryId),
        eq(recoveries.merchantId, ctx.merchant.id),
      ),
    });
    if (!recovery) return c.json({ error: "not_found" }, 404);

    await db
      .update(recoveries)
      .set({
        state: "ABUSE_TERMINATED",
        finalOutcome: "abusive_termination",
        updatedAt: new Date(),
      })
      .where(eq(recoveries.id, recovery.id));

    const attempt = await db.query.callAttempts.findFirst({
      where: eq(callAttempts.recoveryId, recovery.id),
      orderBy: desc(callAttempts.initiatedAt),
    });
    if (attempt) {
      await db
        .update(callAttempts)
        .set({ endedAt: new Date(), outcome: "abusive_termination" })
        .where(eq(callAttempts.id, attempt.id));
    }

    broadcastCallEvent(recovery.id, {
      type: "recovery.failed",
      data: { recoveryId: recovery.id, reason: "manually_terminated" },
    });

    return c.json({ ok: true });
  } catch (err) {
    if (err instanceof MissingEmailError) {
      return c.json({ error: "no_email_on_clerk_user" }, 400);
    }
    console.error("[recoveries/:id/call]", err);
    return c.json({ error: "end_call_failed" }, 500);
  }
});

// silence unused
void lt;
void lte;
