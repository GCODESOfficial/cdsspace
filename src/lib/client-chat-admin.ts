import "server-only";

import { getAdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { getGlashDbAdmin } from "@/lib/glashdb";

export type ClientChatPermission = "messages.view" | "messages.send" | "messages.delete";

export interface ClientChatAdminActor {
  id: string;
  email: string;
  name: string;
  role: "super_admin" | "sub_admin";
  permissions: string[];
  memberId?: string;
}

/**
 * Resolve either an Admin Portal cookie or a team member's bridged sub-admin
 * session, then enforce the exact Chat/Meet permission required by the route.
 */
export async function getClientChatAdminActor(permission: ClientChatPermission): Promise<ClientChatAdminActor | null> {
  const session = await getAdminSession();
  if (!session) return null;
  if (session.role !== "super_admin" && !hasPermission(session.permissions || [], permission)) return null;

  const db = getGlashDbAdmin() as any;
  const { data: ownProfile } = await db
    .from("profiles")
    .select("id")
    .eq("email", session.email)
    .maybeSingle();

  let senderId = ownProfile?.id as string | undefined;
  if (!senderId) {
    const { data: superAdminProfile } = await db
      .from("profiles")
      .select("id")
      .eq("email", "ceo@cdsspace.pro")
      .maybeSingle();
    senderId = superAdminProfile?.id as string | undefined;
  }

  return {
    id: senderId || session.email,
    email: session.email,
    name: session.name || session.email,
    role: session.role,
    permissions: session.permissions || [],
    memberId: session.memberId,
  };
}
