import { mediaKindFromMime, type MediaKind } from "@/lib/content-hub/shared";

export const CONTENT_HUB_VIDEO_MAX_BYTES = 150 * 1024 * 1024;
export const CONTENT_HUB_VIDEO_MAX_LABEL = "150MB";

export function formatUploadBytes(value: number) {
  if (value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function validateContentHubUpload(
  size: number,
  mime: string,
  fileName = "This file",
): { ok: true; kind: MediaKind } | { ok: false; error: string } {
  const kind = mediaKindFromMime(mime || "");
  if (kind === "video" && size > CONTENT_HUB_VIDEO_MAX_BYTES) {
    return {
      ok: false,
      error: `${fileName} is ${formatUploadBytes(size)}. Videos must be ${CONTENT_HUB_VIDEO_MAX_LABEL} or smaller.`,
    };
  }
  return { ok: true, kind };
}
