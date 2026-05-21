/**
 * Admin-only middleware. Layered on top of `requireAuth`:
 *
 *   admin.use("/admin/*", requireAuth, requireAdmin);
 *
 * Reads the comma-separated `ADMIN_EMAILS` env var, normalises to lowercase,
 * and checks the Clerk user's primary email against the list. Looking up the
 * email goes through Clerk (one network call per admin request) but that's
 * fine for an admin surface — low traffic, high need for accuracy. Could be
 * cached if it becomes a hot path.
 */
import type { Context, MiddlewareHandler } from "hono";
import { clerk } from "../services/clerk";

type AnyAuthCtx = { auth?: { userId: string; sessionId: string | null } };

function getUserId(c: Context): string {
  const auth = (c as Context<{ Variables: AnyAuthCtx }>).get("auth");
  if (!auth?.userId) {
    throw new Error("requireAdmin used without requireAuth before it");
  }
  return auth.userId;
}

function loadAllowlist(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

let cached: Set<string> | null = null;
function getAllowlist(): Set<string> {
  if (!cached) cached = loadAllowlist();
  return cached;
}

export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const allowlist = getAllowlist();
  if (allowlist.size === 0) {
    // Fail closed if not configured. Better to 503 than silently allow.
    return c.json({ error: "admin_not_configured" }, 503);
  }
  const userId = getUserId(c);
  let email: string | undefined;
  try {
    const user = await clerk.users.getUser(userId);
    email =
      user.primaryEmailAddress?.emailAddress ??
      user.emailAddresses[0]?.emailAddress;
  } catch (err) {
    console.error("[admin-auth] clerk lookup failed:", err);
    return c.json({ error: "lookup_failed" }, 500);
  }
  if (!email || !allowlist.has(email.toLowerCase())) {
    return c.json({ error: "forbidden" }, 403);
  }
  c.set("adminEmail", email.toLowerCase());
  await next();
};
