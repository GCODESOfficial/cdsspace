/* eslint-disable @typescript-eslint/no-explicit-any */
// Shared auth shim used by the ported team tools (cDocs, cMeet, cSign,
// Protect Docs, cResume). Treats super-admin and team_session cookies
// as one "actor" with a common shape.

import { cookies } from "next/headers";
import { getTeamSession } from "@/lib/team-auth";

export type ToolActor =
  | { kind: "admin"; id: null; name: string; email: string; is_admin: true }
  | {
      kind: "team";
      id: string;
      name: string;
      email: string;
      is_admin: false;
      department: string | null;
      is_sub_admin: boolean;
      permissions: string[];
    };

export async function getToolActor(): Promise<ToolActor | null> {
  const store = await cookies();
  const rawAdmin = store.get("admin_session")?.value;
  if (rawAdmin) {
    try {
      const s = JSON.parse(rawAdmin);
      if (s.role === "super_admin" || s.role === "sub_admin") {
        return { kind: "admin", id: null, name: s.name || "Admin", email: s.email, is_admin: true };
      }
    } catch {
      /* fallthrough */
    }
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
    };
  }
  return null;
}
