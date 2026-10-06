import { getAdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { getClientAccountState } from "@/lib/client-account";
import { glashQuery } from "@/lib/glashdb/postgres";
import { mobileJson, readMobileBody } from "@/lib/mobile-api";
import { getTeamSession } from "@/lib/team-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Portal = "client" | "team" | "admin";

/**
 * The phone registers how to ring it for incoming cMeet calls while the app is
 * closed (lib/mobile-call-push.ts). Called by each signed-in portal with its own
 * Bearer token; `portal` names which one, and that portal's session must check out.
 *
 *   POST   { portal, platform: 'android' | 'ios', tokenKind: 'expo' | 'voip', token, appVersion? }
 *   DELETE { portal, token }   on sign-out
 */
async function subjectFor(portal: Portal) {
  if (portal === "admin") {
    const session = await getAdminSession();
    if (!session) return null;
    return {
      subject: `admin:${session.memberId || session.email}`,
      takesClientCalls: session.role === "super_admin" || hasPermission(session.permissions || [], "messages"),
    };
  }
  if (portal === "team") {
    const session = await getTeamSession();
    return session ? { subject: `team:${session.id}`, takesClientCalls: false } : null;
  }
  const account = await getClientAccountState().catch(() => null);
  return account?.user?.id ? { subject: `client:${account.user.id}`, takesClientCalls: false } : null;
}

const portalOf = (value: unknown): Portal | null => (value === "client" || value === "team" || value === "admin" ? value : null);

export async function POST(request: Request) {
  const body = await readMobileBody(request);
  const portal = portalOf(body.portal);
  const platform = body.platform === "android" || body.platform === "ios" ? body.platform : null;
  const tokenKind = body.tokenKind === "expo" || body.tokenKind === "voip" ? body.tokenKind : null;
  const token = typeof body.token === "string" ? body.token.trim().slice(0, 400) : "";
  if (!portal || !platform || !tokenKind || !token) return mobileJson({ error: "Portal, platform and token are required." }, 400);

  const who = await subjectFor(portal);
  if (!who) return mobileJson({ error: "Unauthorized" }, 401);

  await glashQuery(
    `insert into public.mobile_push_devices (subject_key, portal, platform, token_kind, token, takes_client_calls, app_version)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (token, portal) do update
        set subject_key = excluded.subject_key, platform = excluded.platform, token_kind = excluded.token_kind,
            takes_client_calls = excluded.takes_client_calls, app_version = excluded.app_version, updated_at = now()`,
    [who.subject, portal, platform, tokenKind, token, who.takesClientCalls, typeof body.appVersion === "string" ? body.appVersion.slice(0, 40) : null],
  );
  return mobileJson({ ok: true });
}

export async function DELETE(request: Request) {
  const body = await readMobileBody(request);
  const portal = portalOf(body.portal);
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!portal || !token) return mobileJson({ error: "Portal and token are required." }, 400);
  // The token itself is the proof: a signed-out phone may no longer have a session.
  await glashQuery(`delete from public.mobile_push_devices where token = $1 and portal = $2`, [token, portal]);
  return mobileJson({ ok: true });
}
