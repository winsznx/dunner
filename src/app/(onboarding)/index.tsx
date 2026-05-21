import { Redirect } from "expo-router";
import { View } from "react-native";
import { useOnboardingState } from "@/lib/onboardingState";

export default function OnboardingIndex() {
  const { state, isLoading } = useOnboardingState();

  if (isLoading || !state) {
    return <View className="flex-1 bg-bg-base" />;
  }

  if (!state.connectStripe) {
    return <Redirect href="/(onboarding)/connect-stripe" />;
  }
  if (!state.recordVoice) {
    return <Redirect href="/(onboarding)/record-voice" />;
  }
  if (!state.knowledge) {
    return <Redirect href="/(onboarding)/knowledge" />;
  }
  return <Redirect href="/(app)" />;
}
