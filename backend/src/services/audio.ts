import "../env";

import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

if (!ffmpegPath) {
  throw new Error("ffmpeg-static binary not found at install time");
}

export async function convertM4aToMp3(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath!, [
      "-i",
      inputPath,
      "-b:a",
      "128k",
      "-y",
      outputPath,
    ]);
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

export async function getDurationSecs(path: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const proc = spawn(ffmpegPath!, ["-i", path]);
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    // ffmpeg with no output spec exits 1; that's expected.
    proc.on("close", () => {
      const match = stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
      if (!match) {
        reject(new Error(`Could not parse duration from ffmpeg output`));
        return;
      }
      const h = Number(match[1]);
      const m = Number(match[2]);
      const s = Number(match[3]);
      resolve(h * 3600 + m * 60 + s);
    });
  });
}
