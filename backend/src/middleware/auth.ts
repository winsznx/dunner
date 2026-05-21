import type { Context, MiddlewareHandler } from "hono";
import { verifyToken } from "@clerk/backend";
import { requireEnv } from "../env";

export { clerk } from "../services/clerk";

type AuthContext = {
  userId: string;
  sessionId: string | null;
};

type Variables = {
  auth: AuthContext;
};

const secretKey = requireEnv("CLERK_SECRET_KEY");

export const requireAuth: MiddlewareHandler<{ Variables: Variables }> = async (
  c,
  next,
) => {
  const header = c.req.header("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const token = header.slice("bearer ".length).trim();
  if (!token) {
    return c.json({ error: "unauthorized" }, 401);
  }

  try {
    const payload = await verifyToken(token, { secretKey });
    c.set("auth", {
      userId: payload.sub,
      sessionId: payload.sid ?? null,
    });
    await next();
  } catch {
    return c.json({ error: "unauthorized" }, 401);
  }
};

export function getAuth(c: Context<{ Variables: Variables }>): AuthContext {
  const auth = c.get("auth");
  if (!auth) {
    throw new Error("getAuth called on a request without requireAuth");
  }
  return auth;
}
