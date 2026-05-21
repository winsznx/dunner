import { createClerkClient } from "@clerk/backend";
import { requireEnv } from "../env";

export const clerk = createClerkClient({
  secretKey: requireEnv("CLERK_SECRET_KEY"),
});
