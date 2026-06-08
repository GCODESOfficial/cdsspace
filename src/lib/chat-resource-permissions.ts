/* eslint-disable @typescript-eslint/no-explicit-any */
import { type ChatViewer } from "@/lib/team-chat-auth";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { hasPermission } from "@/lib/admin-permissions";

type ProtectedResourceType = "project" | "project_file" | "document" | "invoice";

function protectedType(value: unknown): ProtectedResourceType | null {
  if (value === "project" || value === "project_file" || value === "document" || value === "invoice") return value;
  return null;
}

function getResourcePayload(metadata: unknown) {
  const meta = metadata && typeof metadata === "object" ? (metadata as Record<string, any>) : {};
  const type = protectedType(meta.resourceType || meta.resource_type);
  const id = typeof meta.resourceId === "string" ? meta.resourceId : typeof meta.resource_id === "string" ? meta.resource_id : null;
  if (!type || !id) return null;
  return { type, id };
}

async function threadContainsOnlySubAdmins(threadId: string) {
  const rows = await glashQuery<{ id: string; is_sub_admin: boolean }>(
    `select m.id, m.is_sub_admin
     from public.team_chat_participants p
     join public.team_members m on m.id = p.team_member_id
     where p.thread_id = $1`,
    [threadId],
  );
  return rows.length === 0 || rows.every((row) => row.is_sub_admin);
}

async function teamMemberHasProjectAccess(teamMemberId: string, projectId: string) {
  const row = await glashMaybeOne(
    `select 1
     from public.project_assignments
     where project_id = $1::uuid and team_member_id = $2::uuid
     limit 1`,
    [projectId, teamMemberId],
  );
  return !!row;
}

export async function canShareProtectedChatResource(
  viewer: ChatViewer,
  threadId: string,
  metadata: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resource = getResourcePayload(metadata);
  if (!resource) return { ok: true };

  if (!(await threadContainsOnlySubAdmins(threadId))) {
    return {
      ok: false,
      error: "Protected projects, documents, and invoices can only be shared in sub-admin-only chats.",
    };
  }

  if (viewer.kind === "admin") return { ok: true };

  const permissions = viewer.session.permissions || [];
  if (!viewer.session.is_sub_admin) {
    return { ok: false, error: "Only sub-admins can share protected projects, documents, and invoices." };
  }

  if (resource.type === "invoice") {
    return hasPermission(permissions, "finance_invoices") || hasPermission(permissions, "finance_invoices.view")
      ? { ok: true }
      : { ok: false, error: "You do not have invoice-sharing permission." };
  }

  if (resource.type === "project") {
    if (
      hasPermission(permissions, "finance_projects") ||
      hasPermission(permissions, "finance_projects.view") ||
      hasPermission(permissions, "projects")
    ) {
      return { ok: true };
    }
    return (await teamMemberHasProjectAccess(viewer.session.id, resource.id))
      ? { ok: true }
      : { ok: false, error: "You do not have access to share this project." };
  }

  if (resource.type === "project_file" || resource.type === "document") {
    const doc = await glashMaybeOne<{ project_id: string | null }>(
      `select project_id
       from public.project_documents
       where id = $1::uuid
       limit 1`,
      [resource.id],
    );
    if (!doc?.project_id) {
      return hasPermission(permissions, "projects") ? { ok: true } : { ok: false, error: "Document access could not be verified." };
    }
    return (await teamMemberHasProjectAccess(viewer.session.id, doc.project_id)) || hasPermission(permissions, "projects")
      ? { ok: true }
      : { ok: false, error: "You do not have access to share this document." };
  }

  return { ok: true };
}
