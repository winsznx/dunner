/**
 * Auth-adjacent routes for first-time onboarding.
 *
 * `POST /auth/redeem-code` — called by the mobile app on sign-up. Validates
 * the access code against the waitlist, binds it to the Clerk user, marks it
 * redeemed. Idempotent: if the row is already redeemed by THIS user, it's a
 * no-op (200). If redeemed by a different user, 409.
 *
 * Gated behind Clerk auth (so we know who the redeemer is) AND rate-limited
 * by IP to slow brute-force of codes.
 */
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { waitlistSubscribers } from "../db/schema";
import { getAuth, requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";

export const authRoute = new Hono<{
  Variables: { auth: { userId: string; sessionId: string | null } };
}>();

authRoute.use(
  "/auth/redeem-code",
  rateLimit({ requests: 10, window: "10 m", prefix: "redeem" }),
  requireAuth,
);

authRoute.post("/auth/redeem-code", async (c) => {
  let body: { code?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const code = String(body.code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return c.json({ error: "invalid_code_format" }, 400);
  }

  const { userId } = getAuth(c);

  const row = await db.query.waitlistSubscribers.findFirst({
    where: eq(waitlistSubscribers.accessCode, code),
  });

  if (!row) {
    return c.json({ error: "invalid_code" }, 404);
  }

  if (row.status === "redeemed") {
    if (row.redeemedByClerkUserId === userId) {
      return c.json({ ok: true, alreadyRedeemed: true });
    }
    return c.json({ error: "code_already_used" }, 409);
  }

  if (row.status === "unsubscribed") {
    return c.json({ error: "code_revoked" }, 410);
  }

  const result = await db
    .update(waitlistSubscribers)
    .set({
      status: "redeemed",
      redeemedAt: new Date(),
      redeemedByClerkUserId: userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(waitlistSubscribers.id, row.id),
        eq(waitlistSubscribers.status, row.status),
      ),
    )
    .returning();

  if (result.length === 0) {
    // Lost a race — re-check.
    const fresh = await db.query.waitlistSubscribers.findFirst({
      where: eq(waitlistSubscribers.id, row.id),
    });
    if (fresh?.redeemedByClerkUserId === userId) {
      return c.json({ ok: true, alreadyRedeemed: true });
    }
    return c.json({ error: "code_already_used" }, 409);
  }

  return c.json({ ok: true, email: row.email });
});
