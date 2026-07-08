import { supabase } from "@/lib/supabase";
import type { TeamSession } from "@/lib/team-auth";

export type CDocAction =
  | "created"
  | "edited"
  | "renamed"
  | "categorized"
  | "archived"
  | "unarchived"
  | "deleted"
  | "shared"
  | "sign_requested"
  | "signed"
  | "sign_declined";

export async function logCDocActivity(
  cdocId: string,
  session: TeamSession | null,
  action: CDocAction,
  detail?: string
): Promise<void> {
  if (!cdocId) return;
  try {
    await supabase.from("team_cdocs_activity").insert([
      {
        cdoc_id: cdocId,
        actor_member_id: session?.kind === "member" ? session.memberId : null,
        actor_is_admin: session?.kind === "owner",
        actor_name: session?.kind === "owner"
          ? "Admin"
          : session?.name || session?.username || session?.email || null,
        action,
        detail: detail || null,
      },
    ]);
  } catch (err) {
    // Activity logging is best-effort - never block the caller.
    console.error("[cdocs-activity] log failed:", err);
  }
}
