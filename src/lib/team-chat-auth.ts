/* eslint-disable @typescript-eslint/no-explicit-any */
import { cookies } from "next/headers";
import { getTeamSession, type TeamSession } from "@/lib/team-auth";

export type ChatViewer =
  | { kind: "admin"; email: string; name: string; role: "super_admin" | "sub_admin" }
  | { kind: "team"; session: TeamSession };

/**
 * Server-only auth for the team chat APIs. A caller is either:
 *  - an admin (super_admin or sub_admin cookie), or
 *  - a logged-in team member (team_session cookie)
 */
export async function getChatViewer(): Promise<ChatViewer | null> {
  const store = await cookies();
  const rawAdmin = store.get("admin_session")?.value;
  if (rawAdmin) {
    try {
      const s = JSON.parse(rawAdmin);
      if (s.role === "super_admin" || s.role === "sub_admin") {
        return { 
          kind: "admin", 
          email: s.email, 
          name: s.name || "Admin",
          role: s.role 
        };
      }
    } catch {
      /* fallthrough */
    }
  }
  const team = await getTeamSession();
  if (team) return { kind: "team", session: team };
  return null;
}

export function viewerMemberId(v: ChatViewer): string | null {
  return v.kind === "team" ? v.session.id : null;
}

export function viewerDisplayName(v: ChatViewer): string {
  return v.kind === "admin" ? v.name : v.session.full_name;
}
