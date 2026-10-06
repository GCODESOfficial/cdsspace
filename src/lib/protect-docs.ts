 
// Helpers for Protect Docs: password hashing, access check.

import bcrypt from "bcryptjs";
import type { ToolActor } from "@/lib/team-tools-auth";

export async function hashDocPassword(password: string) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function verifyDocPassword(password: string, hash: string) {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

export function canActorReadDoc(
  actor: ToolActor,
  doc: {
    visibility: string;
    allowed_department: string | null;
    allowed_member_ids: string[] | null;
    specific_member_ids?: string[] | null;
    uploaded_by?: string | null;
  }
): boolean {
  if (actor.is_admin) return true;
  if (actor.kind !== "team") return false;
  switch (doc.visibility) {
    case "public":
    case "all_team":
      return true;
    case "admin_only":
      return false;
    case "department":
      return !!doc.allowed_department && doc.allowed_department === actor.department;
    case "specific_members": {
      const list = doc.specific_member_ids || doc.allowed_member_ids || [];
      return list.includes(actor.id) || doc.uploaded_by === actor.id;
    }
    default:
      return false;
  }
}
