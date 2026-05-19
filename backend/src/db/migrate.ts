import "dotenv/config";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dir, "../../../.env.local") });

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[migrate] DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 1 });
const db = drizzle(pool);

try {
  console.log("[migrate] running migrations…");
  await migrate(db, { migrationsFolder: resolve(import.meta.dir, "../../drizzle") });
  console.log("[migrate] done");
  await pool.end();
  process.exit(0);
} catch (err) {
  console.error("[migrate] failed:", err);
  await pool.end();
  process.exit(1);
}
