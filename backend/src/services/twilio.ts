import "../env";

import { requireEnv } from "../env";

const TWILIO_BASE = "https://api.twilio.com/2010-04-01";

export async function sendSms(args: {
  to: string;
  body: string;
}): Promise<{ sid: string }> {
  const sid = requireEnv("TWILIO_ACCOUNT_SID");
  const token = requireEnv("TWILIO_AUTH_TOKEN");
  const from = requireEnv("TWILIO_FROM_NUMBER");

  const params = new URLSearchParams({
    To: args.to,
    From: from,
    Body: args.body,
  });

  const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetch(`${TWILIO_BASE}/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Twilio SMS failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const json = JSON.parse(body) as { sid: string };
  return { sid: json.sid };
}
