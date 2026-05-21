import { useAuth } from "@clerk/clerk-expo";
import * as Haptics from "expo-haptics";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  FadeInDown,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { StateBadge } from "@/components/recoveries/StateBadge";
import { ApiError, apiFetch } from "@/lib/api";
import { formatAmount, formatDuration, formatRelative } from "@/lib/format";
import { useCallWebSocket } from "@/lib/ws";

type DetailResponse = {
  recovery: {
    id: string;
    state: string;
    attempts: number;
    recoveredAmount: number | null;
    applicationFeeCollected: number | null;
    finalOutcome: string | null;
    scheduledFor: string | null;
    createdAt: string;
    updatedAt: string;
  };
  failedInvoice: {
    id: string;
    stripeInvoiceId: string;
    customerName: string | null;
    customerEmail: string | null;
    customerPhone: string | null;
    planName: string | null;
    amountDue: number;
    currency: string;
    attemptCountStripe: number | null;
    createdAt: string;
  };
  callAttempts: Array<{
    id: string;
    elevenLabsConversationId: string | null;
    twilioCallSid: string | null;
    initiatedAt: string;
    endedAt: string | null;
    durationSecs: number | null;
    costUsd: string | null;
    outcome: string | null;
    transcript: Array<{
      role: "agent" | "user";
      message: string;
      time_in_call_secs: number;
    }> | null;
    transcriptSummary: string | null;
    audioUrl: string | null;
    toolCallsFired: Array<{
      name: string;
      args: Record<string, unknown>;
      timestamp: number;
    }>;
  }>;
};

const NON_TERMINAL = new Set([
  "QUEUED",
  "SCHEDULED",
  "READY_TO_CALL",
  "CALLING",
  "IN_CALL",
  "RECOVERED_PENDING",
  "RETRY_QUEUED",
  "FAILED_NEEDS_RETRY",
]);

export default function RecoveryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getToken, isSignedIn } = useAuth();
  const ws = useCallWebSocket(id && isSignedIn ? id : undefined);

  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Celebration state — set when a live recovery.recovered event arrives
  // AND the recovery wasn't already RECOVERED on mount.
  const wasRecoveredOnMountRef = useRef<boolean | null>(null);
  const celebratedRef = useRef(false);
  const [celebrationTarget, setCelebrationTarget] = useState<{
    amount: number;
    fee: number;
    currency: string;
  } | null>(null);
  const [tickedAmount, setTickedAmount] = useState(0);
  const bannerScale = useSharedValue(1);

  const refetch = useCallback(async () => {
    if (!id) return;
    try {
      const token = await getToken();
      const res = await apiFetch<DetailResponse>(`/recoveries/${id}`, {
        token,
      });
      setDetail(res);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `${err.status}: ${err.message}`
          : err instanceof Error
            ? err.message
            : "Failed to load recovery",
      );
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!isSignedIn || !id) return;
    setLoading(true);
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isSignedIn]);

  // Refetch when call.ended arrives via WS.
  const lastEvent = ws.events[ws.events.length - 1];
  useEffect(() => {
    if (!lastEvent) return;
    if (
      lastEvent.type === "call.ended" ||
      lastEvent.type === "tool.fired" ||
      lastEvent.type === "recovery.recovered" ||
      lastEvent.type === "recovery.failed"
    ) {
      void refetch();
    }
    // Trigger celebration on the FIRST recovery.recovered event we see
    // during this screen session, but only if we didn't mount in RECOVERED.
    if (
      lastEvent.type === "recovery.recovered" &&
      !celebratedRef.current &&
      wasRecoveredOnMountRef.current === false
    ) {
      celebratedRef.current = true;
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      );
      setCelebrationTarget({
        amount: lastEvent.data.amount,
        fee: lastEvent.data.fee,
        currency: lastEvent.data.currency,
      });
      // Pop the banner: scale 0.94 → 1, snappy spring, 200ms after ticker
      // begins so the eye reads the amount first.
      bannerScale.value = 0.94;
      setTimeout(() => {
        bannerScale.value = withSpring(1, {
          damping: 22,
          stiffness: 280,
          mass: 0.8,
        });
      }, 200);
    }
  }, [lastEvent, refetch, bannerScale]);

  // Mark the initial RECOVERED state once detail first loads — used by the
  // celebration check above so opening an already-recovered recovery
  // doesn't replay the animation.
  useEffect(() => {
    if (!detail) return;
    if (wasRecoveredOnMountRef.current !== null) return;
    wasRecoveredOnMountRef.current = detail.recovery.state === "RECOVERED";
  }, [detail]);

  // Drive the ticker via requestAnimationFrame (JS thread, formatAmount-safe).
  useEffect(() => {
    if (!celebrationTarget) return;
    const target = celebrationTarget.amount;
    const start = performance.now();
    const duration = 1200;
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // Snappy spring approximation: ease-out cubic.
      const eased = 1 - Math.pow(1 - t, 3);
      setTickedAmount(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [celebrationTarget]);

  const animatedBannerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bannerScale.value }],
  }));

  // If any call_attempt has null transcript, poll every 15s for up to 5 min
  // after that attempt's endedAt.
  useEffect(() => {
    if (!detail) return;
    const needs = detail.callAttempts.some(
      (a) =>
        a.endedAt &&
        !a.transcript &&
        Date.now() - new Date(a.endedAt).getTime() < 5 * 60_000,
    );
    if (!needs) return;
    const t = setInterval(() => {
      void refetch();
    }, 15_000);
    return () => clearInterval(t);
  }, [detail, refetch]);

  if (loading && !detail) {
    return (
      <SafeAreaView className="flex-1 bg-bg-base items-center justify-center">
        <ActivityIndicator color="#A0A0AB" />
      </SafeAreaView>
    );
  }
  if (error && !detail) {
    return (
      <SafeAreaView className="flex-1 bg-bg-base items-center justify-center px-6">
        <Text className="text-accent-failure text-sm">{error}</Text>
        <Pressable
          onPress={() => router.back()}
          className="bg-bg-surface px-4 py-2.5 rounded-md mt-4"
        >
          <Text className="text-ink-primary text-sm">Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }
  if (!detail) return null;

  const isRecovered =
    detail.recovery.state === "RECOVERED" ||
    detail.recovery.state === "RECOVERED_PENDING";
  const isFailedish =
    detail.recovery.state === "CHURNED" ||
    detail.recovery.state === "ABANDONED" ||
    detail.recovery.state === "ABUSE_TERMINATED";

  return (
    <SafeAreaView className="flex-1 bg-bg-base" edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
        {/* Header strip */}
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            className="flex-row items-center gap-1 -ml-2"
            hitSlop={12}
          >
            <ChevronLeft size={20} color="#EEEEEF" />
            <Text className="text-ink-primary text-base font-sans-semibold">
              {detail.failedInvoice.customerName ?? "Customer"}
            </Text>
          </Pressable>
          <Animated.View layout={LinearTransition.springify().damping(20)}>
            <StateBadge state={detail.recovery.state} />
          </Animated.View>
        </View>

        {/* Hero summary card */}
        <View className="bg-bg-surface rounded-2xl p-5 gap-1">
          <View className="flex-row items-baseline gap-2">
            <Text
              className="text-ink-primary text-3xl font-mono-semibold"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {formatAmount(
                detail.failedInvoice.amountDue,
                detail.failedInvoice.currency,
              )}
            </Text>
            <Text className="text-ink-muted text-sm font-mono">
              {detail.failedInvoice.currency.toUpperCase()}
            </Text>
          </View>
          <Text className="text-ink-secondary text-sm mt-1">
            from {detail.failedInvoice.customerName ?? "customer"} ·{" "}
            {detail.failedInvoice.planName ?? "subscription"}
          </Text>
          {isRecovered && detail.recovery.recoveredAmount != null ? (
            <Animated.View
              entering={FadeInDown.springify().damping(18)}
              style={animatedBannerStyle}
              className="bg-accent-recovery rounded-xl px-4 py-3 mt-3"
            >
              <Text className="text-white text-sm font-sans-semibold">
                ✓ Recovered{" "}
                {celebrationTarget
                  ? formatAmount(
                      tickedAmount,
                      celebrationTarget.currency,
                    )
                  : formatAmount(
                      detail.recovery.recoveredAmount,
                      detail.failedInvoice.currency,
                    )}
                {(celebrationTarget?.fee ??
                  detail.recovery.applicationFeeCollected) != null
                  ? ` · earned ${formatAmount(
                      celebrationTarget?.fee ??
                        detail.recovery.applicationFeeCollected ??
                        0,
                      celebrationTarget?.currency ??
                        detail.failedInvoice.currency,
                    )} in fees`
                  : ""}
              </Text>
            </Animated.View>
          ) : null}
          {isFailedish ? (
            <View className="bg-bg-elevated rounded-xl px-4 py-3 mt-3">
              <Text className="text-ink-secondary text-sm">
                {detail.recovery.state === "CHURNED"
                  ? "Customer cancelled during the call."
                  : detail.recovery.state === "ABUSE_TERMINATED"
                    ? "Call ended early."
                    : "Couldn't reach the customer after retries."}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Live status hint while WS is open and call is non-terminal */}
        {NON_TERMINAL.has(detail.recovery.state) ? (
          <Text className="text-ink-muted text-xs">
            {ws.status === "open"
              ? "Live · updates appear automatically"
              : ws.status === "connecting"
                ? "Connecting to live feed…"
                : "Reconnecting…"}
          </Text>
        ) : null}

        {/* Call history */}
        <View className="gap-2 mt-2">
          <Text className="text-ink-muted text-xs uppercase tracking-widest font-sans-medium">
            Call history
          </Text>
          {detail.callAttempts.length === 0 ? (
            <View className="bg-bg-surface rounded-xl p-5">
              <Text className="text-ink-secondary text-sm">
                No call attempts yet.
              </Text>
            </View>
          ) : (
            detail.callAttempts.map((attempt, i) => (
              <AttemptCard
                key={attempt.id}
                attempt={attempt}
                index={detail.callAttempts.length - i}
              />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function AttemptCard({
  attempt,
  index,
}: {
  attempt: DetailResponse["callAttempts"][number];
  index: number;
}) {
  const [expanded, setExpanded] = useState(index === 1);
  const tools = attempt.toolCallsFired ?? [];

  return (
    <Animated.View
      layout={LinearTransition.duration(220)}
      className="bg-bg-surface rounded-xl overflow-hidden"
    >
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        className="p-4 active:opacity-80"
      >
        <View className="flex-row justify-between items-center">
          <View className="flex-1 pr-3">
            <Text className="text-ink-primary text-sm font-sans-semibold">
              Attempt #{index} · {formatDuration(attempt.durationSecs)}
              {attempt.outcome ? ` · ${describeOutcome(attempt.outcome)}` : ""}
            </Text>
            <Text className="text-ink-muted text-xs mt-1">
              {formatRelative(attempt.initiatedAt)}
            </Text>
          </View>
          <Animated.View
            layout={LinearTransition}
            style={{
              transform: [{ rotate: expanded ? "90deg" : "0deg" }],
            }}
          >
            <ChevronRight size={16} color="#A0A0AB" />
          </Animated.View>
        </View>
      </Pressable>

      {expanded ? (
        <Animated.View
          layout={LinearTransition.duration(220)}
          className="px-4 pb-4 gap-3"
        >
          {/* Transcript */}
          {attempt.transcript && attempt.transcript.length > 0 ? (
            <View className="gap-2">
              {attempt.transcript.map((turn, j) => (
                <View
                  key={j}
                  className={
                    turn.role === "agent" ? "items-end" : "items-start"
                  }
                >
                  <View
                    className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                      turn.role === "agent"
                        ? "bg-accent-recovery/10"
                        : "bg-bg-elevated"
                    }`}
                  >
                    <Text className="text-ink-primary text-sm">
                      {turn.message}
                    </Text>
                  </View>
                  <Text className="text-ink-muted text-[10px] mt-0.5">
                    {formatDuration(Math.floor(turn.time_in_call_secs))}
                  </Text>
                </View>
              ))}
            </View>
          ) : attempt.endedAt ? (
            <View className="bg-bg-elevated rounded-lg p-3">
              <Text className="text-ink-muted text-xs">
                Transcript still processing…
              </Text>
              <Text className="text-ink-muted text-[11px] mt-1">
                Usually 30 seconds after the call ends. This view refreshes
                automatically.
              </Text>
            </View>
          ) : (
            <Text className="text-ink-muted text-xs">Call in progress…</Text>
          )}

          {/* Tools used */}
          {tools.length > 0 ? (
            <View className="gap-1">
              <Text className="text-ink-muted text-[10px] uppercase tracking-widest font-sans-medium mt-1">
                Tools used
              </Text>
              {tools
                .slice()
                .sort((a, b) => a.timestamp - b.timestamp)
                .map((t, j) => (
                  <View
                    key={j}
                    className="bg-bg-elevated rounded-lg px-3 py-2 flex-row items-center gap-2"
                  >
                    <Text className="text-base">{toolEmoji(t.name)}</Text>
                    <View className="flex-1">
                      <Text className="text-ink-primary text-sm font-sans-medium">
                        {toolLabel(t.name, t.args)}
                      </Text>
                    </View>
                  </View>
                ))}
            </View>
          ) : null}

          {/* Audio playback — V1 placeholder. We surface the URL but skip the
              full scrubber to keep scope tight. */}
          {attempt.audioUrl ? (
            <View className="bg-bg-elevated rounded-lg p-3">
              <Text className="text-ink-muted text-[10px] uppercase tracking-widest font-sans-medium">
                Audio
              </Text>
              <Text
                className="text-ink-primary text-xs font-mono mt-1"
                numberOfLines={1}
              >
                {attempt.audioUrl}
              </Text>
            </View>
          ) : null}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

function describeOutcome(o: string): string {
  switch (o) {
    case "agreement_reached":
      return "Agreement";
    case "no_agreement":
      return "No agreement";
    case "customer_cancelled":
      return "Customer cancelled";
    case "abusive_termination":
      return "Ended";
    case "no_answer":
      return "No answer";
    case "busy":
      return "Busy";
    default:
      return o.replace(/_/g, " ");
  }
}

function toolEmoji(name: string): string {
  switch (name) {
    case "pause_subscription":
      return "⏸";
    case "apply_coupon":
      return "🎟";
    case "send_recovery_link":
      return "🔗";
    case "log_callback":
      return "📞";
    case "log_churn":
      return "👋";
    default:
      return "✓";
  }
}

function toolLabel(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "pause_subscription": {
      const days =
        typeof args.resumes_in_days === "number" ? args.resumes_in_days : 30;
      return `Paused subscription · ${days} days`;
    }
    case "apply_coupon": {
      const off =
        typeof args.percent_off === "number" ? args.percent_off : 10;
      return `Applied coupon · ${off}% off`;
    }
    case "send_recovery_link":
      return "Sent recovery link";
    case "log_callback":
      return `Callback logged${args.preferred_time ? ` · ${args.preferred_time}` : ""}`;
    case "log_churn":
      return `Logged churn${args.reason ? ` · ${args.reason}` : ""}`;
    default:
      return name;
  }
}

// silence unused
void useMemo;
void useRef;
