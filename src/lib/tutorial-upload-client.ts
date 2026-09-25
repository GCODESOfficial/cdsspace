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
  return {
    uploadId: String(payload.uploadId),
    chunkSize: Number(payload.chunkSize) || 4 * 1024 * 1024,
    totalParts: Number(payload.totalParts) || 1,
    parallel: Number(payload.parallel) || 4,
    receivedIndexes: [] as number[],
  };
}

export async function uploadStatus(uploadId: string) {
  const response = await fetch(`/api/admin/tutorials/upload?action=status&uploadId=${encodeURIComponent(uploadId)}`, { method: "POST" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.found) return null;
  return {
    receivedBytes: Number(payload.receivedBytes) || 0,
    receivedIndexes: Array.isArray(payload.receivedIndexes) ? (payload.receivedIndexes as number[]) : [],
    fileName: String(payload.fileName || ""),
    fileSize: Number(payload.fileSize) || 0,
    chunkSize: Number(payload.chunkSize) || 4 * 1024 * 1024,
    totalParts: Number(payload.totalParts) || 1,
    parallel: Number(payload.parallel) || 4,
  };
}

export async function discardUpload(uploadId: string) {
  await call("discard", { uploadId }).catch(() => undefined);
  clearPendingUpload();
}

/**
 * One part, sent as form data.
 *
 * The host refuses raw bodies over about 2MB but accepts multipart bodies many
 * times larger, so parts travel in a form rather than as a bare binary body.
 */
function sendPart(input: {
  uploadId: string;
  index: number;
  chunk: Blob;
  signal: AbortSignal;
  onBytes: (loaded: number) => void;
}) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/admin/tutorials/upload?action=chunk");
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) input.onBytes(event.loaded);
    });
    request.addEventListener("load", () => {
      let payload: Record<string, unknown> = {};
      try { payload = JSON.parse(request.responseText || "{}"); } catch { payload = {}; }
      if (request.status >= 200 && request.status < 300) resolve();
      else if (request.status === 413) reject(new Error("The server refused a part as too large. Tell an administrator the upload limit needs raising."));
      else reject(new Error(String(payload.error || `Part ${input.index + 1} could not be sent.`)));
    });
    request.addEventListener("error", () => reject(new Error("The connection dropped. Your progress is saved, so you can carry on.")));
    request.addEventListener("abort", () => reject(new DOMException("Upload cancelled", "AbortError")));
    input.signal.addEventListener("abort", () => request.abort(), { once: true });

    const form = new FormData();
    form.set("uploadId", input.uploadId);
    form.set("index", String(input.index));
    form.set("chunk", input.chunk, `part-${input.index}`);
    request.send(form);
  });
}

/**
 * Sends every part that is not already on the server, several at a time.
 *
 * Parts are independent, so a few travel together: that keeps a long upload
 * moving at the speed of the line rather than one round trip at a time, and a
 * part that fails can be retried without touching the others.
 */
export async function uploadFileInChunks(input: {
  file: File;
  uploadId: string;
  chunkSize: number;
  totalParts: number;
  parallel?: number;
  receivedIndexes?: number[];
  signal: AbortSignal;
  onProgress: (progress: UploadProgress) => void;
  onPartDone?: (receivedBytes: number) => void;
}) {
  const started = Date.now();
  const done = new Set(input.receivedIndexes || []);
  const partSize = (index: number) => Math.min(input.chunkSize, input.file.size - index * input.chunkSize);
  const settled = () => [...done].reduce((total, index) => total + partSize(index), 0);
  const inFlight = new Map<number, number>();
  const alreadyHad = settled();

  const report = () => {
    const sent = Math.min(input.file.size, settled() + [...inFlight.values()].reduce((a, b) => a + b, 0));
    const elapsed = Math.max(0.25, (Date.now() - started) / 1000);
    const bytesPerSecond = Math.max(0, sent - alreadyHad) / elapsed;
    const remaining = input.file.size - sent;
    input.onProgress({
      sentBytes: sent,
      totalBytes: input.file.size,
      percent: input.file.size ? Math.min(100, Math.round((sent / input.file.size) * 100)) : 0,
      bytesPerSecond,
      secondsRemaining: bytesPerSecond > 1024 ? Math.round(remaining / bytesPerSecond) : null,
    });
  };

  const queue: number[] = [];
  for (let index = 0; index < input.totalParts; index += 1) if (!done.has(index)) queue.push(index);
  report();

  const lanes = Math.max(1, Math.min(input.parallel || 4, queue.length || 1));
  const worker = async () => {
    for (;;) {
      if (input.signal.aborted) throw new DOMException("Upload cancelled", "AbortError");
      const index = queue.shift();
      if (index === undefined) return;
      const start = index * input.chunkSize;
      const chunk = input.file.slice(start, start + partSize(index));
      inFlight.set(index, 0);
      try {
        // One retry: a single dropped part should not end the whole upload.
        try {
          await sendPart({ uploadId: input.uploadId, index, chunk, signal: input.signal, onBytes: (loaded) => { inFlight.set(index, loaded); report(); } });
        } catch (error) {
          if (input.signal.aborted || (error instanceof Error && /too large/.test(error.message))) throw error;
          inFlight.set(index, 0);
          await sendPart({ uploadId: input.uploadId, index, chunk, signal: input.signal, onBytes: (loaded) => { inFlight.set(index, loaded); report(); } });
        }
        done.add(index);
        input.onPartDone?.(settled());
      } finally {
        inFlight.delete(index);
      }
      report();
    }
  };

  await Promise.all(Array.from({ length: lanes }, () => worker()));
  report();
  return settled();
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
