import PostHog from "posthog-react-native";

const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (!key) return null;
  if (!client) {
    client = new PostHog(key, { host });
  }
  return client;
}

export type FunnelEvent =
  | "merchant_signed_up"
  | "stripe_connect_completed"
  | "ivc_uploaded"
  | "knowledge_uploaded"
  | "recovery_call_viewed"
  | "recovery_recovered";

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export function track(
  event: FunnelEvent,
  props?: Record<string, JsonValue>,
): void {
  getClient()?.capture(event, props);
}

export function identifyMerchant(
  clerkUserId: string,
  merchantId: string,
): void {
  getClient()?.identify(clerkUserId, { merchant_id: merchantId });
}
