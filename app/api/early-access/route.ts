import { Resend } from "resend";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Dunner <onboarding@resend.dev>";
  const AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID;

  if (!apiKey) {
    return Response.json(
      { error: "Email service not configured." },
      { status: 500 }
    );
  }

  const resend = new Resend(apiKey);

  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string" || !isValidEmail(email)) {
      return Response.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    // Add to audience (waitlist), if configured. Skip silently if not.
    if (AUDIENCE_ID) {
      try {
        await resend.contacts.create({
          email,
          audienceId: AUDIENCE_ID,
          unsubscribed: false,
        });
      } catch {
        // contact may already exist — ignore and proceed to send
      }
    }

    // Send welcome email
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "You're on the Dunner waitlist.",
      html: emailHtml(email),
      text: emailText(),
    });

    if (error) {
      console.error("Resend error:", error);
      return Response.json(
        { error: "Could not send confirmation email. Please try again." },
        { status: 500 }
      );
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("Early access error:", err);
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

function emailHtml(_email: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>You're on the Dunner waitlist.</title>
</head>
<body style="margin:0;padding:0;background:#0F0F11;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#EEEEEF;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0F0F11;">
    <tr>
      <td align="center" style="padding:48px 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;">
          <tr>
            <td style="padding-bottom:32px;">
              <span style="font-size:28px;font-weight:800;color:#FF1A1A;letter-spacing:-0.5px;">dunner</span>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:16px;">
              <h1 style="margin:0;font-size:32px;font-weight:800;color:#EEEEEF;line-height:1.1;letter-spacing:-1px;">
                You're in.
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:24px;">
              <p style="margin:0;font-size:16px;line-height:1.6;color:#A0A0AB;">
                Thanks for joining the Dunner waitlist. We'll send you a private link to the app the moment it's ready for your Stripe account.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:32px;">
              <p style="margin:0;font-size:16px;line-height:1.6;color:#A0A0AB;">
                In the meantime &mdash; if a payment fails this week, you'll know exactly what we'll fix.
              </p>
            </td>
          </tr>
          <tr>
            <td style="border-top:1px solid #2A2A2F;padding-top:24px;">
              <p style="margin:0;font-size:13px;color:#6C6C74;">
                Dunner &mdash; the only recovery tool that sounds like you.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function emailText(): string {
  return `You're in.

Thanks for joining the Dunner waitlist. We'll send you a private link to the app the moment it's ready for your Stripe account.

In the meantime — if a payment fails this week, you'll know exactly what we'll fix.

Dunner — the only recovery tool that sounds like you.`;
}
