import { useAuth } from "@clerk/clerk-expo";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Waveform } from "@/components/audio/Waveform";
import { StateBadge } from "@/components/recoveries/StateBadge";
import { ApiError, apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/format";
import { useMerchantWebSocket } from "@/lib/ws";

type RecoveryItem = {
  id: string;
  state: string;
  attempts: number;
  recoveredAmount: number | null;
  createdAt: string;
  updatedAt: string;
  latestCallAttemptAt: string | null;
  failedInvoice: {
    customerName: string | null;
    customerEmail: string | null;
    planName: string | null;
    amountDue: number;
    currency: string;
    attemptCountStripe: number | null;
  };
};

type ListResponse = {
  items: RecoveryItem[];
  nextCursor: string | null;
  total?: number;
};

type SummaryResponse = {
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

type FilterValue = "all" | "active" | "recovered" | "failed";

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "recovered", label: "Recovered" },
  { value: "failed", label: "Failed" },
];

export default function RecoveriesScreen() {
  const { isSignedIn, getToken } = useAuth();
  const router = useRouter();
  const ws = useMerchantWebSocket();

  const [filter, setFilter] = useState<FilterValue>("all");
  const [items, setItems] = useState<RecoveryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [merchantName, setMerchantName] = useState<string | null>(null);
  const initialMountRef = useRef(true);
  const knownIdsRef = useRef<Set<string>>(new Set());

  const fetchPage = useCallback(
    async (opts: { reset?: boolean; cursor?: string | null }) => {
      const token = await getToken();
      const params = new URLSearchParams();
      params.set("state", filter);
      params.set("limit", "20");
      if (opts.cursor) params.set("cursor", opts.cursor);
      const res = await apiFetch<ListResponse>(
        `/recoveries?${params.toString()}`,
        { token },
      );
      if (opts.reset) {
        setItems(res.items);
        knownIdsRef.current = new Set(res.items.map((it) => it.id));
        if (res.total != null) setTotal(res.total);
      } else {
        const newOnes = res.items.filter(
          (it) => !knownIdsRef.current.has(it.id),
        );
        for (const it of newOnes) knownIdsRef.current.add(it.id);
        setItems((prev) => [...prev, ...newOnes]);
      }
      setCursor(res.nextCursor);
    },
    [filter, getToken],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await fetchPage({ reset: true, cursor: null });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `${err.status}: ${err.message}`
          : err instanceof Error
            ? err.message
            : "Failed to load recoveries",
      );
    } finally {
      setRefreshing(false);
    }
  }, [fetchPage]);

  // Refetch list when merchant-scoped lifecycle events arrive.
  const lastWsEvent = ws.events[ws.events.length - 1];
  useEffect(() => {
    if (!lastWsEvent) return;
    if (
      lastWsEvent.type === "recovery.queued" ||
      lastWsEvent.type === "recovery.scheduled" ||
      lastWsEvent.type === "call.initiated" ||
      lastWsEvent.type === "call.ended" ||
      lastWsEvent.type === "call.failed_to_connect" ||
      lastWsEvent.type === "recovery.recovered" ||
      lastWsEvent.type === "recovery.failed"
    ) {
      void fetchPage({ reset: true, cursor: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastWsEvent]);

  // Re-pull when the user returns to this tab (e.g. after a celebration on
  // /(app)/recovery/[id]). Hero metric reanimates its ticker if value changed.
  useFocusEffect(
    useCallback(() => {
      if (!isSignedIn) return;
      let cancelled = false;
      (async () => {
        try {
          const token = await getToken();
          const [list, sum] = await Promise.all([
            apiFetch<ListResponse>(
              `/recoveries?state=${filter}&limit=20`,
              { token },
            ),
            apiFetch<SummaryResponse>("/analytics/summary?range=30d", {
              token,
            }).catch(() => null),
          ]);
          if (cancelled) return;
          setItems(list.items);
          knownIdsRef.current = new Set(list.items.map((it) => it.id));
          if (list.total != null) setTotal(list.total);
          setCursor(list.nextCursor);
          setSummary(sum);
        } catch (err) {
          console.warn("[recoveries] focus refetch failed", err);
        }
      })();
      return () => {
        cancelled = true;
      };
      // intentionally don't depend on getToken (unstable Clerk ref)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filter, isSignedIn]),
  );

  // Initial load + filter change.
  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const token = await getToken();
        const [list, sum, me] = await Promise.all([
          apiFetch<ListResponse>(
            `/recoveries?state=${filter}&limit=20`,
            { token },
          ),
          apiFetch<SummaryResponse>("/analytics/summary?range=30d", {
            token,
          }).catch(() => null),
          apiFetch<{ merchant: { name: string } }>("/me", { token }).catch(
            () => null,
          ),
        ]);
        if (cancelled) return;
        setItems(list.items);
        knownIdsRef.current = new Set(list.items.map((it) => it.id));
        if (list.total != null) setTotal(list.total);
        setCursor(list.nextCursor);
        setSummary(sum);
        if (me) setMerchantName(me.merchant.name);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? `${err.status}: ${err.message}`
            : err instanceof Error
              ? err.message
              : "Failed to load recoveries",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
          initialMountRef.current = false;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, isSignedIn]);

  const handleEndReached = useCallback(async () => {
    if (loadingMore || !cursor) return;
    setLoadingMore(true);
    try {
      await fetchPage({ cursor });
    } catch (err) {
      console.warn("[recoveries] page load failed", err);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, fetchPage, loadingMore]);

  const handleFilterChange = useCallback((next: FilterValue) => {
    if (next === filter) return;
    // No haptic on chip changes — was haptic spam per CLAUDE.md §12.
    setFilter(next);
  }, [filter]);

  return (
    <SafeAreaView className="flex-1 bg-bg-base" edges={["top"]}>
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        renderItem={({ item, index }) => (
          <RecoveryRow
            item={item}
            index={index}
            shouldAnimate={!initialMountRef.current}
            onPress={() => router.push(`/(app)/recovery/${item.id}`)}
          />
        )}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 140, gap: 8 }}
        ListHeaderComponent={
          <ListHeader
            merchantName={merchantName}
            summary={summary}
            filter={filter}
            onFilterChange={handleFilterChange}
            total={total}
            onAnalyticsPress={() => router.push("/(app)/(tabs)/analytics")}
          />
        }
        ListEmptyComponent={loading ? null : <EmptyState filter={filter} />}
        ListFooterComponent={
          loadingMore ? (
            <View className="items-center py-6">
              <Text className="text-ink-muted text-xs">Loading more…</Text>
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor="#10B981"
          />
        }
        onEndReachedThreshold={0.4}
        onEndReached={handleEndReached}
        showsVerticalScrollIndicator={false}
      />
      {error ? (
        <View className="absolute bottom-4 left-4 right-4 bg-accent-failure/20 border border-accent-failure rounded-xl p-3">
          <Text className="text-accent-failure text-sm">{error}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );

}

function ListHeader({
  merchantName,
  summary,
  filter,
  onFilterChange,
  total,
  onAnalyticsPress,
}: {
  merchantName: string | null;
  summary: SummaryResponse | null;
  filter: FilterValue;
  onFilterChange: (f: FilterValue) => void;
  total: number | null;
  onAnalyticsPress: () => void;
}) {
  return (
    <View className="pt-2 pb-3 gap-5">
      <View className="gap-1">
        <Text className="text-ink-primary text-3xl font-sans-bold">
          Recoveries
        </Text>
        <Text className="text-ink-secondary text-sm">
          {merchantName ?? " "}
        </Text>
      </View>

      <HeroMetric summary={summary} onPress={onAnalyticsPress} />

      <FilterRow filter={filter} onChange={onFilterChange} total={total} />
    </View>
  );
}

function HeroMetric({
  summary,
  onPress,
}: {
  summary: SummaryResponse | null;
  onPress: () => void;
}) {
  // Tick-up driven from the JS thread so we can format with Intl. A worklet
  // can't call formatAmount (Intl.NumberFormat isn't worklet-safe).
  const [displayValue, setDisplayValue] = useState(0);
  useEffect(() => {
    if (!summary) return;
    const target = summary.totalRecoveredAmount;
    if (target === 0) {
      setDisplayValue(0);
      return;
    }
    const start = performance.now();
    const duration = 700;
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [summary]);

  const deltaPct = useMemo(() => {
    if (!summary) return null;
    const prev = summary.previousTotalRecoveredAmount;
    const cur = summary.totalRecoveredAmount;
    if (prev === 0 && cur === 0) return null;
    if (prev === 0) return 100;
    return ((cur - prev) / prev) * 100;
  }, [summary]);

  return (
    <Pressable
      onPress={onPress}
      className="bg-bg-surface rounded-2xl p-5 active:opacity-80"
    >
      <Text className="text-ink-muted text-xs uppercase tracking-widest font-sans-medium">
        Recovered this month
      </Text>
      <Text
        className="text-ink-primary text-4xl font-mono-semibold mt-2"
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {summary ? formatAmount(displayValue, summary.currency) : "—"}
      </Text>
      {deltaPct !== null && summary ? (
        <Text
          className={`mt-1 text-sm font-mono ${
            deltaPct >= 0 ? "text-accent-recovery" : "text-accent-failure"
          }`}
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {deltaPct >= 0 ? "↑" : "↓"} {Math.abs(deltaPct).toFixed(1)}% vs last 30d
        </Text>
      ) : (
        <Text className="text-ink-muted text-sm mt-1">No prior period data</Text>
      )}
    </Pressable>
  );
}

function FilterRow({
  filter,
  onChange,
  total,
}: {
  filter: FilterValue;
  onChange: (f: FilterValue) => void;
  total: number | null;
}) {
  return (
    <View className="flex-row items-center gap-2">
      {FILTERS.map((f) => {
        const active = f.value === filter;
        return (
          <Pressable
            key={f.value}
            onPress={() => onChange(f.value)}
            className={`px-3 py-1.5 rounded-full ${
              active
                ? "bg-accent-recovery"
                : "bg-bg-surface border border-border-subtle"
            }`}
          >
            <Text
              className={`text-sm font-sans-medium ${
                active ? "text-white" : "text-ink-secondary"
              }`}
            >
              {f.label}
            </Text>
          </Pressable>
        );
      })}
      {total != null && filter === "all" ? (
        <Text className="text-ink-muted text-xs ml-auto">
          {total} total
        </Text>
      ) : null}
    </View>
  );
}

function RecoveryRow({
  item,
  index,
  shouldAnimate,
  onPress,
}: {
  item: RecoveryItem;
  index: number;
  shouldAnimate: boolean;
  onPress: () => void;
}) {
  const inner = (
    <Pressable
      onPress={onPress}
      className="bg-bg-surface rounded-xl p-4 active:opacity-80"
    >
      <View className="flex-row justify-between items-center">
        <Text
          className="text-ink-primary text-base font-sans-semibold flex-1 pr-3"
          numberOfLines={1}
        >
          {item.failedInvoice.customerName ?? "Customer"}
        </Text>
        <Text
          className="text-ink-primary text-base font-mono"
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {formatAmount(item.failedInvoice.amountDue, item.failedInvoice.currency)}
        </Text>
      </View>
      <View className="flex-row justify-between items-center mt-1.5">
        <Text
          className="text-ink-secondary text-sm flex-1 pr-3"
          numberOfLines={1}
        >
          {item.failedInvoice.planName ?? "Subscription"}
        </Text>
        <StateBadge state={item.state} />
      </View>
    </Pressable>
  );
  if (!shouldAnimate || index >= 8) return inner;
  return (
    <Animated.View
      entering={FadeInDown.delay(index * 40).springify().damping(18)}
    >
      {inner}
    </Animated.View>
  );
}

function EmptyState({ filter }: { filter: FilterValue }) {
  return (
    <View className="items-center py-20" style={{ opacity: 1 }}>
      <View style={{ opacity: 0.3 }}>
        <Waveform
          width={200}
          height={60}
          mode="procedural"
          active={false}
          color="#A0A0AB"
        />
      </View>
      <Text className="text-ink-primary text-lg font-sans-semibold mt-6">
        {filter === "all" ? "No recoveries yet" : `No ${filter} recoveries`}
      </Text>
      <Text className="text-ink-secondary text-sm mt-1 text-center px-8">
        Recoveries appear here when your customers&apos; payments fail.
      </Text>
    </View>
  );
}
