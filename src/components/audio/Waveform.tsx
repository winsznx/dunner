import { Canvas, Path, Skia } from "@shopify/react-native-skia";
import {
  forwardRef,
  useImperativeHandle,
  useMemo,
} from "react";
import {
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";

const BARS = 60;
const BAR_W = 3;
const BAR_GAP = 2;

export type WaveformHandle = {
  pushAmplitude: (amp: number) => void;
  reset: () => void;
  /** Snapshot the live amplitude buffer (read-only, for review playback). */
  snapshot: () => number[];
  /** Replace the buffer with a saved snapshot (review playback). */
  hydrate: (amps: number[]) => void;
};

type Props = {
  width: number;
  height: number;
  active: boolean;
  mode?: "procedural" | "amplitudes";
  color?: string;
};

export const Waveform = forwardRef<WaveformHandle, Props>(function Waveform(
  { width, height, active, mode = "procedural", color = "#22D3EE" },
  ref,
) {
  const t = useSharedValue(0);
  const amps = useSharedValue<number[]>(new Array(BARS).fill(0));
  // Cursor must be a sharedValue (not useRef), because useDerivedValue is a
  // worklet that reads it — Reanimated 4 warns when refs captured in worklets
  // are mutated from JS.
  const cursor = useSharedValue(0);

  const seed = useMemo(
    () => Array.from({ length: BARS }, () => Math.random()),
    [],
  );

  useFrameCallback(({ timeSincePreviousFrame }) => {
    if (mode === "procedural" && active) {
      t.value += (timeSincePreviousFrame ?? 16) / 1000;
    }
  });

  useImperativeHandle(
    ref,
    () => ({
      pushAmplitude(amp: number) {
        const clamped = Math.max(0, Math.min(1, amp));
        const next = [...amps.value];
        next[cursor.value] = clamped;
        cursor.value = (cursor.value + 1) % BARS;
        amps.value = next;
      },
      reset() {
        cursor.value = 0;
        amps.value = new Array(BARS).fill(0);
      },
      snapshot() {
        // Re-roll the ring so the snapshot is in playback order (oldest first).
        const out: number[] = new Array(BARS);
        for (let i = 0; i < BARS; i++) {
          out[i] = amps.value[(cursor.value + i) % BARS] ?? 0;
        }
        return out;
      },
      hydrate(saved: number[]) {
        const padded = saved.slice(-BARS);
        while (padded.length < BARS) padded.unshift(0);
        amps.value = padded;
        cursor.value = 0;
      },
    }),
    [amps],
  );

  const path = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const time = t.value;
    for (let i = 0; i < BARS; i++) {
      let base: number;
      if (mode === "procedural") {
        base = active
          ? 0.25 +
            0.55 * Math.abs(Math.sin(time * 2 + (seed[i] ?? 0) * 6 + i * 0.18))
          : 0.08;
      } else {
        // Render the ring in time order so the most-recent value sits at the right edge.
        const index = (cursor.value + i) % BARS;
        const raw = amps.value[index] ?? 0;
        base = active ? Math.max(0.06, raw) : Math.max(0.04, raw * 0.5);
      }
      const h = Math.max(4, base * height * 0.85);
      const x = (BAR_W + BAR_GAP) * i;
      const y = (height - h) / 2;
      p.addRRect(
        Skia.RRectXY(Skia.XYWHRect(x, y, BAR_W, h), BAR_W / 2, BAR_W / 2),
      );
    }
    return p;
  });

  return (
    <Canvas style={{ width, height }}>
      <Path path={path} color={color} style="fill" />
    </Canvas>
  );
});
