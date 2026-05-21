import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { merchants, users } from "../db/schema";
import { clerk } from "./clerk";

export type MerchantRow = typeof merchants.$inferSelect;
export type UserRow = typeof users.$inferSelect;

export class MissingEmailError extends Error {
  constructor(public clerkUserId: string) {
    super(`Clerk user ${clerkUserId} has no email address`);
  }
}

export async function loadMerchantContext(clerkUserId: string): Promise<{
  merchant: MerchantRow;
  user: UserRow;
  email: string;
}> {
  // Fast path: user row exists → skip Clerk API.
  const existing = await db.query.users.findFirst({
    where: eq(users.clerkUserId, clerkUserId),
  });
  if (existing) {
    const merchant = await db.query.merchants.findFirst({
      where: eq(merchants.id, existing.merchantId),
    });
    if (!merchant) {
      throw new Error(
        `Orphaned user row ${existing.id}: merchant ${existing.merchantId} missing`,
      );
    }
    return { merchant, user: existing, email: existing.email };
  }

  // First-time: fetch email from Clerk and provision.
  const clerkUser = await clerk.users.getUser(clerkUserId);
  const email =
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) {
    throw new MissingEmailError(clerkUserId);
  }
  const { merchant, user } = await ensureMerchantForClerkUser(
    clerkUserId,
    email,
  );
  return { merchant, user, email };
}

export async function ensureMerchantForClerkUser(
  clerkUserId: string,
  email: string,
): Promise<{ merchant: MerchantRow; user: UserRow }> {
  const existing = await db.query.users.findFirst({
    where: eq(users.clerkUserId, clerkUserId),
  });

  if (existing) {
    const merchant = await db.query.merchants.findFirst({
      where: eq(merchants.id, existing.merchantId),
    });
    if (!merchant) {
      throw new Error(
        `Orphaned user row ${existing.id}: merchant ${existing.merchantId} missing`,
      );
    }
    return { merchant, user: existing };
  }

  const workspaceName = `${email} workspace`;

  return await db.transaction(async (tx) => {
    const insertedMerchants = await tx
      .insert(merchants)
      .values({
        name: workspaceName,
        clerkOrgId: clerkUserId,
      })
      .onConflictDoNothing({ target: merchants.clerkOrgId })
      .returning();

    const merchant =
      insertedMerchants[0] ??
      (await tx.query.merchants.findFirst({
        where: eq(merchants.clerkOrgId, clerkUserId),
      }));

    if (!merchant) {
      throw new Error(`Failed to provision merchant for ${clerkUserId}`);
    }

    const insertedUsers = await tx
      .insert(users)
      .values({
        clerkUserId,
        merchantId: merchant.id,
        email,
        role: "admin",
      })
      .onConflictDoNothing({ target: users.clerkUserId })
      .returning();

    const user =
      insertedUsers[0] ??
      (await tx.query.users.findFirst({
        where: eq(users.clerkUserId, clerkUserId),
      }));

    if (!user) {
      throw new Error(`Failed to provision user row for ${clerkUserId}`);
    }

    return { merchant, user };
  });
}
