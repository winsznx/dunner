import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dir, "../../.env.local") });

import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) =>
  c.json({
    status: "ok",
    release: process.env.SENTRY_RELEASE ?? "dev",
    ts: Date.now(),
  }),
);

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOSTNAME ?? "0.0.0.0";

console.log(`[dunner-backend] listening on ${hostname}:${port}`);

export default {
  port,
  hostname,
  fetch: app.fetch,
};
