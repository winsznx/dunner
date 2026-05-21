import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dir, "../../.env.local") });

import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const r = await pool.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name",
);
console.log("Tables:", r.rows.map((x: { table_name: string }) => x.table_name).join(", "));
const e = await pool.query(
  "SELECT typname FROM pg_type WHERE typtype='e' ORDER BY typname",
);
console.log("Enums:", e.rows.map((x: { typname: string }) => x.typname).join(", "));
await pool.end();
