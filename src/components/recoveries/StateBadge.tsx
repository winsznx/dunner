import { useEffect } from "react";
import { Text } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { badgeFor } from "@/lib/format";

export function StateBadge({ state }: { state: string }) {
  const b = badgeFor(state);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (b.pulse) {
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.55, { duration: 600 }),
          withTiming(1, { duration: 600 }),
        ),
        -1,
        false,
      );
    } else {
      opacity.value = withTiming(1);
    }
  }, [b.pulse, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={animatedStyle}
      className={`${b.bgClass} px-3 py-1 rounded-full`}
    >
      <Text
        className={`${b.fgClass} text-xs uppercase tracking-widest font-sans-semibold`}
      >
        {b.label}
      </Text>
    </Animated.View>
  );
}
