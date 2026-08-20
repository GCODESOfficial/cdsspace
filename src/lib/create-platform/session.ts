import "server-only";

import { getAdminSession } from "@/lib/admin-session";
import { getClientAccountState } from "@/lib/client-account";
import { clientDashboardPath } from "@/lib/client-routes";
import { getTeamSession } from "@/lib/team-auth";
import type { CreateRole } from "@/lib/create-platform/catalog";

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
  permissionLevel: string;
  setupRequiredHref?: string;
  setupRequiredLabel?: string;
  /** CREATE is locked for this actor (clients, until the tools are perfected). */
  accessLocked?: boolean;
}

/** Clients cannot open CREATE until this is explicitly enabled. Team + admin always can. */
export function createClientsAllowed(): boolean {
  return process.env.CREATE_CLIENT_ACCESS === "true";
}

export async function getCreateActor(): Promise<CreateActor | null> {
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
      permissionLevel: admin.role === "super_admin" ? "Super admin" : "Sub-admin",
    };
  }

  const team = await getTeamSession();
  if (team) {
    return {
      kind: "team",
      id: team.id,
      email: team.email,
      name: team.full_name || team.username || "Team member",
      avatarUrl: team.avatar_url || null,
      organization: team.department || team.role_title || "CDS Space team",
      dashboardHref: "/team",
      dashboardLabel: "Team Dashboard",
      permissionLevel: team.is_sub_admin ? "Team member with admin access" : "Team member",
    };
  }

  try {
    const client = await getClientAccountState();
    if (!client) return null;
    const setupRequiredHref = !client.agreement
      ? `/agreement?next=${encodeURIComponent("/create")}`
      : !client.profile.billing_currency
        ? `/onboarding?next=${encodeURIComponent("/create")}`
        : undefined;
    return {
      kind: "client",
      id: client.user.id,
      email: client.user.email || client.profile.email,
      name: client.profile.full_name || client.user.user_metadata?.full_name || client.profile.email,
      avatarUrl: client.profile.avatar_url || (client.user.user_metadata?.avatar_url as string | undefined) || null,
      organization: client.profile.company_name || "Client account",
      dashboardHref: clientDashboardPath(client.profile.public_user_id, "/dashboard"),
      dashboardLabel: "CDS Dashboard",
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
