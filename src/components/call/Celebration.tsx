import { useEffect, useState } from "react";
import { Dimensions, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { formatAmount } from "@/lib/format";

type Props = {
  amount: number;
  fee: number;
  currency: string;
};

const { width: W, height: H } = Dimensions.get("window");
const PARTICLE_COUNT = 24;
const COLORS = ["#10B981", "#22D3EE", "#FBBF24", "#EF4444", "#A78BFA", "#F472B6"];

export function Celebration({ amount, fee, currency }: Props) {
  const [displayValue, setDisplayValue] = useState(0);

  // Number ticker driven on the JS thread because formatAmount isn't worklet-safe.
  useEffect(() => {
    const start = Date.now();
    const duration = 1200;
    const handle = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayValue(Math.floor(amount * eased));
      if (t >= 1) clearInterval(handle);
    }, 16);
    return () => clearInterval(handle);
  }, [amount]);

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(180)}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        backgroundColor: "rgba(15,15,17,0.92)",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      pointerEvents="none"
    >
      {Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
        <Particle key={i} index={i} />
      ))}
      <Text className="text-ink-muted text-xs uppercase tracking-widest font-sans-medium mb-3">
        Recovered
      </Text>
      <Text
        className="text-accent-recovery font-mono-semibold"
        style={{ fontSize: 56, fontVariant: ["tabular-nums"] }}
      >
        {formatAmount(displayValue, currency)}
      </Text>
      <Text className="text-ink-secondary text-sm font-sans-medium mt-4">
        Your fee: {formatAmount(fee, currency)}
      </Text>
    </Animated.View>
  );
}

function Particle({ index }: { index: number }) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const opacity = useSharedValue(1);
  const rotate = useSharedValue(0);
  const color = COLORS[index % COLORS.length];

  useEffect(() => {
    const angle = (index / PARTICLE_COUNT) * Math.PI * 2;
    const distance = 180 + Math.random() * 160;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance - 60;
    const delay = Math.random() * 80;
    x.value = withDelay(delay, withTiming(dx, { duration: 900, easing: Easing.out(Easing.cubic) }));
    y.value = withDelay(
      delay,
      withSequence(
        withTiming(dy, { duration: 700, easing: Easing.out(Easing.cubic) }),
        withTiming(dy + 400, { duration: 1400, easing: Easing.in(Easing.cubic) }),
      ),
    );
    rotate.value = withTiming(Math.random() * 720 - 360, { duration: 1800 });
    opacity.value = withDelay(1400, withTiming(0, { duration: 600 }));
  }, [index, x, y, rotate, opacity]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: 10,
          height: 14,
          borderRadius: 2,
          backgroundColor: color,
          top: H / 2,
          left: W / 2 - 5,
        },
        style,
      ]}
    />
  );
}
