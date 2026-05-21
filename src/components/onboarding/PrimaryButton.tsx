import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  tone?: "recovery" | "neutral";
  // CLAUDE.md §12 — selective haptics. Only the marquee CTAs (Connect Stripe,
  // Record voice) get a tactile press; all other primary buttons stay silent.
  haptic?: "medium" | "light" | "none";
};

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  loadingLabel,
  tone = "recovery",
  haptic = "none",
}: Props) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (disabled || loading) return;
    scale.value = withSpring(0.97, { damping: 22, stiffness: 280, mass: 0.8 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 22, stiffness: 280, mass: 0.8 });
  };
  const handlePress = () => {
    if (disabled || loading) return;
    if (haptic === "medium") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else if (haptic === "light") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  const bg =
    disabled || loading
      ? tone === "recovery"
        ? "bg-accent-recovery/50"
        : "bg-bg-elevated"
      : tone === "recovery"
        ? "bg-accent-recovery"
        : "bg-ink-primary";

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      style={animatedStyle}
      className={`${bg} py-4 rounded-2xl items-center justify-center min-h-[56px]`}
    >
      {loading ? (
        <ThreeDotLoader label={loadingLabel} />
      ) : (
        <Text
          className={
            tone === "recovery"
              ? "text-white font-sans-semibold text-lg"
              : "text-bg-base font-sans-semibold text-lg"
          }
        >
          {label}
        </Text>
      )}
    </AnimatedPressable>
  );
}

function ThreeDotLoader({ label }: { label?: string }) {
  return (
    <View className="flex-row items-center gap-2">
      {label ? (
        <Text className="text-white font-sans-medium text-base mr-1">
          {label}
        </Text>
      ) : null}
      <Dot delay={0} />
      <Dot delay={150} />
      <Dot delay={300} />
    </View>
  );
}

function Dot({ delay }: { delay: number }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(0.3, { duration: 400 }),
        ),
        -1,
        false,
      ),
    );
  }, [delay, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      className="w-1.5 h-1.5 rounded-full bg-white"
      style={animatedStyle}
    />
  );
}
