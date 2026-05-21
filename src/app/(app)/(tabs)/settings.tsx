import { useAuth, useClerk, useUser } from "@clerk/clerk-expo";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import { Pause, Play } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { ApiError, apiBaseUrl, apiFetch } from "@/lib/api";
import { useOnboardingState } from "@/lib/onboardingState";

type AgentConfig = {
  merchant: {
    name: string;
    applicationFeePercent: number;
    workingHoursStart: number | null;
    workingHoursEnd: number | null;
    timezone: string | null;
    maxRetryAttempts: number | null;
  };
  agent: {
    agentId: string | null;
    defaultVoiceId: string | null;
    agentPhoneNumberId: string | null;
    knowledgeBaseDocsCount: number;
  };
  voicePreviewAvailable: boolean;
};

type MeResponse = {
  merchant: {
    stripeAccountId: string | null;
    stripeAccountStatus: string | null;
  };
};

const FEE_OPTIONS = [5, 10, 15, 20, 25];
const RETRY_OPTIONS = [1, 2, 3, 4, 5, 6];

export default function SettingsScreen() {
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { refetch: refetchOnboarding } = useOnboardingState();
  const router = useRouter();

  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [savedField, setSavedField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    "disconnect" | "delete" | null
  >(null);

  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [voicePlaying, setVoicePlaying] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const playerRef = useRef<AudioPlayer | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const [c, m] = await Promise.all([
        apiFetch<AgentConfig>("/agent/config", { token }),
        apiFetch<MeResponse>("/me", { token }),
      ]);
      setConfig(c);
      setMe(m);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `${err.status}: ${err.message}`
          : err instanceof Error
            ? err.message
            : "Failed to load settings",
      );
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (!isSignedIn) return;
    void load();
    // load is recreated when getToken's identity flips (Clerk-Expo quirk);
    // we only want to refetch on sign-in, not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  useEffect(() => {
    return () => {
      if (playerRef.current) {
        playerRef.current.remove();
        playerRef.current = null;
      }
    };
  }, []);

  const patchConfig = useCallback(
    async (field: string, partial: Record<string, unknown>) => {
      setSavingField(field);
      try {
        const token = await getToken();
        await apiFetch("/agent/config", {
          token,
          init: {
            method: "PATCH",
            body: JSON.stringify(partial),
          },
        });
        // No haptic on stepper save — was spam per CLAUDE.md §12. Saved
        // affordance is purely visual via setSavedField.
        setSavedField(field);
        setTimeout(() => setSavedField(null), 1500);
        // Apply locally so UI reflects without refetch.
        setConfig((cur) =>
          cur
            ? { ...cur, merchant: { ...cur.merchant, ...partial } }
            : cur,
        );
      } catch (err) {
        console.warn("[settings] patch failed", err);
      } finally {
        setSavingField(null);
      }
    },
    [getToken],
  );

  async function handleResetVoice() {
    try {
      const token = await getToken();
      await apiFetch("/agent/reset-voice", {
        token,
        init: { method: "POST" },
      });
      await refetchOnboarding();
    } catch (err) {
      console.warn("[settings] reset voice failed", err);
    }
  }

  async function handleResetKnowledge() {
    try {
      const token = await getToken();
      await apiFetch("/agent/reset-knowledge", {
        token,
        init: { method: "POST" },
      });
      await refetchOnboarding();
    } catch (err) {
      console.warn("[settings] reset knowledge failed", err);
    }
  }

  async function handleVoicePreview() {
    if (!config?.voicePreviewAvailable) return;
    if (voicePlaying && playerRef.current) {
      playerRef.current.pause();
      setVoicePlaying(false);
      return;
    }
    setVoiceLoading(true);
    try {
      if (!voiceUrl) {
        const token = await getToken();
        const res = await fetch(`${apiBaseUrl}/agent/test-voice`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`voice fetch failed: ${res.status}`);
        }
        const buf = await res.arrayBuffer();
        const b64 = arrayBufferToBase64(buf);
        const dest = `${FileSystem.cacheDirectory}voice-preview.mp3`;
        await FileSystem.writeAsStringAsync(dest, b64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        setVoiceUrl(dest);
        if (!playerRef.current) {
          playerRef.current = createAudioPlayer({ uri: dest });
          playerRef.current.addListener("playbackStatusUpdate", (st) => {
            if (st.didJustFinish) {
              setVoicePlaying(false);
              playerRef.current?.seekTo(0);
            }
          });
        }
      }
      playerRef.current?.play();
      setVoicePlaying(true);
    } catch (err) {
      console.warn("[settings] voice preview failed", err);
    } finally {
      setVoiceLoading(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-bg-base items-center justify-center">
        <ActivityIndicator color="#A0A0AB" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base" edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: 24, gap: 20, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-ink-primary text-3xl font-sans-bold">
          Settings
        </Text>

        {error ? (
          <View className="bg-accent-failure/20 rounded-xl p-3">
            <Text className="text-accent-failure text-sm">{error}</Text>
          </View>
        ) : null}

        {/* Profile */}
        <View className="bg-bg-surface rounded-2xl p-5 gap-3">
          <View className="flex-row items-center gap-4">
            <View
              className="w-14 h-14 rounded-full bg-bg-elevated items-center justify-center"
            >
              <Text className="text-ink-primary text-xl font-sans-semibold">
                {(
                  user?.firstName?.[0] ??
                  user?.primaryEmailAddress?.emailAddress?.[0] ??
                  "?"
                ).toUpperCase()}
              </Text>
            </View>
            <View className="flex-1">
              <Text
                className="text-ink-primary text-base font-sans-semibold"
                numberOfLines={1}
              >
                {user?.firstName || user?.primaryEmailAddress?.emailAddress}
              </Text>
              <Text className="text-ink-muted text-xs">admin</Text>
              <Text
                className="text-ink-secondary text-xs mt-1"
                numberOfLines={1}
              >
                {config?.merchant.name}
              </Text>
            </View>
          </View>
        </View>

        {/* Stripe Connect */}
        <Section title="Stripe Connect">
          <Row
            label="Status"
            value={
              me?.merchant.stripeAccountStatus === "active" ? (
                <Text className="text-accent-recovery text-sm font-sans-semibold">
                  Active
                </Text>
              ) : (
                <Text className="text-accent-failure text-sm font-sans-semibold">
                  Action required
                </Text>
              )
            }
          />
          <Row
            label="Account ID"
            value={
              <Text
                className="text-ink-muted text-xs font-mono"
                numberOfLines={1}
              >
                {me?.merchant.stripeAccountId ?? "—"}
              </Text>
            }
          />
        </Section>

        {/* Agent config */}
        <Section title="Agent">
          <Row
            label="Your voice"
            value={
              <Pressable
                disabled={!config?.voicePreviewAvailable || voiceLoading}
                onPress={handleVoicePreview}
                className={`flex-row items-center gap-1 px-3 py-1.5 rounded-full ${
                  config?.voicePreviewAvailable
                    ? "bg-bg-elevated active:opacity-80"
                    : "bg-bg-elevated opacity-40"
                }`}
              >
                {voiceLoading ? (
                  <ActivityIndicator size="small" color="#EEEEEF" />
                ) : voicePlaying ? (
                  <Pause size={14} color="#EEEEEF" fill="#EEEEEF" />
                ) : (
                  <Play size={14} color="#EEEEEF" fill="#EEEEEF" />
                )}
                <Text className="text-ink-primary text-sm font-sans-medium">
                  {voicePlaying ? "Pause" : "Preview"}
                </Text>
              </Pressable>
            }
          />
          {config?.agent.defaultVoiceId === "__SKIP__" ? (
            <Text className="text-ink-muted text-xs px-1 -mt-1">
              Voice not configured yet
            </Text>
          ) : null}
          <ActionRow
            label="Re-record voice"
            onPress={() =>
              router.push({
                pathname: "/edit/voice",
                params: { mode: "edit" },
              })
            }
          />
          <Row
            label="Agent ID"
            value={
              <Text
                className="text-ink-muted text-xs font-mono"
                numberOfLines={1}
              >
                {config?.agent.agentId ?? "—"}
              </Text>
            }
          />
          <Row
            label="Knowledge base"
            value={
              <Text className="text-ink-secondary text-sm">
                {config?.agent.knowledgeBaseDocsCount ?? 0} document
                {config?.agent.knowledgeBaseDocsCount === 1 ? "" : "s"}
              </Text>
            }
          />
          <ActionRow
            label="Edit knowledge"
            onPress={() =>
              router.push({
                pathname: "/edit/knowledge",
                params: { mode: "edit" },
              })
            }
          />
          <StepperRow
            label="Recovery fee"
            options={FEE_OPTIONS}
            value={config?.merchant.applicationFeePercent ?? 10}
            suffix="%"
            saving={savingField === "applicationFeePercent"}
            saved={savedField === "applicationFeePercent"}
            onChange={(v) =>
              patchConfig("applicationFeePercent", {
                applicationFeePercent: v,
              })
            }
          />
          <StepperRow
            label="Max retry attempts"
            options={RETRY_OPTIONS}
            value={config?.merchant.maxRetryAttempts ?? 4}
            saving={savingField === "maxRetryAttempts"}
            saved={savedField === "maxRetryAttempts"}
            onChange={(v) =>
              patchConfig("maxRetryAttempts", { maxRetryAttempts: v })
            }
          />
          <HoursRow
            startHour={config?.merchant.workingHoursStart ?? 9}
            endHour={config?.merchant.workingHoursEnd ?? 18}
            timezone={config?.merchant.timezone ?? "America/New_York"}
            saving={
              savingField === "workingHoursStart" ||
              savingField === "workingHoursEnd"
            }
            saved={
              savedField === "workingHoursStart" ||
              savedField === "workingHoursEnd"
            }
            onChange={(field, v) => patchConfig(field, { [field]: v })}
          />
        </Section>

        {/* Danger zone */}
        <View className="gap-2 mt-4">
          <Text className="text-ink-muted text-xs uppercase tracking-widest font-sans-medium px-1">
            Danger zone
          </Text>
          <Pressable
            onPress={() => setConfirmAction("disconnect")}
            className="bg-bg-surface rounded-xl py-3.5 items-center active:opacity-80"
          >
            <Text className="text-accent-failure text-sm font-sans-semibold">
              Disconnect Stripe
            </Text>
          </Pressable>
          <Pressable
            onPress={() => signOut()}
            className="bg-bg-surface rounded-xl py-3.5 items-center active:opacity-80"
          >
            <Text className="text-ink-primary text-sm font-sans-semibold">
              Sign out
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setConfirmAction("delete")}
            className="bg-bg-surface rounded-xl py-3.5 items-center active:opacity-80"
          >
            <Text className="text-accent-failure text-sm font-sans-semibold">
              Delete account
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <ConfirmSheet
        open={confirmAction !== null}
        title={
          confirmAction === "disconnect"
            ? "Disconnect Stripe?"
            : confirmAction === "delete"
              ? "Delete account?"
              : ""
        }
        subtitle={
          confirmAction === "disconnect"
            ? "Recovery calls will stop firing. You'll need to reconnect to resume."
            : confirmAction === "delete"
              ? "This permanently removes your workspace, voice, and recoveries."
              : ""
        }
        confirmLabel={
          confirmAction === "disconnect" ? "Disconnect" : "Delete"
        }
        onConfirm={async () => {
          const action = confirmAction;
          setConfirmAction(null);
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Warning,
          );
          try {
            const token = await getToken();
            if (action === "disconnect") {
              await apiFetch("/agent/disconnect-stripe", {
                token,
                init: { method: "POST" },
              });
              await load();
            } else if (action === "delete") {
              await apiFetch("/agent/account", {
                token,
                init: { method: "DELETE" },
              });
              await signOut();
            }
          } catch (err) {
            console.warn("[settings] destructive op failed", err);
          }
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </SafeAreaView>
  );
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return globalThis.btoa(binary);
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-2">
      <Text className="text-ink-muted text-xs uppercase tracking-widest font-sans-medium px-1">
        {title}
      </Text>
      <View className="bg-bg-surface rounded-2xl py-1">{children}</View>
    </View>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center justify-between px-5 py-3">
      <Text className="text-ink-primary text-sm">{label}</Text>
      <View>{value}</View>
    </View>
  );
}

function ActionRow({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between px-5 py-3 active:opacity-60"
    >
      <Text className="text-accent-neutral text-sm font-sans-medium">
        {label}
      </Text>
      <ChevronRight size={16} color="#22D3EE" />
    </Pressable>
  );
}

function StepperRow({
  label,
  options,
  value,
  suffix,
  saving,
  saved,
  onChange,
}: {
  label: string;
  options: number[];
  value: number;
  suffix?: string;
  saving: boolean;
  saved: boolean;
  onChange: (v: number) => void;
}) {
  const idx = Math.max(0, options.indexOf(value));
  const dec = () => {
    if (idx <= 0) return;
    onChange(options[idx - 1]!);
  };
  const inc = () => {
    if (idx >= options.length - 1) return;
    onChange(options[idx + 1]!);
  };
  return (
    <View className="px-5 py-3 flex-row items-center justify-between">
      <View className="flex-row items-center gap-2">
        <Text className="text-ink-primary text-sm">{label}</Text>
        {saving ? (
          <ActivityIndicator size="small" color="#A0A0AB" />
        ) : saved ? (
          <Text className="text-accent-recovery text-[10px] font-sans-medium">
            Saved
          </Text>
        ) : null}
      </View>
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={dec}
          disabled={idx <= 0}
          className={`w-7 h-7 rounded-full items-center justify-center ${
            idx <= 0 ? "bg-bg-elevated opacity-40" : "bg-bg-elevated"
          }`}
        >
          <Text className="text-ink-primary text-base">−</Text>
        </Pressable>
        <Text
          className="text-ink-primary text-base font-mono w-12 text-center"
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {value}
          {suffix ?? ""}
        </Text>
        <Pressable
          onPress={inc}
          disabled={idx >= options.length - 1}
          className={`w-7 h-7 rounded-full items-center justify-center ${
            idx >= options.length - 1
              ? "bg-bg-elevated opacity-40"
              : "bg-bg-elevated"
          }`}
        >
          <Text className="text-ink-primary text-base">+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function HoursRow({
  startHour,
  endHour,
  timezone,
  saving,
  saved,
  onChange,
}: {
  startHour: number;
  endHour: number;
  timezone: string;
  saving: boolean;
  saved: boolean;
  onChange: (
    field: "workingHoursStart" | "workingHoursEnd",
    v: number,
  ) => void;
}) {
  function cycle(field: "workingHoursStart" | "workingHoursEnd", cur: number) {
    // Cycle in 2-hour increments to keep the demo snappy.
    const next = (cur + 2) % 24;
    onChange(field, next);
  }
  return (
    <View className="px-5 py-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Text className="text-ink-primary text-sm">Calling hours</Text>
          {saving ? (
            <ActivityIndicator size="small" color="#A0A0AB" />
          ) : saved ? (
            <Text className="text-accent-recovery text-[10px] font-sans-medium">
              Saved
            </Text>
          ) : null}
        </View>
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => cycle("workingHoursStart", startHour)}
            className="bg-bg-elevated px-2.5 py-1 rounded-md"
          >
            <Text
              className="text-ink-primary text-sm font-mono"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {startHour.toString().padStart(2, "0")}:00
            </Text>
          </Pressable>
          <Text className="text-ink-muted text-xs">to</Text>
          <Pressable
            onPress={() => cycle("workingHoursEnd", endHour)}
            className="bg-bg-elevated px-2.5 py-1 rounded-md"
          >
            <Text
              className="text-ink-primary text-sm font-mono"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {endHour.toString().padStart(2, "0")}:00
            </Text>
          </Pressable>
        </View>
      </View>
      <Text className="text-ink-muted text-xs mt-2">{timezone}</Text>
    </View>
  );
}

function ConfirmSheet({
  open,
  title,
  subtitle,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={open} transparent animationType="slide">
      <View className="flex-1 justify-end bg-black/40">
        <View className="bg-bg-surface rounded-t-3xl p-6 gap-3">
          <Text className="text-ink-primary text-lg font-sans-semibold">
            {title}
          </Text>
          <Text className="text-ink-secondary text-sm">{subtitle}</Text>
          <View className="bg-bg-elevated rounded-lg p-3 mt-2">
            <Text className="text-ink-muted text-xs">
              Coming in Step 12 — destructive actions are stubbed for now.
            </Text>
          </View>
          <View className="flex-row gap-3 mt-3">
            <Pressable
              onPress={onCancel}
              className="flex-1 bg-bg-elevated py-3.5 rounded-xl items-center active:opacity-80"
            >
              <Text className="text-ink-primary text-sm font-sans-semibold">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              className="flex-1 bg-accent-failure py-3.5 rounded-xl items-center active:opacity-80"
            >
              <Text className="text-white text-sm font-sans-semibold">
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
