import "server-only";

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, statfs, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

/**
 * Makes a tutorial light enough to stream.
 *
 * Admins upload whatever their screen recorder produced, which is often a
 * large, lightly compressed file. Clients then stream that on a phone. The
 * video is re-encoded once, after upload, at a size suited to a tutorial:
 * capped at 720p, H.264 so every browser can play it, and the index moved to
 * the front so playback starts before the whole file arrives.
 *
 * The result is only kept when it is meaningfully smaller. A file that is
 * already well compressed is left exactly as it was, rather than re-encoded
 * for nothing.
 */
export const COMPRESSION_MIN_SAVING = 0.2;

export type CompressionResult = {
  changed: boolean;
  originalBytes: number;
  compressedBytes: number;
  /** How much smaller, 0 to 1. */
  saving: number;
  reason?: string;
};

/**
 * Runs ffmpeg over files in the working directory.
 *
 * MP4 cannot be read from a pipe: the index sits at the end of the file and
 * the demuxer has to seek, so a piped attempt produces a partial file. The
 * source therefore has to land on disk, which is why the free space is checked
 * before a video is re-encoded at all.
 */
function runFfmpeg(args: string[]) {
  const executable = ffmpegPath;
  if (!executable) throw new Error("The video compressor is unavailable.");
  return new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => { stderr += String(chunk).slice(-8_000); });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Compression failed (${code}): ${stderr.slice(-400)}`))));
  });
}

/** Working space available for the source and the encoded copy. */
async function freeWorkingBytes() {
  try {
    const stats = await statfs(os.tmpdir());
    return stats.bavail * stats.bsize;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * Compresses one video held in memory. Returns the smaller of the two, so a
 * caller can always use what comes back.
 */
export async function compressTutorialVideo(input: Buffer, fileName = "tutorial.mp4"): Promise<CompressionResult & { output: Buffer }> {
  const originalBytes = input.byteLength;
  const keepOriginal = (reason: string) => ({
    changed: false as const,
    originalBytes,
    compressedBytes: originalBytes,
    saving: 0,
    reason,
    output: input,
  });

  // The source plus its encoded copy have to fit, with a little room to spare.
  const free = await freeWorkingBytes();
  if (free < originalBytes * 2.2) {
    return keepOriginal(
      `Not enough working space to compress this video (${Math.round(free / (1024 * 1024))}MB free, about ${Math.round((originalBytes * 2.2) / (1024 * 1024))}MB needed). It was stored as uploaded.`,
    );
  }

  const workspace = await mkdtemp(path.join(os.tmpdir(), "cds-tutorial-"));
  const source = path.join(workspace, `source${path.extname(fileName) || ".mp4"}`);
  const target = path.join(workspace, "compressed.mp4");
  try {
    await writeFile(source, input);
    await runFfmpeg([
      "-y", "-i", source,
      // Tutorials are screen recordings and talking heads: 720p is plenty, and
      // the filter only ever scales down, never up.
      "-vf", "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
      "-profile:v", "high", "-pix_fmt", "yuv420p",
      // Speech, not music: 96k stereo is transparent enough and far lighter.
      "-c:a", "aac", "-b:a", "96k", "-ac", "2",
      // Start playing before the whole file has arrived.
      "-movflags", "+faststart",
      target,
    ]);
    const compressedBytes = (await stat(target)).size;
    const saving = originalBytes > 0 ? 1 - compressedBytes / originalBytes : 0;
    if (compressedBytes <= 0 || saving < COMPRESSION_MIN_SAVING) {
      return keepOriginal("The upload was already well compressed, so it was kept as it is.");
    }
    return { changed: true, originalBytes, compressedBytes, saving, output: await readFile(target) };
  } catch (error) {
    // A tutorial that cannot be compressed still plays: keep the original.
    console.error("[tutorial-compression] falling back to the original video", error);
    return keepOriginal(error instanceof Error ? error.message.slice(0, 200) : "Compression was not possible.");
  } finally {
    await rm(workspace, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function describeSaving(result: CompressionResult) {
  if (!result.changed) return result.reason || "Kept at its original size.";
  const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `Compressed ${mb(result.originalBytes)} to ${mb(result.compressedBytes)}, ${Math.round(result.saving * 100)}% smaller.`;
}

/**
 * Replaces the stored original with a compressed copy, once, in the background.
 *
 * Compression runs after the upload has been answered, so an admin is never
 * left watching a spinner while a video is re-encoded. If anything fails the
 * original stays exactly where it is and the tutorial still plays.
 */
export async function compressStoredTutorialVideo(tutorialId: string) {
  const { glashMaybeOne, glashQuery } = await import("@/lib/glashdb/postgres");
  const { getGlashDbAdmin } = await import("@/lib/glashdb");
  const { TUTORIAL_BUCKET } = await import("@/lib/tutorials");

  const media = await glashMaybeOne<{ id: string; video_path: string; video_name: string; video_size_bytes: string | number }>(
    `select id::text, video_path, video_name, video_size_bytes
       from public.dashboard_tutorial_media
      where tutorial_id = $1::uuid and is_original = true
      limit 1`,
    [tutorialId],
  );
  if (!media?.video_path) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getGlashDbAdmin() as any;
  const storage = db.storage.from(TUTORIAL_BUCKET);
  const downloaded = await storage.download(media.video_path);
  if (downloaded.error || !downloaded.data) return null;

  const original = Buffer.from(await downloaded.data.arrayBuffer());
  const result = await compressTutorialVideo(original, media.video_name || "tutorial.mp4");
  if (!result.changed) return result;

  // Same folder as the original, without needing the node path module.
  const folder = media.video_path.slice(0, media.video_path.lastIndexOf("/"));
  const replacement = `${folder}/video-compressed-${Date.now()}.mp4`;
  const uploaded = await storage.upload(replacement, result.output, { contentType: "video/mp4", upsert: false });
  if (uploaded.error) return result;

  await glashQuery(
    `update public.dashboard_tutorial_media
        set video_path = $2, video_mime = 'video/mp4', video_size_bytes = $3
      where id = $1::uuid`,
    [media.id, replacement, result.output.byteLength],
  );
  // The original is only removed once the replacement is recorded, so a failure
  // between the two leaves the tutorial playable from the file it already had.
  await storage.remove([media.video_path]).catch(() => undefined);
  return result;
}
