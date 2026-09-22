/* eslint-disable @typescript-eslint/no-explicit-any */
import { getTeamSession, type TeamSession } from "@/lib/team-auth";
import { getAdminSession } from "@/lib/admin-session";

export type ChatViewer =
  | {
      kind: "admin";
      email: string;
      name: string;
      role: "super_admin" | "sub_admin";
      memberId: string | null;
      roleTitle: string | null;
    }
  | { kind: "team"; session: TeamSession };

/**
 * Server-only auth for the team chat APIs. A caller is either:
 *  - an admin (super_admin or sub_admin cookie), or
 *  - a logged-in team member (team_session cookie)
 */
export async function getChatViewer(): Promise<ChatViewer | null> {
  const admin = await getAdminSession();
  if (admin) {
    return {
      kind: "admin",
      email: admin.email,
      name: admin.role === "super_admin" ? "Super admin" : admin.name,
      role: admin.role,
      memberId: admin.role === "sub_admin" ? admin.memberId || null : null,
      roleTitle: admin.role === "sub_admin" ? admin.teamRoleTitle || null : null,
    };
  }
  const team = await getTeamSession();
  if (team) return { kind: "team", session: team };
  return null;
}

export function viewerMemberId(v: ChatViewer): string | null {
  return v.kind === "team" ? v.session.id : v.memberId;
}

export function viewerDisplayName(v: ChatViewer): string {
  return v.kind === "admin" ? v.name : v.session.full_name;
}

export function viewerRoleTitle(v: ChatViewer): string | null {
  return v.kind === "admin" ? v.roleTitle : v.session.role_title || null;
}

export function viewerIsSuperAdmin(v: ChatViewer) {
  return v.kind === "admin" && v.role === "super_admin";
}
