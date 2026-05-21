import { useAuth } from "@clerk/clerk-expo";
import {
  RecordingPresets,
  createAudioPlayer,
  useAudioRecorder,
  useAudioRecorderState,
  type AudioPlayer,
} from "expo-audio";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Mic, Pause, Play, Square, X } from "lucide-react-native";
import Toast from "react-native-toast-message";
import { useEffect, useRef, useState } from "react";
import { Dimensions, Linking, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { PrimaryButton } from "@/components/onboarding/PrimaryButton";
import { Waveform, type WaveformHandle } from "@/components/audio/Waveform";
import { track } from "@/lib/analytics";
import { ApiError, apiUpload } from "@/lib/api";
import {
  configureAudioForPlayback,
  configureAudioForRecording,
  ensureMicPermission,
  normalizeDb,
} from "@/lib/audio";
import { useOnboardingState } from "@/lib/onboardingState";

type Stage =
  | { kind: "requesting_permission" }
  | { kind: "denied" }
  | { kind: "idle" }
  | { kind: "recording"; startedAt: number }
  | { kind: "recorded"; uri: string; durationSecs: number; amps: number[] }
  | {
      kind: "uploading";
      uri: string;
      durationSecs: number;
      amps: number[];
    }
  | { kind: "error"; message: string; previous: Stage };

const MIN_SECS = 60;
const SWEET_MAX_SECS = 120;
const HARD_MAX_SECS = 180;
const SCREEN_W = Dimensions.get("window").width;
const WAVEFORM_W = SCREEN_W - 32;

const RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

export default function RecordVoiceScreen() {
  const router = useRouter();
  return (
    <RecordVoiceInner
      mode="onboarding"
      onComplete={() => router.replace("/(onboarding)")}
    />
  );
}

export type RecordVoiceInnerProps = {
  mode: "onboarding" | "edit";
  onComplete: () => void;
  onCancel?: () => void;
};

export function RecordVoiceInner({
  mode,
  onComplete,
  onCancel,
}: RecordVoiceInnerProps) {
  const { getToken } = useAuth();
  const { refetch } = useOnboardingState();
  const isEdit = mode === "edit";

  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 100);

  const [stage, setStage] = useState<Stage>({ kind: "requesting_permission" });
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const waveformRef = useRef<WaveformHandle>(null);
  const ampsBufferRef = useRef<number[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const status = await ensureMicPermission();
      if (cancelled) return;
      setStage({ kind: status === "granted" ? "idle" : "denied" });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (stage.kind !== "recording") return;
    const m = recorderState.metering;
    if (typeof m === "number" && Number.isFinite(m)) {
      const amp = normalizeDb(m);
      ampsBufferRef.current.push(amp);
      waveformRef.current?.pushAmplitude(amp);
    }
  }, [recorderState.metering, stage.kind]);

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (playerRef.current) {
        playerRef.current.remove();
        playerRef.current = null;
      }
    };
  }, []);

  async function handleStartRecording() {
    if (stage.kind !== "idle") return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    waveformRef.current?.reset();
    ampsBufferRef.current = [];

    try {
      await configureAudioForRecording();
      await recorder.prepareToRecordAsync(RECORDING_OPTIONS);
      recorder.record();

      const startedAt = Date.now();
      setStage({ kind: "recording", startedAt });
      setElapsedSecs(0);
      tickRef.current = setInterval(() => {
        const secs = Math.floor((Date.now() - startedAt) / 1000);
        setElapsedSecs(secs);
        if (secs >= HARD_MAX_SECS) {
          void finishRecording();
        }
      }, 200);
    } catch (err) {
      setStage({
        kind: "error",
        message:
          err instanceof Error ? err.message : "Could not start recording.",
        previous: { kind: "idle" },
      });
    }
  }

  async function finishRecording() {
    if (stage.kind !== "recording" && stage.kind !== "idle") return;
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await recorder.stop();
      const uri = recorder.uri;
      // Prefer the reactive state's durationMillis; fall back to the wall-clock
      // tick if the recorder hasn't flushed a state update by stop time.
      const durationSecs =
        recorderState.durationMillis > 0
          ? Math.floor(recorderState.durationMillis / 1000)
          : elapsedSecs;
      if (!uri) {
        setStage({
          kind: "error",
          message: "Recording URI missing after stop",
          previous: { kind: "idle" },
        });
        return;
      }
      const amps = ampsBufferRef.current.slice();
      waveformRef.current?.hydrate(amps);
      await configureAudioForPlayback();
      setStage({ kind: "recorded", uri, durationSecs, amps });
    } catch (err) {
      setStage({
        kind: "error",
        message:
          err instanceof Error ? err.message : "Could not save recording.",
        previous: { kind: "idle" },
      });
    }
  }

  async function handleReRecord() {
    if (playerRef.current) {
      playerRef.current.remove();
      playerRef.current = null;
    }
    setIsPlaying(false);
    setElapsedSecs(0);
    waveformRef.current?.reset();
    ampsBufferRef.current = [];
    setStage({ kind: "idle" });
  }

  async function handlePlay() {
    if (stage.kind !== "recorded" && stage.kind !== "uploading") return;
    // Always re-assert playback session before play. After a recording,
    // iOS sometimes keeps the session in PlayAndRecord which routes audio
    // to the earpiece — making playback inaudible. Force playback mode.
    await configureAudioForPlayback();
    if (!playerRef.current) {
      const player = createAudioPlayer({ uri: stage.uri });
      playerRef.current = player;
      player.volume = 1;
      player.addListener("playbackStatusUpdate", (status) => {
        if (status.didJustFinish) {
          setIsPlaying(false);
          player.seekTo(0);
        }
      });
    }
    if (isPlaying) {
      playerRef.current.pause();
      setIsPlaying(false);
    } else {
      playerRef.current.seekTo(0);
      playerRef.current.play();
      setIsPlaying(true);
    }
  }

  async function handleUpload() {
    if (stage.kind !== "recorded") return;
    if (stage.durationSecs < MIN_SECS) return;

    if (playerRef.current) {
      playerRef.current.remove();
      playerRef.current = null;
      setIsPlaying(false);
    }

    const prev = stage;
    setStage({
      kind: "uploading",
      uri: stage.uri,
      durationSecs: stage.durationSecs,
      amps: stage.amps,
    });

    try {
      const token = await getToken();
      await apiUpload<{ voice_id: string; durationSecs: number }>(
        "/onboarding/voice/upload",
        stage.uri,
        { token, fileName: "recording.m4a", mimeType: "audio/m4a" },
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      track("ivc_uploaded", { durationSecs: stage.durationSecs });
      await refetch();
      if (isEdit) {
        Toast.show({
          type: "success",
          text1: "Voice updated",
          text2: "Future calls will use the new voice.",
          visibilityTime: 2500,
        });
      }
      onComplete();
    } catch (err) {
      setStage({
        kind: "error",
        message:
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Upload failed.",
        previous: prev,
      });
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base" edges={["top", "bottom"]}>
      <View className="flex-1 px-6 pt-8 pb-8">
        <View className="flex-row items-center justify-between">
          <Text className="text-ink-muted text-xs uppercase tracking-widest font-sans-medium">
            {isEdit ? "Update voice" : "Step 2 of 3"}
          </Text>
          {isEdit && onCancel ? (
            <Pressable
              onPress={onCancel}
              className="w-9 h-9 rounded-full bg-bg-surface items-center justify-center active:opacity-70"
              hitSlop={8}
            >
              <X size={18} color="#A0A0AB" />
            </Pressable>
          ) : null}
        </View>

        <View className="mt-6 gap-3">
          <Text className="text-ink-primary text-3xl font-sans-semibold leading-tight">
            {isEdit ? "Re-record your voice" : "Record your voice"}
          </Text>
          <Text className="text-ink-secondary text-base leading-relaxed">
            {isEdit
              ? "We'll replace your current cloned voice with the new recording. Future calls will use the new voice."
              : "Dunner clones your voice so recovery calls feel like they came from you. 60–120 seconds is enough. Read anything — a news article, a paragraph about your business, your favorite poem."}
          </Text>
        </View>

        <View className="flex-1 items-center justify-center">
          {stage.kind === "requesting_permission" ? (
            <Text className="text-ink-secondary text-base">
              Requesting mic access…
            </Text>
          ) : stage.kind === "denied" ? (
            <DeniedState />
          ) : stage.kind === "idle" || stage.kind === "recording" ? (
            <ActiveState
              recording={stage.kind === "recording"}
              elapsedSecs={elapsedSecs}
              waveformRef={waveformRef}
              onPress={
                stage.kind === "idle" ? handleStartRecording : finishRecording
              }
            />
          ) : stage.kind === "recorded" || stage.kind === "uploading" ? (
            <ReviewState
              durationSecs={stage.durationSecs}
              waveformRef={waveformRef}
              isPlaying={isPlaying}
              onPlayPress={handlePlay}
              uploading={stage.kind === "uploading"}
            />
          ) : stage.kind === "error" ? (
            <ErrorState message={stage.message} />
          ) : null}
        </View>

        {stage.kind === "recorded" ? (
          <View className="gap-3">
            {stage.durationSecs < MIN_SECS ? (
              <Text className="text-ink-muted text-xs text-center">
                Need {MIN_SECS - stage.durationSecs}s more — minimum {MIN_SECS}
                {" "}seconds.
              </Text>
            ) : null}
            <View className="flex-row gap-3">
              <Pressable
                onPress={handleReRecord}
                className="flex-1 bg-bg-surface py-4 rounded-2xl items-center justify-center active:opacity-80"
              >
                <Text className="text-ink-primary font-sans-semibold text-base">
                  Re-record
                </Text>
              </Pressable>
              <View className="flex-1">
                <PrimaryButton
                  label="Use this voice"
                  onPress={handleUpload}
                  disabled={stage.durationSecs < MIN_SECS}
                />
              </View>
            </View>
          </View>
        ) : null}

        {stage.kind === "uploading" ? (
          <View className="items-center gap-2">
            <Text className="text-ink-muted text-sm">
              This takes 5–15 seconds.
            </Text>
          </View>
        ) : null}

        {stage.kind === "error" ? (
          <View className="gap-3">
            <Text className="text-accent-failure text-sm text-center">
              {stage.message}
            </Text>
            <PrimaryButton
              label="Try again"
              onPress={() => setStage(stage.previous)}
              tone="neutral"
            />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function ActiveState({
  recording,
  elapsedSecs,
  waveformRef,
  onPress,
}: {
  recording: boolean;
  elapsedSecs: number;
  waveformRef: React.RefObject<WaveformHandle | null>;
  onPress: () => void;
}) {
  const ringScale = useSharedValue(1);
  const pressScale = useSharedValue(1);

  useEffect(() => {
    if (recording) {
      ringScale.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 900 }),
          withTiming(1, { duration: 900 }),
        ),
        -1,
        false,
      );
    } else {
      ringScale.value = withTiming(1, { duration: 200 });
    }
  }, [recording, ringScale]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
  }));
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const timerColor = !recording
    ? "text-ink-muted"
    : elapsedSecs < MIN_SECS
      ? "text-ink-muted"
      : elapsedSecs <= SWEET_MAX_SECS
        ? "text-ink-primary"
        : "text-ink-secondary";

  return (
    <View className="items-center gap-6">
      <Pressable
        onPressIn={() => {
          pressScale.value = withSpring(0.96, {
            damping: 22,
            stiffness: 280,
          });
        }}
        onPressOut={() => {
          pressScale.value = withSpring(1, { damping: 22, stiffness: 280 });
        }}
        onPress={onPress}
      >
        <Animated.View style={pressStyle}>
          <Animated.View
            style={[
              {
                width: 140,
                height: 140,
                borderRadius: 70,
                borderWidth: recording ? 2 : 0,
                borderColor: "#10B981",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#1A1A1E",
              },
              ringStyle,
            ]}
          >
            {recording ? (
              <Square size={28} color="#EF4444" fill="#EF4444" />
            ) : (
              <Mic size={36} color="#EEEEEF" />
            )}
          </Animated.View>
        </Animated.View>
      </Pressable>

      <Text
        className={`text-3xl font-mono-semibold ${timerColor}`}
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {formatTime(elapsedSecs)}
      </Text>

      <View style={{ height: 80 }}>
        <Waveform
          ref={waveformRef}
          width={WAVEFORM_W}
          height={80}
          mode="amplitudes"
          active={recording}
          color="#10B981"
        />
      </View>
    </View>
  );
}

function ReviewState({
  durationSecs,
  waveformRef,
  isPlaying,
  onPlayPress,
  uploading,
}: {
  durationSecs: number;
  waveformRef: React.RefObject<WaveformHandle | null>;
  isPlaying: boolean;
  onPlayPress: () => void;
  uploading: boolean;
}) {
  if (uploading) {
    return <UploadingIndicator />;
  }
  return (
    <View className="items-center gap-6 w-full">
      <Pressable
        onPress={onPlayPress}
        className="bg-bg-surface w-20 h-20 rounded-full items-center justify-center active:opacity-80"
      >
        {isPlaying ? (
          <Pause size={32} color="#EEEEEF" fill="#EEEEEF" />
        ) : (
          <Play size={32} color="#EEEEEF" fill="#EEEEEF" />
        )}
      </Pressable>
      <Text
        className="text-ink-secondary text-base font-mono"
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {formatTime(durationSecs)}
      </Text>
      <View style={{ height: 80 }}>
        <Waveform
          ref={waveformRef}
          width={WAVEFORM_W}
          height={80}
          mode="amplitudes"
          active={false}
          color="#A0A0AB"
        />
      </View>
    </View>
  );
}

function UploadingIndicator() {
  return (
    <View className="items-center gap-4">
      <Text className="text-ink-primary text-lg font-sans-semibold">
        Cloning your voice…
      </Text>
      <View className="flex-row gap-2">
        <Dot delay={0} />
        <Dot delay={150} />
        <Dot delay={300} />
      </View>
    </View>
  );
}

function Dot({ delay }: { delay: number }) {
  const opacity = useSharedValue(0.3);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 400 }),
        withTiming(0.3, { duration: 400 }),
      ),
      -1,
      false,
    );
    void delay;
  }, [opacity, delay]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      className="w-2 h-2 rounded-full bg-accent-recovery"
      style={style}
    />
  );
}

function DeniedState() {
  return (
    <View className="items-center gap-4 px-4">
      <Text className="text-ink-primary text-xl font-sans-semibold">
        Mic access required
      </Text>
      <Text className="text-ink-secondary text-sm text-center leading-relaxed">
        Dunner can't clone your voice without microphone access. Enable it in
        Settings and come back.
      </Text>
      <PrimaryButton
        label="Open Settings"
        onPress={() => {
          void Linking.openSettings();
        }}
        tone="neutral"
      />
    </View>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <Text className="text-accent-failure text-sm text-center px-4">
      {message}
    </Text>
  );
}

function formatTime(totalSecs: number): string {
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
