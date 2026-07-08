import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { glashQuery } from "@/lib/glashdb/postgres";
import { SCREENING_COOKIE } from "@/lib/screening-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const store = await cookies();
  const token = store.get(SCREENING_COOKIE)?.value;
  if (token) {
    await glashQuery(
      `update public.screening_candidates
          set session_token = null, session_expires_at = null
        where session_token = $1`,
      [token],
    ).catch(() => {});
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SCREENING_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
