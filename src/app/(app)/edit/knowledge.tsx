import { useAuth } from "@clerk/clerk-expo";
import { Redirect, useNavigation, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiFetch } from "@/lib/api";
import { KnowledgeInner } from "../../(onboarding)/knowledge";

export default function EditKnowledgeModal() {
  const router = useRouter();
  const nav = useNavigation();
  const { getToken } = useAuth();
  const [initialContent, setInitialContent] = useState<string | null>(null);

  const close = () => router.replace("/(app)/(tabs)/settings");

  if (!nav.canGoBack()) {
    return <Redirect href="/(app)/(tabs)/settings" />;
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        const res = await apiFetch<{ content: string }>("/agent/knowledge", {
          token,
          silent: true,
        });
        if (!cancelled) setInitialContent(res.content);
      } catch {
        if (!cancelled) setInitialContent("");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (initialContent === null) {
    return (
      <SafeAreaView className="flex-1 bg-bg-base" edges={["top", "bottom"]}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#A0A0AB" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <KnowledgeInner
      mode="edit"
      initialContent={initialContent}
      onComplete={close}
      onCancel={close}
    />
  );
}
