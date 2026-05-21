import "../env";
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN_BACKEND;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? "development",
    tracesSampleRate: 0.1,
    release: process.env.RAILWAY_DEPLOYMENT_ID ?? "dev",
  });
  console.log("[sentry] backend initialized");
} else {
  console.log("[sentry] SENTRY_DSN_BACKEND not set — capturing disabled");
}

export { Sentry };

export function captureWithContext(
  err: unknown,
  extra: Record<string, unknown>,
): void {
  if (!dsn) return;
  Sentry.captureException(err, { extra });
}
