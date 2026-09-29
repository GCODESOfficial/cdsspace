import "server-only";

import { createHash } from "crypto";
import { getAdminSession } from "@/lib/admin-session";
import { getClientAccountState } from "@/lib/client-account";
import { clientDashboardPath } from "@/lib/client-routes";
import { getTeamSession } from "@/lib/team-auth";
import type { CreateRole } from "@/lib/create-platform/catalog";
import { hasPermission } from "@/lib/admin-permissions";

export interface CreateActor {
  kind: CreateRole;
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  organization: string;
  dashboardHref: string;
  /** Label for the "return to your dashboard" button, per role. */
  dashboardLabel: string;
  /** Stable, non-secret reference shown to the user; never used as authority. */
  workspaceReference: string;
  permissionLevel: string;
  setupRequiredHref?: string;
  setupRequiredLabel?: string;
  /** CREATE is locked for this actor (clients, until the tools are perfected). */
  accessLocked?: boolean;
  /** Server-only admin access facts; omitted by publicCreateActor. */
  adminPermissions?: string[];
  isSuperAdmin?: boolean;
}

export type PublicCreateActor = Omit<CreateActor, "id" | "adminPermissions" | "isSuperAdmin">;

/** Never serialize the internal database owner ID to the browser. */
export function publicCreateActor(actor: CreateActor): PublicCreateActor {
  const {
    id: internalOwnerId,
    adminPermissions: internalAdminPermissions,
    isSuperAdmin: internalSuperAdmin,
    ...safeActor
  } = actor;
  void internalOwnerId;
  void internalAdminPermissions;
  void internalSuperAdmin;
  return safeActor;
}

export function createActorHasAdminPermission(actor: CreateActor, permission: string) {
  return actor.kind === "admin"
    && (actor.isSuperAdmin === true || hasPermission(actor.adminPermissions || [], permission));
}

export function createActorCanUseLetterheadScope(
  actor: CreateActor,
  scope: string,
  access: "view" | "manage",
) {
  if (scope !== "executive_board") return true;
  return createActorHasAdminPermission(
    actor,
    access === "manage" ? "executive_board.letterhead_manage" : "executive_board.letterhead_view",
  );
}

/** Create is client-facing by default; an emergency deployment flag can explicitly disable it. */
export function createClientsAllowed(): boolean {
  return process.env.CREATE_CLIENT_ACCESS !== "false";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function privateWorkspaceReference(kind: CreateRole, id: string): string {
  return createHash("sha256")
    .update(`create-workspace:v1:${kind}:${id}`)
    .digest("hex")
    .slice(0, 8)
    .toUpperCase();
}

export function parseCreateWorkspaceKind(value: unknown): CreateRole | null {
  return value === "client" || value === "team" || value === "admin" ? value : null;
}

async function getAdminCreateActor(): Promise<CreateActor | null> {
  const admin = await getAdminSession();
  if (admin) {
    return {
      kind: "admin",
      id: admin.memberId || admin.email,
      email: admin.email,
      name: admin.name || "CDS Space Admin",
      avatarUrl: null,
      organization: admin.department || admin.adminRoleName || "CDS Space",
      dashboardHref: "/admin",
      dashboardLabel: "Admin Dashboard",
      workspaceReference: privateWorkspaceReference("admin", admin.memberId || admin.email),
      permissionLevel: admin.role === "super_admin" ? "Super admin" : "Sub-admin",
      adminPermissions: admin.permissions,
      isSuperAdmin: admin.role === "super_admin",
    };
  }
  return null;
}

async function getTeamCreateActor(): Promise<CreateActor | null> {
  const team = await getTeamSession();
  if (team && UUID.test(team.id)) {
    return {
      kind: "team",
      id: team.id,
      email: team.email,
      name: team.full_name || team.username || "Team member",
      avatarUrl: team.avatar_url || null,
      organization: team.department || team.role_title || "CDS Space team",
      dashboardHref: "/team",
      dashboardLabel: "Team Dashboard",
      workspaceReference: privateWorkspaceReference("team", team.id),
      permissionLevel: team.is_sub_admin ? "Team member with admin access" : "Team member",
    };
  }
  return null;
}

async function getClientCreateActor(): Promise<CreateActor | null> {
  try {
    const client = await getClientAccountState();
    if (!client) return null;
    // CREATE ownership always comes from the durable, server-verified client
    // profile. Never accept a workspace/user ID from the URL or browser body.
    if (!UUID.test(client.profile.id) || client.user.id !== client.profile.id) return null;
    const createHref = "/create?workspace=client";
    const setupRequiredHref = !client.agreement
      ? `/agreement?next=${encodeURIComponent(createHref)}`
      : !client.profile.billing_currency
        ? `/onboarding?next=${encodeURIComponent(createHref)}`
        : undefined;
    return {
      kind: "client",
      id: client.profile.id,
      email: client.user.email || client.profile.email,
      name: client.profile.full_name || client.user.user_metadata?.full_name || client.profile.email,
      avatarUrl: client.profile.avatar_url || (client.user.user_metadata?.avatar_url as string | undefined) || null,
      organization: client.profile.company_name || "Client account",
      dashboardHref: clientDashboardPath(client.profile.public_user_id, "/dashboard"),
      dashboardLabel: "User Dashboard",
      workspaceReference: client.profile.public_user_id || privateWorkspaceReference("client", client.profile.id),
      permissionLevel: "Client",
      accessLocked: !createClientsAllowed(),
      setupRequiredHref,
      setupRequiredLabel: !client.agreement
        ? "Complete agreement"
        : !client.profile.billing_currency
          ? "Finish onboarding"
          : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve the authenticated identity for one isolated CREATE workspace.
 *
 * The requested role is only a selector; the owner ID always comes from its
 * verified first-party session. It is never accepted from the URL or body.
 * When no role is specified, prefer the client identity so a browser that has
 * multiple portal cookies cannot accidentally expose an admin workspace at
 * the public `/create` entry point.
 */
export async function getCreateActor(preferredKind?: CreateRole | null): Promise<CreateActor | null> {
  if (preferredKind === "client") return getClientCreateActor();
  if (preferredKind === "team") return getTeamCreateActor();
  if (preferredKind === "admin") return getAdminCreateActor();

  return (
    (await getClientCreateActor()) ||
    (await getTeamCreateActor()) ||
    (await getAdminCreateActor())
  );
}

export async function getCreateActorFromRequest(request: Request): Promise<CreateActor | null> {
  const workspace = parseCreateWorkspaceKind(new URL(request.url).searchParams.get("workspace"));
  return getCreateActor(workspace);
}
