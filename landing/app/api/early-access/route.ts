/**
 * Public landing endpoint. Forwards to the backend's /waitlist route so the
 * database + email + access-code lifecycle stay in one place. We DON'T talk
 * to Resend directly from the edge — that would split the waitlist data
 * across two systems.
 *
 * If BACKEND_URL isn't set (e.g. local dev with no backend running), we fail
 * loudly instead of silently dropping signups.
 */

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export async function POST(request: Request) {
  const backend = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!backend) {
    console.error("[early-access] BACKEND_URL not configured");
    return Response.json(
      { error: "Waitlist service not configured." },
      { status: 500 },
    );
  }

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email || !isValidEmail(email)) {
    return Response.json(
      { error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${backend.replace(/\/$/, "")}/waitlist`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Forward client IP so backend rate-limiter sees the real address.
        "X-Forwarded-For":
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for") ??
          "",
      },
      body: JSON.stringify({
        email,
        source: "landing",
        referrer: request.headers.get("referer"),
      }),
    });

    if (res.status === 429) {
      return Response.json(
        { error: "Too many requests. Try again in a few minutes." },
        { status: 429 },
      );
    }

    if (!res.ok) {
      const detail = await res.text();
      console.error("[early-access] backend error:", res.status, detail);
      return Response.json(
        { error: "Could not save your signup. Please try again." },
        { status: 502 },
      );
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[early-access] backend unreachable:", err);
    return Response.json(
      { error: "Could not reach the waitlist service. Please try again." },
      { status: 503 },
    );
  }
}
