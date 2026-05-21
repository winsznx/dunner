import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { verifyToken } from "@clerk/backend";
import { and, desc, eq } from "drizzle-orm";
import type { ServerWebSocket } from "bun";
import { db } from "../db/client";
import {
  callAttempts,
  failedInvoices,
  merchants,
  recoveries,
  users,
} from "../db/schema";
import { requireEnv } from "../env";
import {
  addCallSubscriber,
  addMerchantSubscriber,
  removeCallSubscriber,
  removeMerchantSubscriber,
  sendSnapshot,
} from "../lib/broadcast";
import type { CallSnapshot } from "../lib/ws-events";

const { upgradeWebSocket, websocket } =
  createBunWebSocket<ServerWebSocket>();

export { websocket };

export const wsRoute = new Hono<{
  Variables: { wsRecoveryId: string; wsMerchantId: string };
}>();

const secretKey = requireEnv("CLERK_SECRET_KEY");

wsRoute.get(
  "/ws/call/:recoveryId",
  async (c, next) => {
    const recoveryId = c.req.param("recoveryId");
    const token = c.req.query("token");
    if (!token) return c.text("missing token", 401);

    let userId: string;
    try {
      const payload = await verifyToken(token, { secretKey });
      userId = payload.sub;
    } catch {
      return c.text("invalid token", 401);
    }

    // Resolve merchant via users → merchants and verify ownership.
    const userRow = await db.query.users.findFirst({
      where: eq(users.clerkUserId, userId),
    });
    if (!userRow) return c.text("user not provisioned", 404);

    const recovery = await db.query.recoveries.findFirst({
      where: and(
        eq(recoveries.id, recoveryId),
        eq(recoveries.merchantId, userRow.merchantId),
      ),
    });
    if (!recovery) return c.text("recovery not found", 404);

    c.set("wsRecoveryId", recoveryId);
    await next();
  },
  upgradeWebSocket((c) => {
    const recoveryId = c.get("wsRecoveryId");
    return {
      async onOpen(_evt, ws) {
        addCallSubscriber(recoveryId, ws);
        const snapshot = await buildSnapshot(recoveryId);
        if (snapshot) sendSnapshot(ws, snapshot);
      },
      onClose(_evt, ws) {
        removeCallSubscriber(recoveryId, ws);
      },
      onError(_evt, ws) {
        removeCallSubscriber(recoveryId, ws);
      },
    };
  }),
);

wsRoute.get(
  "/ws/merchant",
  async (c, next) => {
    const token = c.req.query("token");
    if (!token) return c.text("missing token", 401);
    let userId: string;
    try {
      const payload = await verifyToken(token, { secretKey });
      userId = payload.sub;
    } catch {
      return c.text("invalid token", 401);
    }
    const userRow = await db.query.users.findFirst({
      where: eq(users.clerkUserId, userId),
    });
    if (!userRow) return c.text("user not provisioned", 404);
    c.set("wsMerchantId", userRow.merchantId);
    await next();
  },
  upgradeWebSocket((c) => {
    const merchantId = c.get("wsMerchantId");
    return {
      onOpen(_evt, ws) {
        addMerchantSubscriber(merchantId, ws);
      },
      onClose(_evt, ws) {
        removeMerchantSubscriber(merchantId, ws);
      },
      onError(_evt, ws) {
        removeMerchantSubscriber(merchantId, ws);
      },
    };
  }),
);

async function buildSnapshot(
  recoveryId: string,
): Promise<CallSnapshot | null> {
  const recovery = await db.query.recoveries.findFirst({
    where: eq(recoveries.id, recoveryId),
  });
  if (!recovery) return null;
  const failedInvoice = await db.query.failedInvoices.findFirst({
    where: eq(failedInvoices.id, recovery.failedInvoiceId),
  });
  if (!failedInvoice) return null;
  const merchant = await db.query.merchants.findFirst({
    where: eq(merchants.id, recovery.merchantId),
  });
  if (!merchant) return null;
  const attempt = await db.query.callAttempts.findFirst({
    where: eq(callAttempts.recoveryId, recovery.id),
    orderBy: desc(callAttempts.initiatedAt),
  });

  return {
    type: "snapshot",
    data: {
      recovery: {
        id: recovery.id,
        state: recovery.state as string,
        attempts: recovery.attempts,
        scheduledFor: recovery.scheduledFor
          ? recovery.scheduledFor.toISOString()
          : null,
      },
      failedInvoice: {
        customerName: failedInvoice.customerName,
        customerPhone: failedInvoice.customerPhone,
        planName: failedInvoice.planName,
        amountDue: failedInvoice.amountDue,
        currency: failedInvoice.currency,
      },
      merchant: { name: merchant.name },
      latestCallAttempt: attempt
        ? {
            id: attempt.id,
            initiatedAt: attempt.initiatedAt.toISOString(),
            endedAt: attempt.endedAt ? attempt.endedAt.toISOString() : null,
            durationSecs: attempt.durationSecs,
            outcome: attempt.outcome,
            toolCallsFired: (attempt.toolCallsFired ?? []) as Array<{
              name: string;
              args: Record<string, unknown>;
              timestamp: number;
            }>,
          }
        : null,
    },
  };
}
