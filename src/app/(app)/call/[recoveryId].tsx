import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Text,
  View,
} from "react-native";
import { LongPressGestureHandler, State } from "react-native-gesture-handler";
import Animated, {
  FadeInRight,
  FadeOutLeft,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@clerk/clerk-expo";
import { Waveform } from "@/components/audio/Waveform";
import { Celebration } from "@/components/call/Celebration";
import { track } from "@/lib/analytics";
import { apiFetch } from "@/lib/api";
import { useCallWebSocket } from "@/lib/ws";
import type { WsEvent } from "@/lib/ws-events";

const SCREEN_W = Dimensions.get("window").width;
const WAVEFORM_W = SCREEN_W - 64;

// CLAUDE.md §6 — recovery state → pill label + tone.
type PillVariant = "muted" | "active" | "success" | "failure";
function pillFor(state: string, hasFiredTools: boolean, lastEvent: WsEvent | null): {
  label: string;
  variant: PillVariant;
} {
  const s = state as
    | "QUEUED"
    | "SCHEDULED"
    | "READY_TO_CALL"
    | "CALLING"
    | "IN_CALL"
    | "RECOVERED_PENDING"
    | "RECOVERED"
    | "RETRY_QUEUED"
    | "FAILED_NEEDS_RETRY"
    | "CHURNED"
    | "ABUSE_TERMINATED"
    | "ABANDONED";
  switch (s) {
    case "QUEUED":
    case "SCHEDULED":
    case "READY_TO_CALL":
      return { label: "Scheduled", variant: "muted" };
    case "CALLING":
      return hasFiredTools
        ? { label: "In conversation", variant: "active" }
        : { label: "Dialing", variant: "muted" };
    case "IN_CALL":
      return { label: "In conversation", variant: "active" };
    case "RECOVERED_PENDING":
    case "RECOVERED":
      return { label: "Recovered", variant: "success" };
    case "FAILED_NEEDS_RETRY":
      return { label: "Ended — no agreement", variant: "failure" };
    case "RETRY_QUEUED":
      return { label: "Retry queued", variant: "muted" };
    case "CHURNED":
      return { label: "Churned", variant: "failure" };
    case "ABUSE_TERMINATED":
      return { label: "Ended", variant: "muted" };
    case "ABANDONED":
      return lastEvent?.type === "call.failed_to_connect"
        ? { label: "Couldn't reach", variant: "failure" }
        : { label: "Abandoned", variant: "muted" };
    default:
      return { label: state, variant: "muted" };
  }
}

const ZERO_DECIMAL = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);
function formatAmount(minorUnits: number, currency: string): string {
  const upper = currency.toUpperCase();
  const value = ZERO_DECIMAL.has(upper) ? minorUnits : minorUnits / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: upper,
    }).format(value);
  } catch {
    return `${value} ${upper}`;
  }
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// Pretty-print a tool fire into a single line for the floating card.
function describeTool(name: string, args: Record<string, unknown>): {
  emoji: string;
  text: string;
} {
  switch (name) {
    case "pause_subscription": {
      const resumes = typeof args.resumes_at === "number" ? args.resumes_at : null;
      const days = resumes
        ? Math.max(1, Math.round((resumes - Date.now() / 1000) / 86400))
        : (args.resumes_in_days as number | undefined) ?? 30;
      return { emoji: "⏸", text: `Paused for ${days} days` };
    }
    case "apply_coupon": {
      const off = (args.percent_off as number | undefined) ?? 10;
      return { emoji: "🎟", text: `Applied ${off}% off` };
    }
    case "send_recovery_link":
      return { emoji: "🔗", text: "Recovery link sent" };
    case "log_callback":
      return {
        emoji: "📞",
        text: `Callback logged${args.preferred_time ? ` · ${args.preferred_time}` : ""}`,
      };
    case "log_churn":
      return {
        emoji: "👋",
        text: `Logged churn${args.reason ? ` · ${args.reason}` : ""}`,
      };
    default:
      return { emoji: "✓", text: name };
  }
}

type ToolCard = {
  id: string;
  emoji: string;
  text: string;
  ts: number;
};

export default function CallScreen() {
  const { recoveryId } = useLocalSearchParams<{ recoveryId: string }>();
  const router = useRouter();
  const { getToken } = useAuth();
  const { snapshot, events, status } = useCallWebSocket(recoveryId);

  useEffect(() => {
    if (recoveryId) track("recovery_call_viewed", { recoveryId });
  }, [recoveryId]);

  const [celebration, setCelebration] = useState<{
    amount: number;
    fee: number;
    currency: string;
  } | null>(null);

  useEffect(() => {
    const rec = events.find((e) => e.type === "recovery.recovered");
    if (rec && rec.type === "recovery.recovered") {
      track("recovery_recovered", {
        recoveryId: rec.data.recoveryId,
        amount: rec.data.amount,
        fee: rec.data.fee,
        currency: rec.data.currency,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCelebration({
        amount: rec.data.amount,
        fee: rec.data.fee,
        currency: rec.data.currency,
      });
      const t = setTimeout(() => setCelebration(null), 3500);
      return () => clearTimeout(t);
    }
  }, [events]);

  // Tool-call cards: seeded from snapshot, extended by live tool.fired events.
  // Auto-evict cards older than 4s. Max 3 visible.
  const [toolCards, setToolCards] = useState<ToolCard[]>([]);
  const seenToolIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!snapshot?.latestCallAttempt) return;
    // Replay any prior tool fires from the snapshot (visible immediately).
    const prior = snapshot.latestCallAttempt.toolCallsFired ?? [];
    const additions: ToolCard[] = [];
    for (const t of prior) {
      const id = `seed:${t.name}:${t.timestamp}`;
      if (seenToolIdsRef.current.has(id)) continue;
      seenToolIdsRef.current.add(id);
      const d = describeTool(t.name, t.args);
      additions.push({ id, emoji: d.emoji, text: d.text, ts: t.timestamp });
    }
    if (additions.length > 0) {
      setToolCards((cur) => [...additions, ...cur].slice(0, 3));
    }
  }, [snapshot]);

  useEffect(() => {
    if (events.length === 0) return;
    const latest = events[events.length - 1];
    if (latest?.type !== "tool.fired") return;
    const id = `live:${latest.data.tool}:${latest.data.ts}`;
    if (seenToolIdsRef.current.has(id)) return;
    seenToolIdsRef.current.add(id);
    const d = describeTool(latest.data.tool, latest.data.args);
    const card: ToolCard = {
      id,
      emoji: d.emoji,
      text: d.text,
      ts: latest.data.ts,
    };
    setToolCards((cur) => [card, ...cur].slice(0, 3));
  }, [events]);

  // Auto-evict cards >4s old.
  useEffect(() => {
    if (toolCards.length === 0) return;
    const oldest = toolCards[toolCards.length - 1];
    if (!oldest) return;
    const age = Date.now() - oldest.ts;
    const remaining = Math.max(0, 4000 - age);
    const t = setTimeout(() => {
      setToolCards((cur) => cur.filter((c) => Date.now() - c.ts < 4000));
    }, remaining + 100);
    return () => clearTimeout(t);
  }, [toolCards]);

  // Call timer — counts up from initiatedAt of latest call_attempt.
  const initiatedAtMs = useMemo(() => {
    const fromSnap = snapshot?.latestCallAttempt?.initiatedAt;
    if (fromSnap) return new Date(fromSnap).getTime();
    const initEvt = events.find((e) => e.type === "call.initiated");
    if (initEvt) return Date.now();
    return null;
  }, [snapshot, events]);

  const endedDurationSecs = useMemo(() => {
    const ended = events.find((e) => e.type === "call.ended");
    if (ended && ended.type === "call.ended") return ended.data.durationSecs;
    return snapshot?.latestCallAttempt?.durationSecs ?? null;
  }, [snapshot, events]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (endedDurationSecs != null) return; // call ended, freeze
    if (initiatedAtMs == null) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [initiatedAtMs, endedDurationSecs]);

  const elapsedSecs =
    endedDurationSecs != null
      ? endedDurationSecs
      : initiatedAtMs != null
        ? Math.floor((now - initiatedAtMs) / 1000)
        : 0;

  // Status pill state.
  const lastEvent = events[events.length - 1] ?? null;
  const hasFiredTools =
    toolCards.length > 0 ||
    (snapshot?.latestCallAttempt?.toolCallsFired?.length ?? 0) > 0;
  const pill = pillFor(
    snapshot?.recovery.state ?? "QUEUED",
    hasFiredTools,
    lastEvent,
  );

  const isCallActive =
    snapshot?.recovery.state === "CALLING" ||
    snapshot?.recovery.state === "IN_CALL";

  // Transition off the call screen after call.ended.
  useEffect(() => {
    const ended = events.find((e) => e.type === "call.ended");
    if (!ended) return;
    if (ended.type !== "call.ended") return;
    void Haptics.notificationAsync(
      ended.data.outcome === "agreement_reached"
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning,
    );
    const t = setTimeout(() => {
      router.replace(`/(app)/recovery/${recoveryId}`);
    }, 1500);
    return () => clearTimeout(t);
  }, [events, recoveryId, router]);

  async function handleEndCallConfirmed() {
    if (!recoveryId) return;
    try {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      const token = await getToken();
      await apiFetch(`/recoveries/${recoveryId}/call`, {
        token,
        init: { method: "DELETE" },
      });
    } catch (err) {
      console.warn("[call] end-call failed", err);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base" edges={["top", "bottom"]}>
      {!snapshot ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#A0A0AB" />
          <Text className="text-ink-secondary text-sm mt-3">
            {status === "error" ? "Connection error" : "Connecting…"}
          </Text>
        </View>
      ) : (
        <View className="flex-1 px-6">
          {/* HEADER STRIP */}
          <View className="pt-4 pb-2 flex-row justify-between items-start">
            <View className="flex-1 pr-3">
              <Text
                className="text-ink-primary text-lg font-sans-semibold"
                numberOfLines={1}
              >
                {snapshot.failedInvoice.customerName ?? "Customer"}
              </Text>
              <Text
                className="text-ink-secondary text-base font-mono mt-1"
                style={{ fontVariant: ["tabular-nums"] }}
                numberOfLines={1}
              >
                {snapshot.failedInvoice.planName ?? "Subscription"} ·{" "}
                {formatAmount(
                  snapshot.failedInvoice.amountDue,
                  snapshot.failedInvoice.currency,
                )}
              </Text>
            </View>
            <StatusPill label={pill.label} variant={pill.variant} />
          </View>

          {/* WAVEFORM + TIMER (centered, takes the upper-mid block) */}
          <View className="flex-1 items-center justify-center">
            <View style={{ height: 120, marginBottom: 32 }}>
              <Waveform
                width={WAVEFORM_W}
                height={120}
                mode="procedural"
                active={isCallActive}
                color={hasFiredTools ? "#10B981" : "#22D3EE"}
              />
            </View>
            <Text
              className={`text-4xl font-mono-semibold ${
                isCallActive ? "text-ink-primary" : "text-ink-secondary"
              }`}
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {formatTime(elapsedSecs)}
            </Text>
          </View>

          {/* TOOL CARDS (floating, anchored to bottom-mid) */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 24,
              right: 24,
              bottom: 140,
              gap: 8,
            }}
          >
            {toolCards.map((card) => (
              <Animated.View
                key={card.id}
                entering={FadeInRight.springify().damping(18)}
                exiting={FadeOutLeft.duration(600)}
                className="bg-bg-elevated border border-border-subtle rounded-2xl px-4 py-3 flex-row items-center gap-3"
              >
                <Text className="text-xl">{card.emoji}</Text>
                <Text
                  className="text-ink-primary text-base font-sans-medium flex-1"
                  numberOfLines={1}
                >
                  {card.text}
                </Text>
              </Animated.View>
            ))}
          </View>

          {/* END CALL — long-press to confirm */}
          {isCallActive ? (
            <View className="items-center pb-4">
              <EndCallButton onConfirm={handleEndCallConfirmed} />
            </View>
          ) : (
            <View className="pb-4 items-center">
              <Text className="text-ink-muted text-xs">
                Call ended · routing to recovery…
              </Text>
            </View>
          )}
        </View>
      )}
      {celebration ? <Celebration {...celebration} /> : null}
    </SafeAreaView>
  );
}

function StatusPill({
  label,
  variant,
}: {
  label: string;
  variant: PillVariant;
}) {
  // Animate bg color when variant changes — simple opacity fade on the
  // outer view via Reanimated. Kept compact to avoid layout shifts.
  const targetBgIdx = useSharedValue(0);
  useEffect(() => {
    const idx =
      variant === "active"
        ? 1
        : variant === "success"
          ? 2
          : variant === "failure"
            ? 3
            : 0;
    targetBgIdx.value = withTiming(idx, { duration: 300 });
  }, [variant, targetBgIdx]);

  const bg =
    variant === "active"
      ? "bg-accent-recovery/20"
      : variant === "success"
        ? "bg-accent-recovery"
        : variant === "failure"
          ? "bg-accent-failure/20"
          : "bg-bg-surface";
  const fg =
    variant === "active"
      ? "text-accent-recovery"
      : variant === "success"
        ? "text-white"
        : variant === "failure"
          ? "text-accent-failure"
          : "text-ink-muted";

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.92 + 0.08 * Math.min(1, targetBgIdx.value),
  }));

  return (
    <Animated.View
      style={animatedStyle}
      className={`${bg} px-3 py-1 rounded-full`}
    >
      <Text
        className={`${fg} text-xs uppercase tracking-widest font-sans-semibold`}
      >
        {label}
      </Text>
    </Animated.View>
  );
}

function EndCallButton({ onConfirm }: { onConfirm: () => void }) {
  const [holding, setHolding] = useState(false);
  return (
    <LongPressGestureHandler
      minDurationMs={800}
      onHandlerStateChange={(evt) => {
        if (evt.nativeEvent.state === State.BEGAN) {
          setHolding(true);
        } else if (evt.nativeEvent.state === State.ACTIVE) {
          onConfirm();
        } else if (
          evt.nativeEvent.state === State.END ||
          evt.nativeEvent.state === State.CANCELLED ||
          evt.nativeEvent.state === State.FAILED
        ) {
          setHolding(false);
        }
      }}
    >
      <Animated.View
        className={`px-6 py-3 rounded-full ${
          holding ? "bg-accent-failure" : "bg-accent-failure/80"
        }`}
        style={{ minWidth: 220, alignItems: "center" }}
      >
        <Text className="text-white text-base font-sans-semibold">
          {holding ? "Keep holding…" : "Hold to end call"}
        </Text>
      </Animated.View>
    </LongPressGestureHandler>
  );
}
