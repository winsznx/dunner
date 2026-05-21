import { Tabs } from "expo-router";
import { FloatingTabBar } from "@/components/navigation/TabBar";

// Android uses the custom JS pill tab bar. NativeTabs (used on iOS) is
// iOS-only — Metro picks this file via the .android extension.
export default function TabsLayout() {
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
