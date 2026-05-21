import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { merchants, users } from "../db/schema";
import { clerk, getAuth, requireAuth } from "../middleware/auth";
import { ensureMerchantForClerkUser } from "../services/merchant";

type Env = {
  Variables: {
    auth: { userId: string; sessionId: string | null };
  };
};

export const meRoute = new Hono<Env>();

meRoute.use("/me", requireAuth);

meRoute.get("/me", async (c) => {
  const { userId } = getAuth(c);

  // Fast path: user row exists → no Clerk API call.
  const existing = await db.query.users.findFirst({
    where: eq(users.clerkUserId, userId),
  });

  let user = existing;
  let merchant = existing
    ? await db.query.merchants.findFirst({
        where: eq(merchants.id, existing.merchantId),
      })
    : null;

  if (!user || !merchant) {
    // First sign-in: provision via Clerk (single network call).
    const clerkUser = await clerk.users.getUser(userId);
    const email =
      clerkUser.primaryEmailAddress?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress;
    if (!email) {
      return c.json(
        { error: "no_email_on_clerk_user", clerkUserId: userId },
        400,
      );
    }
    const provisioned = await ensureMerchantForClerkUser(userId, email);
    user = provisioned.user;
    merchant = provisioned.merchant;
  }

  return c.json({
    user: {
      id: user.id,
      clerkUserId: user.clerkUserId,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
    merchant: {
      id: merchant.id,
      name: merchant.name,
      stripeAccountId: merchant.stripeAccountId,
      stripeAccountStatus: merchant.stripeAccountStatus,
      defaultVoiceId: merchant.defaultVoiceId,
      agentId: merchant.agentId,
      applicationFeePercent: merchant.applicationFeePercent,
      timezone: merchant.timezone,
      createdAt: merchant.createdAt,
    },
  });
});
