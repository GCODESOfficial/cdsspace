"use client";

import { appConfirm, appToast } from "@/lib/app-notify";

export async function offerClientStorageRequest(code: unknown) {
  if (code !== "CLIENT_STORAGE_FULL") return false;
  const request = await appConfirm({
    title: "Storage space is full",
    message: "Request more space from CDS Space to continue uploading files and creating new work.",
    confirmLabel: "Request more space",
    cancelLabel: "Not now",
  });
  if (!request) return true;
  try {
    const response = await fetch("/api/client/storage-request", { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not send your request.");
    appToast({
      kind: "success",
      message: payload.alreadyPending ? "Your storage request is already with the admin." : "Your request was sent to the admin.",
    });
  } catch (error) {
    appToast({ kind: "error", message: error instanceof Error ? error.message : "Could not send your storage request." });
  }
  return true;
}
