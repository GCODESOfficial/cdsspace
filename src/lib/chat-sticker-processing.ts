import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegStatic from "ffmpeg-static";
import { assertSecureBuffer } from "@/lib/upload-security";

const execFileAsync = promisify(execFile);

export const MAX_STICKER_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_STICKER_VIDEO_BYTES = 15 * 1024 * 1024;
export const MAX_STICKER_VIDEO_SECONDS = 6;
export const MAX_GENERATED_GIF_BYTES = 8 * 1024 * 1024;

const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
  "video/x-matroska",
]);

export function isStickerVideo(file: File) {
  return file.type.startsWith("video/");
}

function secondsFromFfmpegProbe(stderr: string) {
  const match = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/i);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

export async function videoToGifSticker(file: File) {
  if (!VIDEO_TYPES.has(file.type)) {
    throw new Error("Use an MP4, WebM, MOV, M4V, or MKV video.");
  }
  if (file.size > MAX_STICKER_VIDEO_BYTES) {
    throw new Error("Sticker videos must be 15 MB or smaller.");
  }

  const input = Buffer.from(await file.arrayBuffer());
  await assertSecureBuffer(input, { fileName: file.name });
  const workDir = await mkdtemp(path.join(tmpdir(), "cds-sticker-"));
  const inputPath = path.join(workDir, "source-video");
  const outputPath = path.join(workDir, "sticker.gif");
  const ffmpegPath = process.env.FFMPEG_PATH || ffmpegStatic || "ffmpeg";

  try {
    await writeFile(inputPath, input);
    let probeOutput = "";
    try {
      await execFileAsync(ffmpegPath, ["-hide_banner", "-i", inputPath], {
        maxBuffer: 1024 * 1024,
        timeout: 15_000,
      });
    } catch (error) {
      probeOutput = String((error as { stderr?: string }).stderr || "");
    }
    const duration = secondsFromFfmpegProbe(probeOutput);
    if (!duration) throw new Error("The video duration could not be read.");
    if (duration > MAX_STICKER_VIDEO_SECONDS + 0.05) {
      throw new Error(`Sticker videos must be ${MAX_STICKER_VIDEO_SECONDS} seconds or shorter.`);
    }

    await execFileAsync(
      ffmpegPath,
      [
        "-hide_banner",
        "-loglevel", "error",
        "-i", inputPath,
        "-an",
        "-filter_complex",
        "fps=10,scale=384:384:force_original_aspect_ratio=decrease:flags=lanczos,split[s0][s1];[s0]palettegen=reserve_transparent=1:stats_mode=diff[p];[s1][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle",
        "-loop", "0",
        "-y",
        outputPath,
      ],
      { maxBuffer: 2 * 1024 * 1024, timeout: 45_000 },
    );

    const gif = await readFile(outputPath);
    if (!gif.length || gif.length > MAX_GENERATED_GIF_BYTES) {
      throw new Error("The generated sticker is too large. Try a shorter or simpler video.");
    }
    return { buffer: gif, contentType: "image/gif", ext: "gif", durationSeconds: duration };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
