import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";

// Builds a short MP4 from a still image so image-only posts can be published to
// video-first platforms (YouTube; TikTok video mode). A slow zoom (Ken Burns) over
// the image, with a silent audio track for maximum compatibility.

export type VideoOptions = {
  durationSeconds?: number;
};

export function isVideoSupported(): boolean {
  return Boolean(ffmpegStatic);
}

export async function imageToVideo(imageBytes: Buffer, opts: VideoOptions = {}): Promise<Buffer> {
  const ffmpegPath = ffmpegStatic as unknown as string | null;
  if (!ffmpegPath) {
    throw new Error("ffmpeg is not available (ffmpeg-static failed to install).");
  }
  const duration = opts.durationSeconds ?? 6;
  const dir = await mkdtemp(path.join(os.tmpdir(), "mk-social-"));
  const inputPath = path.join(dir, "input.png");
  const outputPath = path.join(dir, "output.mp4");

  try {
    await writeFile(inputPath, imageBytes);

    const totalFrames = duration * 30;
    const args = [
      "-y",
      "-loop", "1",
      "-i", inputPath,
      "-f", "lavfi",
      "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-t", String(duration),
      "-vf",
      // scale to fit a 1080x1920 portrait frame, pad, then slow zoom
      `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,` +
        `zoompan=z='min(zoom+0.0008,1.15)':d=${totalFrames}:s=1080x1920:fps=30`,
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-shortest",
      "-movflags", "+faststart",
      outputPath,
    ];

    await runFfmpeg(ffmpegPath, args);
    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args);
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-400)}`));
    });
  });
}
