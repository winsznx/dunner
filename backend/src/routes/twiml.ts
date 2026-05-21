import { Hono } from "hono";

export const twimlRoute = new Hono();

// Twilio Voice webhook target. When this URL is set as a number's incoming
// Voice URL, every inbound call gets bridged to FORWARD_TO with answerOnBridge
// so the trial-account "press any key" notice only plays to the *original*
// caller (the EL agent — which doesn't care about a voice prompt), not to
// the called party.
//
// Trial-account workaround only — paid Twilio accounts can skip this.
twimlRoute.all("/twiml/forward", (c) => {
  const to = c.req.query("to");
  if (!to) {
    return c.text(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Reject/></Response>`,
      400,
      { "Content-Type": "text/xml" },
    );
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial answerOnBridge="true">${escapeXml(to)}</Dial></Response>`;
  return c.text(xml, 200, { "Content-Type": "text/xml" });
});

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
