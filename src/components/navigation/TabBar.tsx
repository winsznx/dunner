import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import {
  BarChart3,
  MessageCircle,
  Settings as SettingsIcon,
} from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Android approximation of iOS 26's liquid-glass NativeTabs.
 *
 * Real liquid glass is a private iOS render layer that refracts the content
 * beneath it and deforms around touch — we can't ship that on Android. What
 * we CAN do is stack the visual hallmarks so the eye reads "glass":
 *
 *   - Heavy backdrop blur (BlurView with the Android dimezis backend).
 *   - Subtle top-edge highlight strip (1.5 px translucent white at the rim).
 *   - Inner specular sheen — a faint white overlay biased to the top half.
 *   - Focused tab gets a brighter pill + cyan accent (mirrors iOS active state).
 *   - Spring-animated focused background so it feels like the iOS tap.
 *
 * Implemented in pure JS so it doesn't require any newly-linked native
 * modules — works on the existing dev-client APK without a rebuild.
 */
type IconName = "recoveries" | "analytics" | "settings";

const ROUTE_META: Record<string, { label: string; icon: IconName }> = {
  index: { label: "Recoveries", icon: "recoveries" },
  analytics: { label: "Analytics", icon: "analytics" },
  settings: { label: "Settings", icon: "settings" },
};

const ACCENT = "#22D3EE";
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
        bottom: insets.bottom > 0 ? insets.bottom : 18,
        alignItems: "center",
      }}
    >
      <View style={styles.pillShadow}>
        <BlurView
          tint="dark"
          intensity={90}
          experimentalBlurMethod="dimezisBlurView"
          style={styles.pill}
        >
          {/* Glass sheen — translucent white biased to the top half of the
              pill. Two stacked Views with decreasing alpha read as a soft
              specular gradient without needing expo-linear-gradient. */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "55%",
              backgroundColor: "rgba(255,255,255,0.05)",
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "28%",
              backgroundColor: "rgba(255,255,255,0.03)",
            }}
          />

          {/* Rim highlight — 1.5px translucent stripe at the top edge. */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 1.5,
              backgroundColor: "rgba(255,255,255,0.18)",
            }}
          />

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
  const scale = useSharedValue(focused ? 1 : 0.94);
  const opacity = useSharedValue(focused ? 1 : 0);

  // Spring the focused background in/out. Drives the pill grow + fade.
  if (focused) {
    scale.value = withSpring(1, { damping: 22, stiffness: 240, mass: 0.7 });
    opacity.value = withSpring(1, { damping: 22, stiffness: 240, mass: 0.7 });
  } else {
    scale.value = withSpring(0.94, { damping: 22, stiffness: 240, mass: 0.7 });
    opacity.value = withSpring(0, { damping: 22, stiffness: 240, mass: 0.7 });
  }

  const bgStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

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
        gap: 8,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Animated focused pill background */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.10)",
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: "rgba(255,255,255,0.14)",
          },
          bgStyle,
        ]}
      />
      <Icon name={icon} color={color} />
      {focused ? (
        <Text
          style={{
            color: ACCENT,
            fontSize: 13,
            fontFamily: "Inter_600SemiBold",
            letterSpacing: -0.1,
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
      return <MessageCircle size={20} color={color} strokeWidth={2.2} />;
    case "analytics":
      return <BarChart3 size={20} color={color} strokeWidth={2.2} />;
    case "settings":
      return <SettingsIcon size={20} color={color} strokeWidth={2.2} />;
  }
}

const styles = StyleSheet.create({
  pillShadow: {
    // Drop shadow lives on a wrapper so BlurView's overflow:hidden
    // doesn't clip it.
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.55,
    shadowRadius: 32,
    elevation: 24,
    borderRadius: 999,
  },
  pill: {
    flexDirection: "row",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 4,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(20,20,24,0.55)",
  },
});
