import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";

export async function ensureMicPermission(): Promise<"granted" | "denied"> {
  const existing = await getRecordingPermissionsAsync();
  if (existing.status === "granted") return "granted";
  if (existing.status === "denied" && !existing.canAskAgain) return "denied";
  const res = await requestRecordingPermissionsAsync();
  return res.status === "granted" ? "granted" : "denied";
}

export async function configureAudioForRecording(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    shouldPlayInBackground: false,
  });
}

export async function configureAudioForPlayback(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
  });
}

// expo-audio metering is in dB (-160 silent .. 0 peak). Map to 0..1 with a
// floor at -50 dB (anything quieter reads as silence) and a smoothstep curve.
export function normalizeDb(db: number): number {
  const FLOOR = -50;
  if (!Number.isFinite(db)) return 0;
  if (db <= FLOOR) return 0;
  if (db >= 0) return 1;
  const linear = (db - FLOOR) / (0 - FLOOR);
  return linear * linear * (3 - 2 * linear);
}
