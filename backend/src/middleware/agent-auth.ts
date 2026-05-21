import type { Context, MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { agentApiTokens, merchants } from "../db/schema";

type AgentAuth = {
  merchantId: string;
};

type Variables = {
  agent: AgentAuth;
};

export const requireAgentAuth: MiddlewareHandler<{ Variables: Variables }> = async (
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

  // Token format: "merchant_<merchantId>.<secret>" — first segment identifies
  // the row so we can fetch the right bcrypt hash without scanning the table.
  const dot = token.indexOf(".");
  if (dot <= 0) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const prefix = token.slice(0, dot);
  const secret = token.slice(dot + 1);
  if (!prefix.startsWith("merchant_")) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const merchantId = prefix.slice("merchant_".length);

  const row = await db.query.agentApiTokens.findFirst({
    where: eq(agentApiTokens.merchantId, merchantId),
  });
  if (!row) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const ok = await Bun.password.verify(secret, row.tokenHash);
  if (!ok) {
    return c.json({ error: "unauthorized" }, 401);
  }

  // Defensive: confirm the merchant still exists.
  const merchant = await db.query.merchants.findFirst({
    where: eq(merchants.id, merchantId),
  });
  if (!merchant) {
    return c.json({ error: "merchant_gone" }, 404);
  }

  c.set("agent", { merchantId });
  await next();
};

export function getAgentAuth(
  c: Context<{ Variables: Variables }>,
): AgentAuth {
  const a = c.get("agent");
  if (!a) throw new Error("getAgentAuth called without requireAgentAuth");
  return a;
}
