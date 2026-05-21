import "../../global.css";

import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Appearance, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Toast from "react-native-toast-message";
import * as Sentry from "@sentry/react-native";
import { PostHogProvider } from "posthog-react-native";
import { tokenCache } from "@/lib/tokenCache";
import {
  OnboardingStateProvider,
  isOnboardingComplete,
  useOnboardingState,
} from "@/lib/onboardingState";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
if (!publishableKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY — set it in .env.local",
  );
}

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN_MOBILE;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: __DEV__ ? "development" : "production",
    tracesSampleRate: 0.1,
    // Session replay: opt-in only on demand; capture rich context around errors.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  });
}

const posthogKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;

// Force dark mode app-wide so native UI (tab bar, alerts, action sheets,
// keyboard) follows our design tokens regardless of OS appearance.
Appearance.setColorScheme("dark");

// Keep the splash up until fonts have loaded so we don't FOUT on cold start.
void SplashScreen.preventAutoHideAsync();

function ProtectedStack() {
  const { isLoaded, isSignedIn } = useAuth();
  const onboarding = useOnboardingState();

  const stillLoading =
    !isLoaded || (isSignedIn && onboarding.isLoading && !onboarding.state);

  if (stillLoading) {
    return <View className="flex-1 bg-bg-base" />;
  }

  const onboardingComplete = isOnboardingComplete(onboarding.state);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#0F0F11" },
      }}
    >
      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={!!isSignedIn && !onboardingComplete}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
      <Stack.Protected guard={!!isSignedIn && onboardingComplete}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular: require("../../assets/fonts/Inter-Regular.ttf"),
    Inter_500Medium: require("../../assets/fonts/Inter-Medium.ttf"),
    Inter_600SemiBold: require("../../assets/fonts/Inter-SemiBold.ttf"),
    Inter_700Bold: require("../../assets/fonts/Inter-Bold.ttf"),
    JetBrainsMono_400Regular: require("../../assets/fonts/JetBrainsMono-Regular.ttf"),
    JetBrainsMono_600SemiBold: require("../../assets/fonts/JetBrainsMono-SemiBold.ttf"),
    JetBrainsMono_700Bold: require("../../assets/fonts/JetBrainsMono-Bold.ttf"),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  const inner = (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <OnboardingStateProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <StatusBar style="light" />
          <ProtectedStack />
          <Toast position="bottom" bottomOffset={32} />
        </GestureHandlerRootView>
      </OnboardingStateProvider>
    </ClerkProvider>
  );

  if (posthogKey) {
    return (
      <PostHogProvider
        apiKey={posthogKey}
        options={{ host: "https://us.i.posthog.com" }}
      >
        {inner}
      </PostHogProvider>
    );
  }
  return inner;
}

export default sentryDsn ? Sentry.wrap(RootLayout) : RootLayout;
