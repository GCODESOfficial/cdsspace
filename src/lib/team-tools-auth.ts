 
// Shared auth shim used by the ported team tools (cDocs, cMeet, cSign,
// Protect Docs, cResume). Treats super-admin and team_session cookies
// as one "actor" with a common shape.

import { cookies } from "next/headers";
import { getTeamSession } from "@/lib/team-auth";
import { getAdminSession } from "@/lib/admin-session";
import { verifyAdminCookie } from "@/lib/admin-session-cookie";

export type ToolActor =
  | {
      kind: "admin";
      id: null;
      name: string;
      email: string;
      is_admin: true;
      role: "super_admin" | "sub_admin";
      memberId: string | null;
      avatarUrl: string;
    }
  | {
      kind: "team";
      id: string;
      name: string;
      email: string;
      is_admin: false;
      department: string | null;
      is_sub_admin: boolean;
      permissions: string[];
      avatarUrl: string | null;
    };

export async function getToolActor(): Promise<ToolActor | null> {
  const store = await cookies();
  const s = verifyAdminCookie<{ role: "super_admin" | "sub_admin"; email: string; name?: string }>(
    store.get("admin_session")?.value,
  );
  if (s && (s.role === "super_admin" || s.role === "sub_admin")) {
    const refreshed = s.role === "sub_admin" ? await getAdminSession() : null;
    return {
      kind: "admin",
      id: null,
      name: s.role === "super_admin" ? "Super admin" : refreshed?.name || s.name || "Team member",
      email: refreshed?.email || s.email,
      is_admin: true,
      role: s.role,
      memberId: s.role === "sub_admin" ? refreshed?.memberId || null : null,
      avatarUrl: "/favicon.png",
    };
  }
  const team = await getTeamSession();
  if (team) {
    return {
      kind: "team",
      id: team.id,
      name: team.full_name,
      email: team.email,
      is_admin: false,
      department: team.department,
      is_sub_admin: team.is_sub_admin,
      permissions: team.permissions || [],
      avatarUrl: team.avatar_url || null,
    };
  }
  return null;
}
