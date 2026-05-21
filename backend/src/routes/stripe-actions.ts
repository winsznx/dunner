import { Hono, type Context } from "hono";
import { getAgentAuth, requireAgentAuth } from "../middleware/agent-auth";
import {
  appendToolCall,
  applyCoupon,
  logCallback,
  logChurn,
  pauseSubscription,
  resolveCallContext,
  sendRecoveryLink,
  ToolError,
} from "../services/stripe-actions";
import { broadcastCallEvent } from "../lib/broadcast";

type Env = {
  Variables: { agent: { merchantId: string } };
};

// Merge useful result fields back into args so the UI can render
// "Paused for 30 days" rather than just "{}". Strips any obvious secrets.
function sanitizeArgs(
  body: Record<string, unknown>,
  result: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  // Promote any non-{ok,status,error} fields from the result so we can show
  // things like resumes_at, percent_off, url.
  for (const [k, v] of Object.entries(result)) {
    if (k === "ok" || k === "status" || k === "error") continue;
    out[k] = v;
  }
  return out;
}

export const stripeActionsRoute = new Hono<Env>();

stripeActionsRoute.use("/stripe-actions/*", requireAgentAuth);

type Ctx = Context<Env>;
type Resolved = Awaited<ReturnType<typeof resolveCallContext>>;

async function withContext(
  c: Ctx,
  fn: (ctx: Resolved, body: Record<string, unknown>) => Promise<Record<string, unknown>>,
) {
  const { merchantId } = getAgentAuth(c);
  // recovery_id arrives via URL query (auto-substituted from the call's
  // dynamic variables by EL), not from the agent-chosen JSON body.
  const recoveryId = c.req.query("recovery_id");
  if (!recoveryId) {
    return c.json({ error: "missing_recovery_id" }, 400);
  }
  let body: Record<string, unknown> = {};
  try {
    const text = await c.req.text();
    if (text) body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  try {
    const ctx = await resolveCallContext(merchantId, recoveryId);
    const result = await fn(ctx, body);
    const toolSlug = c.req.path.replace("/stripe-actions/", "");
    // Normalize URL slug (pause-subscription) → snake_case name (pause_subscription)
    // to match the WsEvent.tool naming used in CLAUDE.md §13.7.
    const toolName = toolSlug.replace(/-/g, "_");
    if (ctx.callAttempt) {
      await appendToolCall(ctx.callAttempt.id, toolName, body);
    }
    broadcastCallEvent(ctx.recovery.id, {
      type: "tool.fired",
      data: {
        recoveryId: ctx.recovery.id,
        tool: toolName,
        args: sanitizeArgs(body, result),
        ts: Date.now(),
      },
    });
    return c.json(result);
  } catch (err) {
    if (err instanceof ToolError) {
      return c.json({ error: err.code, message: err.message }, 400);
    }
    console.error("[stripe-actions]", c.req.path, err);
    return c.json({ error: "tool_failed" }, 500);
  }
}

stripeActionsRoute.post("/stripe-actions/pause-subscription", (c) =>
  withContext(c, async (ctx, body) =>
    pauseSubscription(ctx, body as Parameters<typeof pauseSubscription>[1]),
  ),
);

stripeActionsRoute.post("/stripe-actions/apply-coupon", (c) =>
  withContext(c, async (ctx, body) =>
    applyCoupon(ctx, body as Parameters<typeof applyCoupon>[1]),
  ),
);

stripeActionsRoute.post("/stripe-actions/send-recovery-link", (c) =>
  withContext(c, async (ctx) => sendRecoveryLink(ctx)),
);

stripeActionsRoute.post("/stripe-actions/log-callback", (c) =>
  withContext(c, async (ctx, body) =>
    logCallback(ctx, body as Parameters<typeof logCallback>[1]),
  ),
);

stripeActionsRoute.post("/stripe-actions/log-churn", (c) =>
  withContext(c, async (ctx, body) =>
    logChurn(ctx, body as Parameters<typeof logChurn>[1]),
  ),
);
