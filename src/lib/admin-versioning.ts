/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAdminSession } from "@/lib/admin-session";
import { supabaseAdmin } from "@/lib/supabase";
import { getTeamSession } from "@/lib/team-auth";

export interface RecordResourceVersionInput {
  page: string;
  resource_type: string;
  resource_id: string;
  resource_label?: string | null;
  action: string;
  before_data: Record<string, any>;
  after_data?: Record<string, any> | null;
  metadata?: Record<string, any>;
}

export interface ResourceVersion {
  id: string;
  page: string;
  resource_type: string;
  resource_id: string;
  resource_label: string | null;
  action: string;
  actor_kind: "admin" | "team" | "system";
  actor_id: string | null;
  actor_name: string;
  actor_is_admin: boolean;
  before_data: Record<string, any>;
  after_data: Record<string, any> | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

async function resolveActor() {
  const admin = await getAdminSession();
  const team = admin ? null : await getTeamSession();

  if (admin) {
    return {
      actor_kind: "admin" as const,
      actor_id: admin.memberId || admin.email,
      actor_name: admin.name || admin.email,
      actor_is_admin: true,
      actor_source: admin.source ?? "admin_cookie",
    };
  }

  if (team) {
    return {
      actor_kind: "team" as const,
      actor_id: team.id,
      actor_name: team.full_name || team.email,
      actor_is_admin: false,
      actor_source: "team_cookie",
    };
  }

  return {
    actor_kind: "system" as const,
    actor_id: null,
    actor_name: "System",
    actor_is_admin: false,
    actor_source: "system",
  };
}

export async function recordResourceVersion(input: RecordResourceVersionInput): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    const actor = await resolveActor();
    await (supabaseAdmin as any).from("admin_resource_versions").insert({
      page: input.page,
      resource_type: input.resource_type,
      resource_id: input.resource_id,
      resource_label: input.resource_label ?? null,
      action: input.action,
      actor_kind: actor.actor_kind,
      actor_id: actor.actor_id,
      actor_name: actor.actor_name,
      actor_is_admin: actor.actor_is_admin,
      before_data: input.before_data,
      after_data: input.after_data ?? null,
      metadata: { ...(input.metadata ?? {}), actor_source: actor.actor_source },
    });
  } catch (err) {
    console.error("[admin-versioning] insert failed:", err);
  }
}

export async function listResourceVersions(
  resourceType: string,
  resourceId: string,
  limit = 30,
): Promise<{ versions: ResourceVersion[]; error?: string }> {
  if (!supabaseAdmin) return { versions: [], error: "Admin database is not configured." };

  const { data, error } = await (supabaseAdmin as any)
    .from("admin_resource_versions")
    .select("*")
    .eq("resource_type", resourceType)
    .eq("resource_id", resourceId)
    .order("created_at", { ascending: false })
    .limit(Math.min(100, Math.max(1, limit)));

  if (error) return { versions: [], error: error.message };
  return { versions: data ?? [] };
}
