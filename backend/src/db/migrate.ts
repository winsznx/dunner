import "../env";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { resolve } from "node:path";
import { requireEnv } from "../env";

const connectionString = requireEnv("DATABASE_URL");

const pool = new Pool({ connectionString, max: 1 });
const db = drizzle(pool);

try {
  console.log("[migrate] running migrations…");
  await migrate(db, {
    migrationsFolder: resolve(import.meta.dir, "../../drizzle"),
  });
  console.log("[migrate] done");
  await pool.end();
  process.exit(0);
} catch (err) {
  console.error("[migrate] failed:", err);
  await pool.end();
  process.exit(1);
}
