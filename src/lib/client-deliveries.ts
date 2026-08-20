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

const DELIVERY_SYSTEM_FILES = new Set([".ds_store", "thumbs.db", "desktop.ini"]);

/** Ignore operating-system and source-control metadata included by folder pickers. */
export function isIgnoredDeliveryPath(path: string) {
  const segments = path.replaceAll("\\", "/").toLowerCase().split("/").filter(Boolean);
  return segments.some((segment) => DELIVERY_SYSTEM_FILES.has(segment) || segment === "__macosx" || segment === ".git");
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
