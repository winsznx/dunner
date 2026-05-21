import { Redirect, useRouter } from "expo-router";
import { useNavigation } from "expo-router";
import { RecordVoiceInner } from "../../(onboarding)/record-voice";

export default function EditVoiceModal() {
  const router = useRouter();
  const nav = useNavigation();

  // Guard against cold-start landing directly on this modal (Metro dev URL
  // persistence). If there's no back stack, route to settings first.
  if (!nav.canGoBack()) {
    return <Redirect href="/(app)/(tabs)/settings" />;
  }

  const close = () => router.replace("/(app)/(tabs)/settings");
  return <RecordVoiceInner mode="edit" onComplete={close} onCancel={close} />;
}
