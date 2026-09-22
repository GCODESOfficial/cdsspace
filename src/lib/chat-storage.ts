/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import { getGlashDbAdmin } from "@/lib/glashdb";

/** Permanently remove a CDS chat attachment without accepting arbitrary paths. */
export async function purgeChatAttachment(publicUrl: string | null | undefined) {
  if (!publicUrl) return;
  let pathname = "";
  try { pathname = new URL(publicUrl).pathname; } catch { return; }
  const marker = "/storage/v1/object/public/media/";
  const index = pathname.indexOf(marker);
  if (index < 0) return;
  const path = decodeURIComponent(pathname.slice(index + marker.length));
  if (!path.startsWith("chat-attachments/") || path.includes("..")) return;
  const db = getGlashDbAdmin() as any;
  if (db?.storage) await db.storage.from("media").remove([path]);
}
