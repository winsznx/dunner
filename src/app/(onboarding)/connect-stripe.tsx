import { useAuth } from "@clerk/clerk-expo";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PrimaryButton } from "@/components/onboarding/PrimaryButton";
import { track } from "@/lib/analytics";
import { ApiError, apiFetch } from "@/lib/api";
import { useOnboardingState } from "@/lib/onboardingState";

type StartResponse = {
  complete: boolean;
  accountId: string;
  url: string | null;
};

type StatusResponse = {
  complete: boolean;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  currentlyDue: string[];
  pastDue: string[];
};

type ScreenState =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "polling" }
  | { kind: "incomplete" }
  | { kind: "error"; message: string };

const DEEPLINK_RETURN = "dunner://stripe/onboarding-return";
const POLL_ATTEMPTS = 8;
const POLL_INTERVAL_MS = 1000;

export default function ConnectStripeScreen() {
  const { getToken } = useAuth();
  const { refetch: refetchOnboarding } = useOnboardingState();
  const router = useRouter();
  const [state, setState] = useState<ScreenState>({ kind: "idle" });

  async function handleConnect() {
    setState({ kind: "connecting" });

    let accountId: string;
    let url: string | null;
    try {
      const token = await getToken();
      const res = await apiFetch<StartResponse>("/onboarding/stripe/start", {
        token,
        init: { method: "POST" },
      });
      if (res.complete) {
        await onComplete();
        return;
      }
      accountId = res.accountId;
      url = res.url;
    } catch (err) {
      setState({
        kind: "error",
        message:
          err instanceof ApiError
            ? `${err.status}: ${err.message}`
            : err instanceof Error
              ? err.message
              : "Failed to start Stripe onboarding.",
      });
      return;
    }

    if (!url) {
      setState({ kind: "error", message: "Stripe did not return a URL." });
      return;
    }

    let browserResult: WebBrowser.WebBrowserAuthSessionResult;
    try {
      browserResult = await WebBrowser.openAuthSessionAsync(
        url,
        DEEPLINK_RETURN,
      );
    } catch (err) {
      console.error("[connect-stripe] WebBrowser error", err);
      setState({
        kind: "error",
        message:
          err instanceof Error ? err.message : "Could not open Stripe.",
      });
      return;
    }

    if (browserResult.type !== "success" && browserResult.type !== "dismiss" && browserResult.type !== "cancel") {
      setState({
        kind: "error",
        message: `Unexpected browser result: ${browserResult.type}`,
      });
      return;
    }

    setState({ kind: "polling" });

    for (let i = 0; i < POLL_ATTEMPTS; i++) {
      try {
        const token = await getToken();
        const status = await apiFetch<StatusResponse>(
          `/onboarding/stripe/status/${accountId}`,
          { token },
        );
        if (status.complete) {
          await onComplete();
          return;
        }
      } catch (err) {
        console.warn("[connect-stripe] status poll error", err);
      }
      await sleep(POLL_INTERVAL_MS);
    }

    setState({ kind: "incomplete" });
  }

  async function onComplete() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    track("stripe_connect_completed");
    await refetchOnboarding();
    // Refetch updates state; the (onboarding)/index route will pick the next step.
    router.replace("/(onboarding)");
  }

  const loading = state.kind === "connecting" || state.kind === "polling";
  const loadingLabel =
    state.kind === "polling" ? "Finalizing" : state.kind === "connecting" ? "Opening Stripe" : undefined;

  const ctaLabel =
    state.kind === "incomplete" ? "Resume onboarding" : "Connect Stripe";

  return (
    <SafeAreaView className="flex-1 bg-bg-base" edges={["top", "bottom"]}>
      <View className="flex-1 px-6 pt-8 pb-8">
        <Text className="text-ink-muted text-xs uppercase tracking-widest font-sans-medium">
          Step 1 of 3
        </Text>

        <View className="mt-6 gap-3">
          <Text className="text-ink-primary text-3xl font-sans-semibold leading-tight">
            Connect your Stripe account
          </Text>
          <Text className="text-ink-secondary text-base leading-relaxed">
            Dunner only charges you when a failed payment is recovered. We use
            Stripe Connect to deposit the recovered amount directly to your
            bank, minus our success fee.
          </Text>
        </View>

        <View className="flex-1" />

        {state.kind === "error" ? (
          <Text className="text-accent-failure text-sm mb-3">
            {state.message}
          </Text>
        ) : null}
        {state.kind === "incomplete" ? (
          <Text className="text-ink-secondary text-sm mb-3">
            Stripe needs a bit more info. Tap below to pick up where you left
            off.
          </Text>
        ) : null}

        <PrimaryButton
          label={ctaLabel}
          onPress={handleConnect}
          loading={loading}
          loadingLabel={loadingLabel}
          haptic="medium"
        />

        <Text className="text-ink-muted text-xs text-center mt-4">
          Powered by Stripe. Bank-level encryption.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
