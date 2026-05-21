/**
 * Thin Resend wrapper. Industry-grade pattern (cribbed from remlo's
 * `lib/email/client.ts`):
 *
 * - `sendEmail` is the only public function. Callers pass a template name +
 *   typed props; we render and dispatch.
 * - Templates are inline HTML+text strings. We don't need React Email here —
 *   our templates are simple, and avoiding the toolchain keeps the backend
 *   bundle lean.
 * - From/reply-to are env-configurable, with a sensible default that uses
 *   Resend's onboarding domain so dev works out of the box.
 * - Suppression handling and audience sync are stubbed for now; add when we
 *   wire bounce webhooks.
 */
import { Resend } from "resend";
import { requireEnv } from "../env";

type Templates = {
  waitlist_invite: {
    accessCode: string;
    downloadUrl: string;
  };
  waitlist_confirmed: {
    accessCode: string;
  };
};

type TemplateName = keyof Templates;

const FROM_DEFAULT =
  process.env.RESEND_FROM_EMAIL ?? "Dunner <onboarding@resend.dev>";
const REPLY_TO = process.env.RESEND_REPLY_TO ?? "hello@dunner.xyz";
const APP_URL = process.env.LANDING_URL ?? "https://dunner.xyz";

let client: Resend | null = null;
function getClient(): Resend {
  if (!client) client = new Resend(requireEnv("RESEND_API_KEY"));
  return client;
}

type Rendered = { subject: string; html: string; text: string };

function render<K extends TemplateName>(
  template: K,
  props: Templates[K],
): Rendered {
  switch (template) {
    case "waitlist_invite": {
      const p = props as Templates["waitlist_invite"];
      return {
        subject: "Your Dunner access code",
        html: waitlistInviteHtml(p.accessCode, p.downloadUrl),
        text: waitlistInviteText(p.accessCode, p.downloadUrl),
      };
    }
    case "waitlist_confirmed": {
      const p = props as Templates["waitlist_confirmed"];
      return {
        subject: "You're on the Dunner waitlist",
        html: waitlistConfirmedHtml(p.accessCode),
        text: waitlistConfirmedText(p.accessCode),
      };
    }
    default: {
      const _exhaustive: never = template;
      throw new Error(`Unknown template: ${String(_exhaustive)}`);
    }
  }
}

export async function sendEmail<K extends TemplateName>(
  to: string,
  template: K,
  props: Templates[K],
): Promise<void> {
  const { subject, html, text } = render(template, props);
  const resend = getClient();
  const { error } = await resend.emails.send({
    from: FROM_DEFAULT,
    to,
    replyTo: REPLY_TO,
    subject,
    html,
    text,
  });
  if (error) {
    throw new Error(`Resend send failed: ${error.message ?? "unknown"}`);
  }
}

// ----- templates --------------------------------------------------------

function shell(body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Dunner</title>
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
          ${body}
          <tr>
            <td style="border-top:1px solid #2A2A2F;padding-top:24px;padding-top:32px;">
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

function waitlistConfirmedHtml(accessCode: string): string {
  return shell(`
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
          Thanks for joining the Dunner waitlist. We'll send you a private link to the app the moment your turn comes up.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:24px;">
        <p style="margin:0;font-size:14px;line-height:1.6;color:#A0A0AB;">
          Hang on to this access code &mdash; you'll need it when you sign in:
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:32px;">
        <div style="display:inline-block;padding:14px 22px;background:#1A1A1E;border:1px solid #2A2A2F;border-radius:12px;font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:24px;font-weight:600;letter-spacing:6px;color:#10B981;">
          ${escapeHtml(accessCode)}
        </div>
      </td>
    </tr>
  `);
}

function waitlistConfirmedText(accessCode: string): string {
  return `You're in.

Thanks for joining the Dunner waitlist. We'll send you a private link to the app the moment your turn comes up.

Your access code: ${accessCode}

Hang on to it — you'll need it when you sign in.

Dunner — the only recovery tool that sounds like you.`;
}

function waitlistInviteHtml(accessCode: string, downloadUrl: string): string {
  return shell(`
    <tr>
      <td style="padding-bottom:16px;">
        <h1 style="margin:0;font-size:32px;font-weight:800;color:#EEEEEF;line-height:1.1;letter-spacing:-1px;">
          Your invite is ready.
        </h1>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:24px;">
        <p style="margin:0;font-size:16px;line-height:1.6;color:#A0A0AB;">
          Download the Android app and sign in with the access code below.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:24px;">
        <a href="${escapeHtml(downloadUrl)}" style="display:inline-block;padding:14px 28px;background:#10B981;color:#0F0F11;font-weight:700;font-size:15px;text-decoration:none;border-radius:999px;">Download Dunner</a>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:8px;">
        <p style="margin:0;font-size:13px;line-height:1.6;color:#6C6C74;">
          Your access code:
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:32px;">
        <div style="display:inline-block;padding:14px 22px;background:#1A1A1E;border:1px solid #2A2A2F;border-radius:12px;font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:24px;font-weight:600;letter-spacing:6px;color:#10B981;">
          ${escapeHtml(accessCode)}
        </div>
      </td>
    </tr>
  `);
}

function waitlistInviteText(accessCode: string, downloadUrl: string): string {
  return `Your invite is ready.

Download the Android app: ${downloadUrl}

Your access code: ${accessCode}

Dunner — the only recovery tool that sounds like you.`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Suppress lint for unused APP_URL until we wire confirm-link emails.
void APP_URL;
