import { useAuth } from "@clerk/clerk-expo";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Canvas, Path, Skia } from "@shopify/react-native-skia";
import { ApiError, apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/format";
import { useMerchantWebSocket } from "@/lib/ws";

type Range = "7d" | "30d" | "90d";

type Summary = {
  totalRecoveredAmount: number;
  recoveryRatePct: number;
  avgRecoveredAmount: number;
  feeEarnedAmount: number;
  currency: string;
  rangeStart: string;
  rangeEnd: string;
  previousTotalRecoveredAmount: number;
  previousRecoveryRatePct: number;
};
type TimeseriesPoint = { date: string; value: number };
type OutcomeBreakdown = {
  breakdown: {
    recovered: number;
    churned: number;
    abandoned: number;
    abuse_terminated: number;
    retrying: number;
  };
  total: number;
};

const RANGES: { value: Range; label: string }[] = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
];

export default function AnalyticsScreen() {
  const { isSignedIn, getToken } = useAuth();
  const [range, setRange] = useState<Range>("30d");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [series, setSeries] = useState<TimeseriesPoint[]>([]);
  const [outcomes, setOutcomes] = useState<OutcomeBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const [s, t, o] = await Promise.all([
        apiFetch<Summary>(`/analytics/summary?range=${range}`, { token }),
        apiFetch<{ points: TimeseriesPoint[] }>(
          `/analytics/timeseries?range=${range}&metric=recovered`,
          { token },
        ),
        apiFetch<OutcomeBreakdown>(`/analytics/outcomes?range=${range}`, {
          token,
        }),
      ]);
      setSummary(s);
      setSeries(t.points);
      setOutcomes(o);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `${err.status}: ${err.message}`
          : err instanceof Error
            ? err.message
            : "Failed to load analytics",
      );
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  useEffect(() => {
    if (!isSignedIn) return;
    void load();
    // load is recreated when getToken's identity flips (Clerk-Expo quirk);
    // we only want to refetch on sign-in and range change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, range]);

  const ws = useMerchantWebSocket();
  const lastWsEvent = ws.events[ws.events.length - 1];
  useEffect(() => {
    if (!lastWsEvent) return;
    if (
      lastWsEvent.type === "recovery.recovered" ||
      lastWsEvent.type === "recovery.failed" ||
      lastWsEvent.type === "call.ended"
    ) {
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastWsEvent]);

  function handleRange(next: Range) {
    if (next === range) return;
    // No haptic on segment change — haptic spam per CLAUDE.md §12.
    setRange(next);
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base" edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 20, paddingBottom: 140 }}>
        <Text className="text-ink-primary text-3xl font-sans-bold">
          Analytics
        </Text>

        <View className="flex-row gap-2 bg-bg-surface rounded-full p-1 self-start">
          {RANGES.map((r) => {
            const active = r.value === range;
            return (
              <Pressable
                key={r.value}
                onPress={() => handleRange(r.value)}
                className={`px-4 py-1.5 rounded-full ${
                  active ? "bg-bg-elevated" : ""
                }`}
              >
                <Text
                  className={`text-sm font-sans-medium ${
                    active ? "text-ink-primary" : "text-ink-secondary"
                  }`}
                >
                  {r.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <View className="items-center py-12">
            <ActivityIndicator color="#A0A0AB" />
          </View>
        ) : error ? (
          <View className="bg-bg-surface rounded-xl p-5">
            <Text className="text-accent-failure text-sm">{error}</Text>
          </View>
        ) : summary ? (
          <>
            <View className="flex-row flex-wrap gap-3">
              <KpiCard
                label="Total recovered"
                value={formatAmount(summary.totalRecoveredAmount, summary.currency)}
                delta={pctDelta(
                  summary.totalRecoveredAmount,
                  summary.previousTotalRecoveredAmount,
                )}
                series={series}
              />
              <KpiCard
                label="Recovery rate"
                value={`${summary.recoveryRatePct.toFixed(1)}%`}
                delta={pctDelta(
                  summary.recoveryRatePct,
                  summary.previousRecoveryRatePct,
                )}
                series={null}
              />
              <KpiCard
                label="Avg recovered"
                value={formatAmount(
                  summary.avgRecoveredAmount,
                  summary.currency,
                )}
                delta={null}
                series={null}
              />
              <KpiCard
                label="Fee earned"
                value={formatAmount(summary.feeEarnedAmount, summary.currency)}
                delta={null}
                series={null}
              />
            </View>

            {outcomes ? <OutcomeCard outcomes={outcomes} /> : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function pctDelta(cur: number, prev: number): number | null {
  if (prev === 0 && cur === 0) return null;
  if (prev === 0) return 100;
  return ((cur - prev) / prev) * 100;
}

function KpiCard({
  label,
  value,
  delta,
  series,
}: {
  label: string;
  value: string;
  delta: number | null;
  series: TimeseriesPoint[] | null;
}) {
  // Width: 2-column grid with 12px gap on 24px-padded screen.
  const screenW = Dimensions.get("window").width;
  const cardW = (screenW - 48 - 12) / 2;
  return (
    <View
      className="bg-bg-surface rounded-2xl p-4 gap-1"
      style={{ width: cardW }}
    >
      <Text className="text-ink-muted text-[10px] uppercase tracking-widest font-sans-medium">
        {label}
      </Text>
      <Text
        className="text-ink-primary text-2xl font-mono-semibold"
        style={{ fontVariant: ["tabular-nums"] }}
        numberOfLines={1}
      >
        {value}
      </Text>
      {delta !== null ? (
        <Text
          className={`text-xs font-mono mt-0.5 ${
            delta >= 0 ? "text-accent-recovery" : "text-accent-failure"
          }`}
        >
          {delta >= 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}%
        </Text>
      ) : (
        <Text className="text-ink-muted text-xs mt-0.5">—</Text>
      )}
      {series && series.length > 1 ? (
        <View style={{ height: 32, marginTop: 6 }}>
          <Sparkline points={series} width={cardW - 32} height={32} />
        </View>
      ) : null}
    </View>
  );
}

function Sparkline({
  points,
  width,
  height,
}: {
  points: TimeseriesPoint[];
  width: number;
  height: number;
}) {
  const path = useMemo(() => {
    const vals = points.map((p) => p.value);
    const max = Math.max(...vals, 1);
    const min = Math.min(...vals, 0);
    const range = Math.max(1, max - min);
    const p = Skia.Path.Make();
    points.forEach((pt, i) => {
      const x = (i / Math.max(1, points.length - 1)) * width;
      const y = height - ((pt.value - min) / range) * (height - 2) - 1;
      if (i === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    });
    return p;
  }, [points, width, height]);

  return (
    <Canvas style={{ width, height }}>
      <Path
        path={path}
        color="#10B981"
        style="stroke"
        strokeWidth={1.5}
        strokeJoin="round"
        strokeCap="round"
      />
    </Canvas>
  );
}

function OutcomeCard({ outcomes }: { outcomes: OutcomeBreakdown }) {
  const { breakdown, total } = outcomes;
  if (total === 0) {
    return (
      <View className="bg-bg-surface rounded-2xl p-5">
        <Text className="text-ink-muted text-xs uppercase tracking-widest font-sans-medium">
          Outcome breakdown
        </Text>
        <Text className="text-ink-secondary text-sm mt-3">
          Not enough recovery activity yet.
        </Text>
      </View>
    );
  }

  const segments = [
    { key: "recovered", label: "Recovered", n: breakdown.recovered, color: "#10B981" },
    { key: "retrying", label: "Retrying", n: breakdown.retrying, color: "#22D3EE" },
    { key: "churned", label: "Churned", n: breakdown.churned, color: "#EF4444" },
    { key: "abandoned", label: "Abandoned", n: breakdown.abandoned, color: "#6C6C74" },
    {
      key: "abuse_terminated",
      label: "Ended early",
      n: breakdown.abuse_terminated,
      color: "#A0A0AB",
    },
  ].filter((s) => s.n > 0);

  return (
    <View className="bg-bg-surface rounded-2xl p-5 gap-4">
      <View className="flex-row justify-between items-end">
        <Text className="text-ink-muted text-xs uppercase tracking-widest font-sans-medium">
          Outcome breakdown
        </Text>
        <Text className="text-ink-secondary text-xs">{total} recoveries</Text>
      </View>

      {/* Horizontal stacked bar */}
      <View className="flex-row h-3 rounded-full overflow-hidden bg-bg-elevated">
        {segments.map((s) => (
          <View
            key={s.key}
            style={{
              backgroundColor: s.color,
              flexBasis: `${(s.n / total) * 100}%`,
            }}
          />
        ))}
      </View>

      {/* Legend */}
      <View className="gap-2">
        {segments.map((s) => (
          <View
            key={s.key}
            className="flex-row items-center justify-between"
          >
            <View className="flex-row items-center gap-2">
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: s.color,
                }}
              />
              <Text className="text-ink-primary text-sm">{s.label}</Text>
            </View>
            <Text
              className="text-ink-secondary text-sm font-mono"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {s.n} · {((s.n / total) * 100).toFixed(0)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
