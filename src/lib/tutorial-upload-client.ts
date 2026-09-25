"use client";

/**
 * Sends a tutorial video in parts, and remembers one that did not finish.
 *
 * A whole video in a single request was refused by the proxy above roughly
 * 48MB, which is why an upload could sit at 0% and never move. Parts of a few
 * megabytes pass, every part reports real progress, and the unfinished upload
 * is kept so it can be carried on rather than started again.
 */
const PENDING_KEY = "cds.tutorial-upload.pending.v1";

export type PendingUpload = {
  uploadId: string;
  fileName: string;
  fileSize: number;
  receivedBytes: number;
  savedAt: number;
  /** Everything typed into the form, so the admin does not fill it in twice. */
  meta: Record<string, string>;
};

export type UploadProgress = {
  sentBytes: number;
  totalBytes: number;
  percent: number;
  bytesPerSecond: number;
  secondsRemaining: number | null;
};

export function readPendingUpload(): PendingUpload | null {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) as PendingUpload : null;
  } catch {
    return null;
  }
}

export function writePendingUpload(pending: PendingUpload) {
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // A full or blocked store only costs the resume option, never the upload.
  }
}

export function clearPendingUpload() {
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // Nothing to do.
  }
}

async function call(action: string, body?: unknown) {
  const response = await fetch(`/api/admin/tutorials/upload?action=${action}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "The upload could not be handled.");
  return payload as Record<string, unknown>;
}

export async function beginUpload(file: File) {
  const payload = await call("begin", { fileName: file.name, fileSize: file.size, contentType: file.type || "video/mp4" });
  return { uploadId: String(payload.uploadId), chunkSize: Number(payload.chunkSize) || 4 * 1024 * 1024 };
}

export async function uploadStatus(uploadId: string) {
  const response = await fetch(`/api/admin/tutorials/upload?action=status&uploadId=${encodeURIComponent(uploadId)}`, { method: "POST" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.found) return null;
  return {
    receivedBytes: Number(payload.receivedBytes) || 0,
    fileName: String(payload.fileName || ""),
    fileSize: Number(payload.fileSize) || 0,
    chunkSize: Number(payload.chunkSize) || 4 * 1024 * 1024,
  };
}

export async function discardUpload(uploadId: string) {
  await call("discard", { uploadId }).catch(() => undefined);
  clearPendingUpload();
}

/** One part, with progress, so a slow line still shows movement inside a part. */
function sendChunk(uploadId: string, offset: number, chunk: Blob, signal: AbortSignal, onBytes: (loaded: number) => void) {
  return new Promise<number>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `/api/admin/tutorials/upload?action=chunk&uploadId=${encodeURIComponent(uploadId)}&offset=${offset}`);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onBytes(event.loaded);
    });
    request.addEventListener("load", () => {
      let payload: Record<string, unknown> = {};
      try { payload = JSON.parse(request.responseText || "{}"); } catch { payload = {}; }
      if (request.status >= 200 && request.status < 300) resolve(Number(payload.receivedBytes) || offset + chunk.size);
      else if (request.status === 413) reject(new Error("The server refused this part as too large. Tell an administrator the upload limit needs raising."));
      else reject(new Error(String(payload.error || `The upload stopped at ${Math.round(offset / (1024 * 1024))}MB.`)));
    });
    request.addEventListener("error", () => reject(new Error("The connection dropped. You can carry on from here.")));
    request.addEventListener("abort", () => reject(new DOMException("Upload cancelled", "AbortError")));
    signal.addEventListener("abort", () => request.abort(), { once: true });
    request.send(chunk);
  });
}

/**
 * Sends everything from `startAt` onward. Progress is reported across the
 * whole file, not the current part, so the bar means what it says.
 */
export async function uploadFileInChunks(input: {
  file: File;
  uploadId: string;
  chunkSize: number;
  startAt: number;
  signal: AbortSignal;
  onProgress: (progress: UploadProgress) => void;
  onChunkDone?: (receivedBytes: number) => void;
}) {
  const started = Date.now();
  const alreadyHad = input.startAt;
  let confirmed = input.startAt;

  const report = (sent: number) => {
    const elapsed = Math.max(0.25, (Date.now() - started) / 1000);
    const movedThisSession = Math.max(0, sent - alreadyHad);
    const bytesPerSecond = movedThisSession / elapsed;
    const remaining = input.file.size - sent;
    input.onProgress({
      sentBytes: sent,
      totalBytes: input.file.size,
      percent: input.file.size ? Math.min(100, Math.round((sent / input.file.size) * 100)) : 0,
      bytesPerSecond,
      secondsRemaining: bytesPerSecond > 1024 ? Math.round(remaining / bytesPerSecond) : null,
    });
  };

  report(confirmed);
  while (confirmed < input.file.size) {
    if (input.signal.aborted) throw new DOMException("Upload cancelled", "AbortError");
    const end = Math.min(confirmed + input.chunkSize, input.file.size);
    const chunk = input.file.slice(confirmed, end);
    const offset = confirmed;
    const received = await sendChunk(input.uploadId, offset, chunk, input.signal, (loaded) => report(offset + loaded));
    confirmed = received;
    input.onChunkDone?.(confirmed);
    report(confirmed);
  }
  return confirmed;
}

export async function finishUpload(uploadId: string, meta: Record<string, unknown>) {
  return call("finish", { uploadId, ...meta });
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

export function formatDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return null;
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s left`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"} left`;
}
