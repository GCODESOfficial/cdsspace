import { NextResponse } from "next/server";
import { getClientAccountState } from "@/lib/client-account";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { notifySuperAdmin } from "@/lib/notify-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const account = await getClientAccountState();
  if (!account?.agreement) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const existing = await glashMaybeOne<{ id: string }>(
    `select id from public.client_storage_requests
      where client_user_id = $1::uuid and status = 'pending'
      limit 1`,
    [account.user.id],
  );
  if (existing) return NextResponse.json({ ok: true, alreadyPending: true });

  await glashMaybeOne(
    `insert into public.client_storage_requests (client_user_id)
     values ($1::uuid)
     on conflict (client_user_id) where status = 'pending' do nothing
     returning id`,
    [account.user.id],
  );
  const name = account.profile.full_name || account.profile.company_name || account.profile.email || "A client";
  await notifySuperAdmin({
    type: "status_change",
    title: "Client requested more storage",
    message: `${name} has reached their workspace storage allowance and requested more space.`,
    link: "/admin/clients/list?storage=requests",
  });
  return NextResponse.json({ ok: true, alreadyPending: false }, { status: 201 });
}
