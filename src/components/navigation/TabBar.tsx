import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import { BarChart3, MessageCircle, Settings as SettingsIcon } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type IconName = "recoveries" | "analytics" | "settings";

const ROUTE_META: Record<string, { label: string; icon: IconName }> = {
  index: { label: "Recoveries", icon: "recoveries" },
  analytics: { label: "Analytics", icon: "analytics" },
  settings: { label: "Settings", icon: "settings" },
};

const ACCENT = "#22D3EE";
const SURFACE = "#1A1A1E";
const SURFACE_ELEVATED = "#242428";
const INK_MUTED = "#A0A0AB";

export function FloatingTabBar(props: BottomTabBarProps) {
  const { state, navigation } = props;
  const insets = useSafeAreaInsets();

  const items = useMemo(
    () =>
      state.routes
        .map((route, index) => {
          const meta = ROUTE_META[route.name];
          if (!meta) return null;
          return { route, index, ...meta };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    [state.routes],
  );

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: insets.bottom > 0 ? insets.bottom : 16,
        alignItems: "center",
      }}
    >
      <BlurView
        tint="dark"
        intensity={70}
        experimentalBlurMethod="dimezisBlurView"
        style={{
          flexDirection: "row",
          borderRadius: 999,
          paddingHorizontal: 6,
          paddingVertical: 6,
          gap: 4,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.06)",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.5,
          shadowRadius: 28,
          elevation: 16,
        }}
      >
        {items.map((item) => {
          const focused = state.index === item.index;
          return (
            <Tab
              key={item.route.key}
              label={item.label}
              icon={item.icon}
              focused={focused}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: item.route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(item.route.name);
                }
              }}
            />
          );
        })}
      </BlurView>
    </View>
  );
}

function Tab({
  label,
  icon,
  focused,
  onPress,
}: {
  label: string;
  icon: IconName;
  focused: boolean;
  onPress: () => void;
}) {
  const color = focused ? ACCENT : INK_MUTED;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: focused ? SURFACE_ELEVATED : "transparent",
        gap: 8,
      }}
    >
      <Icon name={icon} color={color} />
      {focused ? (
        <Text
          style={{
            color: ACCENT,
            fontSize: 13,
            fontFamily: "Inter_600SemiBold",
          }}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

function Icon({ name, color }: { name: IconName; color: string }) {
  switch (name) {
    case "recoveries":
      return <MessageCircle size={20} color={color} strokeWidth={2} />;
    case "analytics":
      return <BarChart3 size={20} color={color} strokeWidth={2} />;
    case "settings":
      return <SettingsIcon size={20} color={color} strokeWidth={2} />;
  }
}
