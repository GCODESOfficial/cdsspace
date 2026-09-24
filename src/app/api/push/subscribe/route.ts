import { NextRequest, NextResponse } from "next/server";
import { getTeamSession } from "@/lib/team-auth";
import { verifyAdmin, verifyUser } from "@/lib/admin-auth";
import { glashQuery } from "@/lib/glashdb/postgres";
import { pushPublicKey, type PushActorKind } from "@/lib/web-push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Registers the browser for notifications that arrive while the site is closed.
 *
 * The subscription is the browser's own delivery address. It is stored against
 * whoever is signed in on this device, so a shared computer cannot leak one
 * person's notices to the next person who signs in: the endpoint row is
 * replaced, never duplicated.
 */
async function currentActor(): Promise<{ kind: PushActorKind; id: string } | null> {
  const team = await getTeamSession();
  if (team) return { kind: "team", id: team.id };
  const client = await verifyUser();
  if (client) return { kind: "client", id: client.user.id };
  const admin = await verifyAdmin();
  if (admin) return { kind: "admin", id: String(admin.id) };
  return null;
}

export async function GET() {
  const key = pushPublicKey();
  if (!key) return NextResponse.json({ error: "Push is not configured." }, { status: 503 });
  return NextResponse.json({ publicKey: key });
}

export async function POST(request: NextRequest) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const subscription = (body.subscription || {}) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  const endpoint = String(subscription.endpoint || "");
  const p256dh = String(subscription.keys?.p256dh || "");
  const auth = String(subscription.keys?.auth || "");
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth) {
    return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  }

  await glashQuery(
    `insert into public.push_subscriptions (actor_kind, actor_id, endpoint, p256dh, auth, user_agent)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (endpoint) do update set
       actor_kind = excluded.actor_kind,
       actor_id = excluded.actor_id,
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       user_agent = excluded.user_agent,
       failure_count = 0,
       last_seen_at = now()`,
    [actor.kind, actor.id, endpoint, p256dh, auth, request.headers.get("user-agent")?.slice(0, 400) || null],
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { endpoint?: string };
  const endpoint = String(body.endpoint || "");
  if (endpoint) await glashQuery(`delete from public.push_subscriptions where endpoint = $1`, [endpoint]);
  return NextResponse.json({ ok: true });
}
