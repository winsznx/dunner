import "../env";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { requireEnv } from "../env";
import * as schema from "./schema";

const connectionString = requireEnv("DATABASE_URL");

// Railway's Postgres proxy (ballast.proxy.rlwy.net) drops idle connections.
// keepAlive + a short idleTimeoutMillis keeps the pool from handing out
// stale sockets, and Pool auto-evicts on the "error" event for any
// connection it didn't already retire.
const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5_000,
});

pool.on("error", (err) => {
  console.error("[db] idle pg client error (will be evicted):", err.message);
});

export const db = drizzle(pool, { schema });
export { schema };
