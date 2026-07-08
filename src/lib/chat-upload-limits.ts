/**
 * Shared chat attachment size limits.
 *
 * Per CDS Space policy: keep large media out of chat storage. Images cap at
 * 6MB, videos at 50MB; anything bigger should go to Google Drive with a shared
 * link pasted into the chat. Used by both the client (instant feedback) and the
 * upload route (authoritative enforcement) so they never disagree.
 */
export type ChatUploadKind = "image" | "video" | "other";

export const CHAT_UPLOAD_LIMITS: Record<ChatUploadKind, number> = {
  image: 6 * 1024 * 1024,   // 6 MB
  video: 50 * 1024 * 1024,  // 50 MB
  other: 25 * 1024 * 1024,  // 25 MB (PDFs, docs)
};

export const CHAT_UPLOAD_LIMIT_LABEL: Record<ChatUploadKind, string> = {
  image: "6MB",
  video: "50MB",
  other: "25MB",
};

export function chatUploadKind(mime: string): ChatUploadKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "other";
}

const NOUN: Record<ChatUploadKind, string> = { image: "Images", video: "Videos", other: "Files" };

/**
 * Validate a chat upload by size + type. On failure the message tells the user
 * to switch to Google Drive, per the file-sharing policy.
 */
export function validateChatUpload(
  size: number,
  mime: string,
): { ok: true; kind: ChatUploadKind } | { ok: false; error: string } {
  const kind = chatUploadKind(mime);
  if (size > CHAT_UPLOAD_LIMITS[kind]) {
    return {
      ok: false,
      error: `${NOUN[kind]} must be ${CHAT_UPLOAD_LIMIT_LABEL[kind]} or smaller. For anything larger, upload it to Google Drive and paste the share link in the chat instead.`,
    };
  }
  return { ok: true, kind };
}
