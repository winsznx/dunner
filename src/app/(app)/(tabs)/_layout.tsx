import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { FloatingTabBar } from "@/components/navigation/TabBar";

// iOS uses Apple's UITabBar (liquid glass on iOS 26). Android uses a JS
// floating pill — NativeTabs from expo-router/unstable-native-tabs is
// iOS-only and would no-op or crash on Android, so we explicitly branch.
//
// Expo Router needs a single `_layout.tsx` file as the canonical route
// definition (platform-extension variants like `_layout.android.tsx` need
// a sibling without an extension as fallback or routing breaks at build
// time). Keeping both branches in one file satisfies that contract.
export default function TabsLayout() {
  if (Platform.OS === "android") {
    return (
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: "#0F0F11" },
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Recoveries" }} />
        <Tabs.Screen name="analytics" options={{ title: "Analytics" }} />
        <Tabs.Screen name="settings" options={{ title: "Settings" }} />
      </Tabs>
    );
  }

  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Recoveries</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="phone.bubble.fill" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="analytics">
        <NativeTabs.Trigger.Label>Analytics</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.line.uptrend.xyaxis" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape.fill" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
