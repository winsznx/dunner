/**
 * Server-side helpers for the admin pages.
 *
 * - `getAdminEmail()` checks the Clerk session + ADMIN_EMAILS allowlist. The
 *   backend also enforces this, but checking on the edge gives us instant
 *   redirects instead of a 403 fetch later.
 * - `adminFetch()` forwards the Clerk session token to the backend admin
 *   endpoints with proper auth + cache off.
 */
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

const BACKEND_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:3000";

function allowlist(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function getAdminEmail(): Promise<string> {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress;
  if (!email) redirect("/");

  const allowed = allowlist();
  if (allowed.size === 0 || !allowed.has(email.toLowerCase())) {
    redirect("/");
  }
  return email.toLowerCase();
}

export async function adminFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) throw new Error("no_token");

  const url = `${BACKEND_URL.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`admin fetch failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}
