export const CLIENT_DELIVERABLES_BUCKET = "client-deliverables";
export const MAX_DELIVERY_FILES = 200;
export const MAX_DELIVERY_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_DELIVERY_BATCH_BYTES = 100 * 1024 * 1024;
export const MAX_DELIVERY_COVER_BYTES = 10 * 1024 * 1024;
export const DELIVERY_COVER_ACCEPT = "image/jpeg,image/png,image/webp";
/**
 * Raw file chunks stay below the production reverse proxy's 50 MiB request
 * ceiling. A file may span multiple chunks; each completed file is validated
 * and attached to the evolving server-side delivery draft independently.
 */
export const MAX_DELIVERY_UPLOAD_CHUNK_BYTES = 48 * 1024 * 1024;
export const DELIVERY_FILE_ACCEPT = [
  "image/*",
  ".pdf", ".doc", ".docx", ".docm", ".ppt", ".pptx", ".pptm", ".xls", ".xlsx", ".xlsm",
  ".odt", ".ods", ".odp", ".pages", ".numbers", ".key",
  ".zip", ".7z", ".rar", ".gz", ".tar",
  ".ai", ".psd", ".psb", ".eps", ".ps", ".indd", ".idml", ".svg",
  ".fig", ".sketch", ".xd", ".cdr", ".afdesign", ".afphoto", ".afpub",
  ".tif", ".tiff", ".bmp", ".heic", ".heif",
  ".ttf", ".otf", ".woff", ".woff2",
  ".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi",
  ".mp3", ".wav", ".m4a", ".aac",
  ".txt", ".md", ".csv", ".json",
].join(",");

const DELIVERY_SYSTEM_FILES = new Set([
  ".ds_store", "thumbs.db", "ehthumbs.db", "desktop.ini", ".localized", "icon\r",
]);
const DELIVERY_SYSTEM_FOLDERS = new Set([
  "__macosx", ".git", ".svn", ".spotlight-v100", ".trashes", ".fseventsd", ".temporaryitems", "$recycle.bin",
]);

/**
 * Ignore operating-system and source-control metadata included by folder pickers.
 *
 * macOS writes an AppleDouble companion (`._Name`) beside every file it copies
 * to a non-Mac disk, zip or network share. They hold Finder metadata, not the
 * client's work, and they have no real extension - so without this they were
 * rejected as an unknown file type and blocked the whole delivery.
 */
export function isIgnoredDeliveryPath(path: string) {
  const segments = path.replaceAll("\\", "/").toLowerCase().split("/").filter(Boolean);
  return segments.some((segment) => DELIVERY_SYSTEM_FILES.has(segment)
    || DELIVERY_SYSTEM_FOLDERS.has(segment)
    || segment.startsWith("._"));
}

/**
 * Every extension a delivery accepts, derived from the picker's accept list
 * plus the raster types it covers with "image/*". Kept in step with the
 * server gate in upload-security.ts, so a file screened in here is one the
 * server will also take (bar a content check it cannot see in advance).
 */
export const DELIVERY_ALLOWED_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp",
  ...DELIVERY_FILE_ACCEPT.split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.startsWith("."))
    .map((entry) => entry.slice(1)),
]);

/** The extension of a file name; a leading dot marks a hidden file, not a type. */
export function deliveryFileExtension(name: string) {
  const lower = name.trim().toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot > 0 && dot < lower.length - 1 ? lower.slice(dot + 1) : "";
}

export type ExcludedDeliveryFile = { file: File; path: string; reason: string };

/**
 * Splits a selection into files that will be delivered and files that will
 * not, with a plain reason for each exclusion, so the sender can see exactly
 * what is being left out before anything uploads.
 */
export function screenDeliveryFiles(incoming: File[]): { accepted: File[]; excluded: ExcludedDeliveryFile[] } {
  const accepted: File[] = [];
  const excluded: ExcludedDeliveryFile[] = [];
  for (const file of incoming) {
    const path = deliveryFileRelativePath(file);
    const ext = deliveryFileExtension(file.name);
    if (isIgnoredDeliveryPath(path)) {
      excluded.push({ file, path, reason: "System file (created by macOS or Windows, not part of the work)" });
    } else if (!file.size) {
      excluded.push({ file, path, reason: "Empty file" });
    } else if (!ext) {
      excluded.push({ file, path, reason: "No file type" });
    } else if (!DELIVERY_ALLOWED_EXTENSIONS.has(ext)) {
      excluded.push({ file, path, reason: `.${ext} files cannot be delivered` });
    } else if (file.size > MAX_DELIVERY_FILE_BYTES) {
      excluded.push({ file, path, reason: "Larger than the 50MB per-file limit" });
    } else {
      accepted.push(file);
    }
  }
  return { accepted, excluded };
}

/** Preserve browser folder-upload paths while keeping ordinary files compatible. */
export function deliveryFileRelativePath(file: File) {
  const folderPath = file.webkitRelativePath?.replaceAll("\\", "/").replace(/^\/+/, "");
  return folderPath || file.name;
}

export type ClientDeliveryType = "brand_identity" | "design";
export type ClientDeliveryStatus =
  | "draft"
  | "assigned"
  | "submitted"
  | "revision_requested"
  | "published"
  | "rejected";

export function isGoogleDeliverableUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && (url.hostname === "drive.google.com" || url.hostname === "docs.google.com");
  } catch {
    return false;
  }
}

export function deliveryTypeLabel(type: ClientDeliveryType) {
  return type === "brand_identity" ? "Brand identity" : "Design deliverable";
}
