import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dir, "../../.env.local") });

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`${name} is not set`);
  }
  return v;
}
