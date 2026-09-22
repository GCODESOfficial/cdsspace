import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { glashMaybeOne } from "@/lib/glashdb/postgres";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(){const session=await getAdminSession();if(!session||(session.role!=="super_admin"&&!hasPermission(session.permissions||[],"dashboard")))return NextResponse.json({ok:false,error:"Unauthorized"},{status:401});const metrics=await glashMaybeOne<{client_signups:number;clients_live:number;checked_in_today:number;platform_calls:number;calls_today:number}>(`select (select count(*)::int from public.profiles where email_verified_at is not null and account_status='active' and coalesce(lower(trim(email)),'')<>'ceo@cdsspace.pro') as client_signups,(select count(*)::int from public.client_presence where last_seen_at >= now()-interval '5 minutes') as clients_live,(select count(*)::int from public.client_presence where last_seen_at >= date_trunc('day',now())) as checked_in_today,(select count(*)::int from public.team_meetings) as platform_calls,(select count(*)::int from public.team_meetings where created_at >= date_trunc('day',now())) as calls_today`);return NextResponse.json({ok:true,metrics:metrics||{client_signups:0,clients_live:0,checked_in_today:0,platform_calls:0,calls_today:0}});}
