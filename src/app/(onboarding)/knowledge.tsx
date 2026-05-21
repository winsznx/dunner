import { useAuth } from "@clerk/clerk-expo";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { X } from "lucide-react-native";
import { useState } from "react";
import Toast from "react-native-toast-message";
import {
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PrimaryButton } from "@/components/onboarding/PrimaryButton";
import { track } from "@/lib/analytics";
import { ApiError, apiFetch } from "@/lib/api";
import { useOnboardingState } from "@/lib/onboardingState";

const MIN_CHARS = 40;
const SUGGESTIONS = [
  {
    label: "Plans & pricing",
    snippet:
      "PLANS & PRICING\n- Starter: $19/mo, 1 seat\n- Pro: $49/mo, up to 5 seats\n- Annual billing saves 20%.\n\n",
  },
  {
    label: "Common objections",
    snippet:
      "COMMON OBJECTIONS\n- \"Too expensive\" — point out the per-seat cost on Pro; offer 10% off for 3 months.\n- \"I forgot to cancel\" — offer 30-day pause; no refunds beyond 14 days.\n\n",
  },
  {
    label: "What you can't refund",
    snippet:
      "NON-REFUNDABLE\n- Charges older than 14 days are final.\n- Annual plans are pro-rated only if cancelled in the first month.\n\n",
  },
];

export default function KnowledgeScreen() {
  const router = useRouter();
  return (
    <KnowledgeInner
      mode="onboarding"
      onComplete={() => router.replace("/(onboarding)")}
    />
  );
}

export type KnowledgeInnerProps = {
  mode: "onboarding" | "edit";
  initialContent?: string;
  onComplete: () => void;
  onCancel?: () => void;
};

export function KnowledgeInner({
  mode,
  initialContent = "",
  onComplete,
  onCancel,
}: KnowledgeInnerProps) {
  const { getToken } = useAuth();
  const { refetch } = useOnboardingState();
  const isEdit = mode === "edit";

  const [content, setContent] = useState(initialContent);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function insertSnippet(snippet: string) {
    setContent((prev) => (prev.length === 0 ? snippet : `${prev}\n${snippet}`));
  }

  async function handleSubmit() {
    const trimmed = content.trim();
    if (trimmed.length < MIN_CHARS) {
      setError(`Need at least ${MIN_CHARS} characters.`);
      return;
    }
    Keyboard.dismiss();
    setError(null);
    setSubmitting(true);
    try {
      const token = await getToken();
      await apiFetch("/onboarding/knowledge", {
        token,
        init: {
          method: "POST",
          body: JSON.stringify({ content: trimmed }),
        },
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      track("knowledge_uploaded", { charCount: trimmed.length });
      await refetch();
      if (isEdit) {
        Toast.show({
          type: "success",
          text1: "Knowledge updated",
          text2: "The agent will use this on the next call.",
          visibilityTime: 2500,
        });
      }
      onComplete();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not save knowledge.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const remaining = Math.max(0, MIN_CHARS - content.trim().length);

  return (
    <SafeAreaView className="flex-1 bg-bg-base" edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 32,
          paddingBottom: 48,
          gap: 20,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-ink-muted text-xs uppercase tracking-widest font-sans-medium">
            {isEdit ? "Update knowledge" : "Step 3 of 3"}
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

        <View className="gap-3">
          <Text className="text-ink-primary text-3xl font-sans-semibold leading-tight">
            {isEdit ? "Edit your knowledge" : "Teach Dunner about your product"}
          </Text>
          <Text className="text-ink-secondary text-base leading-relaxed">
            {isEdit
              ? "Update plans, pricing, objections, or refund rules. We'll replace the agent's current knowledge with what you write below."
              : "Plans, common objections, what you can't refund. The agent will read this before every call."}
          </Text>
        </View>

        <View className="flex-row flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <Pressable
              key={s.label}
              onPress={() => insertSnippet(s.snippet)}
              className="bg-bg-surface px-4 py-2 rounded-full active:opacity-80"
            >
              <Text className="text-ink-primary text-sm font-sans-medium">
                + {s.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View className="gap-2">
          <TextInput
            className="bg-bg-surface text-ink-primary px-4 py-4 rounded-lg text-base leading-relaxed"
            multiline
            scrollEnabled
            textAlignVertical="top"
            placeholder="Write anything that helps the agent — plans, pricing, refund policy, common reasons customers cancel, what you'd say to keep them. Up to a few paragraphs."
            placeholderTextColor="#6C6C74"
            value={content}
            onChangeText={setContent}
            editable={!submitting}
            style={{ minHeight: 180, maxHeight: 260 }}
          />
          <View className="flex-row justify-between items-center">
            <Text className="text-ink-muted text-xs">
              {remaining > 0
                ? `${remaining} more character${remaining === 1 ? "" : "s"} needed.`
                : `${content.trim().length} characters.`}
            </Text>
            <Pressable onPress={() => Keyboard.dismiss()}>
              <Text className="text-accent-neutral text-xs font-sans-medium">
                Done
              </Text>
            </Pressable>
          </View>
        </View>

        {error ? (
          <Text className="text-accent-failure text-sm">{error}</Text>
        ) : null}

        <View className="gap-2 mt-2">
          <PrimaryButton
            label={isEdit ? "Save knowledge" : "Finish setup"}
            onPress={handleSubmit}
            loading={submitting}
            loadingLabel={isEdit ? "Saving" : "Building your agent"}
            disabled={content.trim().length < MIN_CHARS}
          />
          <Text className="text-ink-muted text-xs text-center">
            {isEdit
              ? "This replaces the agent's current knowledge."
              : "We'll build a per-merchant agent and attach this knowledge."}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
