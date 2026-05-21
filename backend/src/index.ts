// Sentry MUST be imported first so its init() runs before any other module
// has a chance to throw — captures dotenv-load errors too.
import "./lib/sentry";
import "./env";

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { meRoute } from "./routes/me";
import { onboardingRoute } from "./routes/onboarding";
import { stripeActionsRoute } from "./routes/stripe-actions";
import { twimlRoute } from "./routes/twiml";
import { recoveriesRoute } from "./routes/recoveries";
import { analyticsRoute } from "./routes/analytics";
import { agentConfigRoute } from "./routes/agent-config";
import { wsRoute, websocket } from "./routes/ws";
import { waitlistRoute } from "./routes/waitlist";
import { authRoute } from "./routes/auth";
import { adminRoute } from "./routes/admin";
import { stripeWebhookRoute } from "./webhooks/stripe";
import { elevenLabsWebhookRoute } from "./webhooks/elevenlabs";
import {
  startBackgroundPoll,
  stopBackgroundPoll,
} from "./services/scheduler";

const app = new Hono();

app.onError((err, c) => {
  // Capture to Sentry but keep the local log for dev. Hono will still
  // render a 500 response below so we don't leak the stack to clients.
  console.error("[hono onError]", err);
  // Lazy require so we don't break tsc if Sentry isn't initialized.
  import("./lib/sentry").then(({ captureWithContext }) => {
    captureWithContext(err, { path: c.req.path, method: c.req.method });
  });
  return c.json({ error: "internal_error" }, 500);
});

app.use("*", logger());

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type"],
  }),
);

app.get("/health", (c) =>
  c.json({
    status: "ok",
    release: process.env.SENTRY_RELEASE ?? "dev",
    ts: Date.now(),
  }),
);

app.route("/", meRoute);
app.route("/", onboardingRoute);
app.route("/", recoveriesRoute);
app.route("/", analyticsRoute);
app.route("/", agentConfigRoute);
app.route("/", stripeActionsRoute);
app.route("/", twimlRoute);
app.route("/", wsRoute);
app.route("/", stripeWebhookRoute);
app.route("/", elevenLabsWebhookRoute);
app.route("/", waitlistRoute);
app.route("/", authRoute);
app.route("/", adminRoute);

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOSTNAME ?? "0.0.0.0";

console.log(`[dunner-backend] listening on ${hostname}:${port}`);

// Backup polling loop: catches SCHEDULED recoveries whose scheduled_for has
// become due, plus anything missed while the server was offline.
startBackgroundPoll(30_000);

const shutdown = () => {
  console.log("[dunner-backend] shutting down…");
  stopBackgroundPoll();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export default {
  port,
  hostname,
  fetch: app.fetch,
  websocket,
};
