/**
 * Public waitlist endpoint. POST'd from the landing page on email capture.
 *
 * Flow:
 *   1. Validate email format.
 *   2. Upsert a `waitlist_subscribers` row. If already confirmed, return
 *      that idempotently — we don't leak whether the email existed before.
 *   3. Issue a short access code if the row is new (or doesn't have one yet).
 *   4. Send a confirmation email with the code.
 *
 * NOT auth-gated — this is the only public POST in the API. Rate-limit at the
 * edge if abuse becomes a problem (Upstash ratelimit middleware is already
 * wired for other routes).
 */
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { randomBytes } from "node:crypto";
import { db } from "../db/client";
import { waitlistSubscribers } from "../db/schema";
import { rateLimit } from "../middleware/rate-limit";
import { sendEmail } from "../services/email";

export const waitlistRoute = new Hono();

waitlistRoute.use(
  "/waitlist",
  rateLimit({ requests: 5, window: "10 m", prefix: "waitlist" }),
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // skip 0/O/1/I/L for legibility
const CODE_LENGTH = 6;

function generateAccessCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    const byte = bytes[i] ?? 0;
    out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return out;
}

waitlistRoute.post("/waitlist", async (c) => {
  let body: { email?: string; source?: string; referrer?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return c.json({ error: "invalid_email" }, 400);
  }

  const source = body.source ? String(body.source).slice(0, 100) : null;
  const referrer = body.referrer ? String(body.referrer).slice(0, 500) : null;
  const ip =
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;

  // Upsert: if the row exists, return its existing access code. Otherwise
  // insert with a fresh code.
  const existing = await db.query.waitlistSubscribers.findFirst({
    where: eq(waitlistSubscribers.email, email),
  });

  let accessCode = existing?.accessCode ?? null;
  let isNew = false;

  if (!existing) {
    isNew = true;
    accessCode = generateAccessCode();
    // Collision avoidance: retry up to 3 times if the code is taken.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await db.insert(waitlistSubscribers).values({
          email,
          status: "pending",
          accessCode,
          source,
          referrer,
          ipAddress: ip,
        });
        break;
      } catch (err: unknown) {
        const e = err as { code?: string; constraint?: string };
        if (e.code === "23505" && e.constraint?.includes("access_code")) {
          accessCode = generateAccessCode();
          continue;
        }
        // Race on email unique: another request created the row between our
        // SELECT and INSERT. Re-fetch.
        if (e.code === "23505") {
          const raced = await db.query.waitlistSubscribers.findFirst({
            where: eq(waitlistSubscribers.email, email),
          });
          if (raced) {
            accessCode = raced.accessCode;
            isNew = false;
          }
          break;
        }
        throw err;
      }
    }
  } else if (!existing.accessCode) {
    // Backfill code on legacy rows.
    accessCode = generateAccessCode();
    await db
      .update(waitlistSubscribers)
      .set({ accessCode, updatedAt: new Date() })
      .where(eq(waitlistSubscribers.id, existing.id));
  }

  if (!accessCode) {
    return c.json({ error: "code_assignment_failed" }, 500);
  }

  // Fire-and-forget the confirmation email. We don't block the response on
  // the SMTP round-trip — Resend has its own retry logic, and the user can
  // re-submit the form if delivery fails.
  void sendEmail(email, "waitlist_confirmed", { accessCode }).catch((err) => {
    console.error("[waitlist] email send failed:", err);
  });

  // Always return the same shape regardless of whether the row was new —
  // avoid leaking whether the email is already on our list.
  void isNew;
  return c.json({ ok: true });
});
