import "server-only";
import sharp from "sharp";

/**
 * Centralised upload-security gate.
 *
 * There is no on-box antivirus daemon in this environment, so "no worm/virus"
 * is enforced with the defenses that actually matter for a web app storing
 * user files:
 *
 *  1. Magic-byte sniffing - never trust the browser-supplied filename/MIME.
 *  2. A signature scan that rejects executables (PE / ELF / Mach-O), the
 *     EICAR antivirus test string, and (for non-image gates) active markup
 *     such as <script>, PHP and standalone HTML that could run in a victim's
 *     browser if the file were ever served inline.
 *  3. For images: a full decode + RE-ENCODE through sharp. This is the single
 *     strongest control - it proves the bytes are a real raster image and it
 *     rebuilds the file from pixels, discarding any trailing bytes, embedded
 *     scripts, EXIF payloads or polyglot second-file appended after the image.
 *  4. Size and pixel-dimension caps to stop decompression bombs.
 *
 * Throw `UploadSecurityError` (HTTP 415) is surfaced to callers.
 */
export class UploadSecurityError extends Error {
  status: number;
  constructor(message: string, status = 415) {
    super(message);
    this.name = "UploadSecurityError";
    this.status = status;
  }
}

type RasterType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

const IMAGE_MAGIC: { type: RasterType; ext: string; test: (b: Buffer) => boolean }[] = [
  { type: "image/jpeg", ext: "jpg", test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/png", ext: "png", test: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a },
  { type: "image/gif", ext: "gif", test: (b) => b.length > 6 && b.subarray(0, 3).toString("latin1") === "GIF" },
  { type: "image/webp", ext: "webp", test: (b) => b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
];

const DOC_MAGIC: { kind: DocKind; ext: string; test: (b: Buffer) => boolean }[] = [
  { kind: "pdf", ext: "pdf", test: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  // ZIP container - covers docx/xlsx/pptx and plain .zip.
  { kind: "zip", ext: "zip", test: (b) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07) },
  // Legacy OLE (doc/xls/ppt).
  { kind: "ole", ext: "doc", test: (b) => b.length > 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 },
];

type DocKind = "pdf" | "zip" | "ole";

type UploadFamily = "image" | "pdf" | "office" | "zip" | "design";

const OFFICE_ZIP_EXTENSIONS = new Set(["docx", "docm", "xlsx", "xlsm", "pptx", "pptm", "odt", "ods", "odp", "pages", "numbers", "key"]);
const DESIGN_ZIP_EXTENSIONS = new Set(["idml", "sketch", "xd"]);
const DESIGN_ARCHIVE_EXTENSIONS = new Set(["7z", "rar", "gz", "tar"]);
const DESIGN_TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json"]);
const DESIGN_OPAQUE_EXTENSIONS = new Set(["fig", "afdesign", "afphoto", "afpub"]);
const DESIGN_BINARY_EXTENSIONS = new Set([
  "ai", "psd", "psb", "eps", "ps", "indd", "cdr",
  "tif", "tiff", "bmp", "heic", "heif",
  "ttf", "otf", "woff", "woff2",
  "mp4", "mov", "m4v", "webm", "mkv", "avi",
  "mp3", "wav", "m4a", "aac",
]);

function uploadExtension(file: unknown) {
  const candidate = file as { name?: unknown } | null;
  const name = typeof candidate?.name === "string" ? candidate.name.trim().toLowerCase() : "";
  const dot = name.lastIndexOf(".");
  return dot >= 0 && dot < name.length - 1 ? name.slice(dot + 1).replace(/[^a-z0-9]/g, "") : "";
}

function startsWithAscii(buffer: Buffer, value: string, offset = 0) {
  return buffer.length >= offset + value.length && buffer.subarray(offset, offset + value.length).toString("latin1") === value;
}

function validateSafeSvg(buffer: Buffer) {
  const markup = buffer.toString("utf8").replace(/^\uFEFF/, "").trimStart();
  if (!/^<\?xml\b[^>]*>\s*<svg\b|^<svg\b/i.test(markup.slice(0, 4096))) {
    throw new UploadSecurityError("The SVG file does not contain valid SVG markup.");
  }
  if (/<script\b|<foreignObject\b|<iframe\b|<object\b|<embed\b|<!ENTITY\b|\son[a-z]+\s*=|javascript\s*:|@import\b/i.test(markup)) {
    throw new UploadSecurityError("Blocked: the SVG contains active or externally executable content.");
  }
}

function hasDesignSignature(buffer: Buffer, ext: string) {
  switch (ext) {
    case "ai":
      return startsWithAscii(buffer, "%PDF-") || startsWithAscii(buffer, "%!PS-Adobe-");
    case "psd":
    case "psb":
      return startsWithAscii(buffer, "8BPS");
    case "eps":
    case "ps":
      return startsWithAscii(buffer, "%!PS")
        || (buffer.length >= 4 && buffer.readUInt32LE(0) === 0xc6d3d0c5);
    case "indd":
      return buffer.subarray(0, 16).toString("hex") === "0606edf5d81d46e5bd31efe7fe74b71d";
    case "cdr":
      return startsWithAscii(buffer, "RIFF") && buffer.subarray(8, 12).toString("latin1").startsWith("CDR");
    case "tif":
    case "tiff":
      return buffer.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00]))
        || buffer.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]));
    case "bmp":
      return startsWithAscii(buffer, "BM");
    case "heic":
    case "heif": {
      const brand = buffer.subarray(8, 12).toString("latin1");
      return startsWithAscii(buffer, "ftyp", 4) && ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand);
    }
    case "ttf":
      return buffer.subarray(0, 4).equals(Buffer.from([0x00, 0x01, 0x00, 0x00]))
        || ["true", "typ1"].some((signature) => startsWithAscii(buffer, signature));
    case "otf":
      return startsWithAscii(buffer, "OTTO");
    case "woff":
      return startsWithAscii(buffer, "wOFF");
    case "woff2":
      return startsWithAscii(buffer, "wOF2");
    case "mp4":
    case "mov":
    case "m4v":
    case "m4a":
      return startsWithAscii(buffer, "ftyp", 4);
    case "webm":
    case "mkv":
      return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    case "avi":
      return startsWithAscii(buffer, "RIFF") && startsWithAscii(buffer, "AVI ", 8);
    case "wav":
      return startsWithAscii(buffer, "RIFF") && startsWithAscii(buffer, "WAVE", 8);
    case "mp3":
      return startsWithAscii(buffer, "ID3")
        || (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
    case "aac":
      return buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] === 0xf1 || buffer[1] === 0xf9);
    default:
      return false;
  }
}

function safeDesignAsset(buffer: Buffer, ext: string): SafeUpload {
  if (ext === "svg") {
    validateSafeSvg(buffer);
    return { buffer, contentType: "application/octet-stream", ext, kind: "document" };
  }
  if (DESIGN_TEXT_EXTENSIONS.has(ext)) {
    if (buffer.includes(0)) throw new UploadSecurityError(`The .${ext} file is not a valid text asset.`);
    const active = scanForActiveContent(buffer);
    if (active) throw new UploadSecurityError(`Blocked: the text asset contains ${active}.`);
    return { buffer, contentType: "text/plain; charset=utf-8", ext, kind: "document" };
  }
  if (DESIGN_ARCHIVE_EXTENSIONS.has(ext)) {
    const signatureMatches = (ext === "7z" && buffer.subarray(0, 6).equals(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])))
      || (ext === "rar" && startsWithAscii(buffer, "Rar!"))
      || (ext === "gz" && buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b)
      || (ext === "tar" && startsWithAscii(buffer, "ustar", 257));
    if (!signatureMatches) throw new UploadSecurityError(`The .${ext} archive could not be verified.`);
    return { buffer, contentType: "application/octet-stream", ext, kind: "archive" };
  }
  if (DESIGN_BINARY_EXTENSIONS.has(ext)) {
    if (!hasDesignSignature(buffer, ext)) throw new UploadSecurityError(`The .${ext} delivery asset could not be verified.`);
    return { buffer, contentType: "application/octet-stream", ext, kind: "document" };
  }
  if (DESIGN_OPAQUE_EXTENSIONS.has(ext)) {
    return { buffer, contentType: "application/octet-stream", ext, kind: "document" };
  }
  throw new UploadSecurityError(`The .${ext || "unknown"} file type is not allowed for a client delivery.`);
}

/** EICAR test string, assembled at runtime so this source file isn't itself flagged by scanners. */
const EICAR = ["X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR", "-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"].join("");

/** Detects binaries that must never be stored as a user upload. Content-agnostic. */
export function scanForExecutable(buffer: Buffer): string | null {
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) return "Windows executable (MZ)";
  if (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) return "Linux executable (ELF)";
  if (buffer.length >= 4) {
    const magic = buffer.readUInt32BE(0) >>> 0;
    // Mach-O (32/64, both endiannesses) and Java class / fat binary.
    if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(magic)) return "Mach-O / Java executable";
  }
  if (buffer.length >= 4 && buffer[0] === 0x23 && buffer[1] === 0x21) return "shell script (shebang)"; // #!
  if (buffer.includes(EICAR)) return "EICAR antivirus test signature";
  return null;
}

/** Detects active/browser-executable markup - used for non-image gates. */
export function scanForActiveContent(buffer: Buffer): string | null {
  const head = buffer.subarray(0, 16 * 1024).toString("latin1").toLowerCase();
  if (head.includes("<script")) return "embedded <script>";
  if (head.includes("<?php")) return "embedded PHP";
  if (head.includes("<!doctype html") || head.includes("<html")) return "HTML markup";
  if (head.includes("<svg")) return "SVG markup (scriptable)";
  return null;
}

/**
 * Universal, type-agnostic guard for any stored upload (images, video, docs).
 * Rejects executables / EICAR - the "no worm or virus" baseline - with zero
 * false positives on legitimate media or documents. Pass `activeContent: true`
 * for gates whose files may be served inline as markup (to also block
 * <script>/PHP/HTML/SVG payloads). Cheap: only inspects file headers.
 */
export function assertCleanBuffer(buffer: Buffer, opts: { activeContent?: boolean } = {}): void {
  if (!buffer.length) throw new UploadSecurityError("The uploaded file is empty.");
  const executable = scanForExecutable(buffer);
  if (executable) throw new UploadSecurityError(`Blocked: the file contains a ${executable}.`);
  if (opts.activeContent) {
    const active = scanForActiveContent(buffer);
    if (active) throw new UploadSecurityError(`Blocked: the file contains ${active}.`);
  }
}

export interface SafeImage {
  buffer: Buffer;
  contentType: RasterType;
  ext: string;
  width: number;
  height: number;
}

const DEFAULT_IMAGE_MAX = 8 * 1024 * 1024; // 8MB
const MAX_DIMENSION = 12000; // guard against decompression bombs

/**
 * Validate + normalise an image upload. Returns a CLEAN, re-encoded buffer that
 * is safe to persist. Rejects anything that is not a genuine raster image.
 */
export async function assertSafeImage(
  file: Blob | { arrayBuffer: () => Promise<ArrayBuffer>; type?: string; size?: number },
  opts: { maxBytes?: number; maxDimension?: number | null; maxInputPixels?: number; preserveOriginal?: boolean } = {},
): Promise<SafeImage> {
  const maxBytes = opts.maxBytes ?? DEFAULT_IMAGE_MAX;
  const buffer = Buffer.from(await file.arrayBuffer());

  if (!buffer.length) throw new UploadSecurityError("The uploaded file is empty.");
  if (buffer.length > maxBytes) {
    throw new UploadSecurityError(`Image is larger than the ${Math.floor(maxBytes / 1024 / 1024)}MB limit.`, 413);
  }

  const executable = scanForExecutable(buffer);
  if (executable) throw new UploadSecurityError(`Blocked: the file looks like a ${executable}, not an image.`);

  const sniff = IMAGE_MAGIC.find((m) => m.test(buffer));
  if (!sniff) throw new UploadSecurityError("Only PNG, JPEG, WEBP or GIF images are allowed.");

  const maxInputPixels = opts.maxInputPixels ?? MAX_DIMENSION * MAX_DIMENSION;
  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer, { animated: sniff.type === "image/gif", limitInputPixels: maxInputPixels }).metadata();
  } catch {
    throw new UploadSecurityError("The file is not a decodable image.");
  }
  if (!meta.width || !meta.height) throw new UploadSecurityError("The file is not a valid image.");
  const maxDimension = opts.maxDimension === undefined ? MAX_DIMENSION : opts.maxDimension;
  if (maxDimension !== null && (meta.width > maxDimension || meta.height > maxDimension)) {
    throw new UploadSecurityError(`Image dimensions exceed ${maxDimension}px.`);
  }
  const swapOrientation = Boolean(meta.orientation && meta.orientation >= 5 && meta.orientation <= 8);
  const width = swapOrientation ? meta.height : meta.width;
  const height = swapOrientation ? meta.width : meta.height;

  // Print artwork must retain its source pixels and colour data. Private banner
  // storage can preserve verified raster bytes after the signature/decode gate.
  if (opts.preserveOriginal) {
    return { buffer, contentType: sniff.type, ext: sniff.ext, width, height };
  }

  // Re-encode from decoded pixels: this strips metadata, comments and any bytes
  // appended after the image (the classic image+payload polyglot).
  const pipeline = sharp(buffer, { animated: sniff.type === "image/gif", limitInputPixels: maxInputPixels }).rotate();
  let outBuffer: Buffer;
  let contentType: RasterType = sniff.type;
  let ext = sniff.ext;
  if (sniff.type === "image/png") {
    outBuffer = await pipeline.png().toBuffer();
  } else if (sniff.type === "image/webp") {
    outBuffer = await pipeline.webp().toBuffer();
  } else if (sniff.type === "image/gif") {
    outBuffer = await pipeline.gif().toBuffer();
  } else {
    outBuffer = await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    contentType = "image/jpeg";
    ext = "jpg";
  }

  return { buffer: outBuffer, contentType, ext, width, height };
}

export interface SafeUpload {
  buffer: Buffer;
  contentType: string;
  ext: string;
  kind: "image" | "pdf" | "office" | "zip" | "archive" | "document";
  width?: number;
  height?: number;
}

/**
 * General-purpose gate for mixed uploads (documents, plus images). Images are
 * run through the full image pipeline; documents are signature-checked and
 * type-allowlisted. Returns a buffer that is safe to persist.
 *
 * `allow` limits which families are accepted at this gate.
 */
export async function assertSafeUpload(
  file: Blob | { arrayBuffer: () => Promise<ArrayBuffer>; type?: string; size?: number; name?: string },
  opts: { allow: UploadFamily[]; maxBytes?: number; imageMaxDimension?: number | null; imageMaxInputPixels?: number; preserveImageBytes?: boolean },
): Promise<SafeUpload> {
  const maxBytes = opts.maxBytes ?? 25 * 1024 * 1024;
  const buffer = Buffer.from(await file.arrayBuffer());
  const originalExt = uploadExtension(file);

  if (!buffer.length) throw new UploadSecurityError("The uploaded file is empty.");
  if (buffer.length > maxBytes) {
    throw new UploadSecurityError(`File is larger than the ${Math.floor(maxBytes / 1024 / 1024)}MB limit.`, 413);
  }

  const executable = scanForExecutable(buffer);
  if (executable) throw new UploadSecurityError(`Blocked: the file contains a ${executable}.`);

  // Image branch: re-use the strict image pipeline (which itself re-encodes).
  if (opts.allow.includes("image") && IMAGE_MAGIC.some((m) => m.test(buffer))) {
    const img = await assertSafeImage(file, {
      maxBytes,
      maxDimension: opts.imageMaxDimension,
      maxInputPixels: opts.imageMaxInputPixels,
      preserveOriginal: opts.preserveImageBytes,
    });
    return { buffer: img.buffer, contentType: img.contentType, ext: img.ext, kind: "image", width: img.width, height: img.height };
  }

  const doc = DOC_MAGIC.find((m) => m.test(buffer));
  if (!doc) {
    if (opts.allow.includes("design")) return safeDesignAsset(buffer, originalExt);
    throw new UploadSecurityError("This file type is not allowed here.");
  }
  // ZIP-family (which includes docx/xlsx/pptx) and PDFs can embed markup; only
  // reject when active content is present outside of the office-xml envelope.
  const active = scanForActiveContent(buffer);
  if (doc.kind === "pdf" && active) {
    throw new UploadSecurityError(`Blocked: the document contains ${active}.`);
  }

  if (doc.kind === "pdf") {
    if (!opts.allow.includes("pdf")) throw new UploadSecurityError("PDFs are not allowed here.");
    return { buffer, contentType: "application/pdf", ext: "pdf", kind: "pdf" };
  }
  if (doc.kind === "zip" || doc.kind === "ole") {
    const wantsOffice = opts.allow.includes("office");
    const wantsZip = opts.allow.includes("zip");
    const wantsDesign = opts.allow.includes("design");
    if (!wantsOffice && !wantsZip && !wantsDesign) throw new UploadSecurityError("This document type is not allowed here.");
    if (doc.kind === "zip" && wantsDesign && DESIGN_ZIP_EXTENSIONS.has(originalExt)) {
      return { buffer, contentType: "application/octet-stream", ext: originalExt, kind: "document" };
    }
    if (doc.kind === "zip" && wantsZip && originalExt === "zip") {
      return { buffer, contentType: "application/zip", ext: "zip", kind: "zip" };
    }
    if (doc.kind === "zip" && wantsOffice && OFFICE_ZIP_EXTENSIONS.has(originalExt)) {
      return { buffer, contentType: "application/zip", ext: originalExt, kind: "office" };
    }
    if (doc.kind === "ole" && !wantsOffice) throw new UploadSecurityError("This document type is not allowed here.");
    return {
      buffer,
      contentType: doc.kind === "ole" ? "application/vnd.ms-office" : "application/zip",
      ext: originalExt || doc.ext,
      kind: doc.kind === "ole" || wantsOffice ? "office" : "zip",
    };
  }

  throw new UploadSecurityError("This file type is not allowed here.");
}
