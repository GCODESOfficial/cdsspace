import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/glashdb/server";

/**
 * Finalize an OAuth sign-in once the browser has set the session cookies
 * (see /auth/callback). Runs server-side so it can: (1) read the httpOnly
 * `cds_oauth_next` destination cookie, (2) ensure a `profiles` row exists for
 * first-time Google users. Returns where the client should land. No Supabase.
 */
export async function POST() {
  const store = await cookies();
  const rawNext = store.get("cds_oauth_next")?.value;
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";
  store.delete("cds_oauth_next");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const glash = (await createClient()) as any;
  const { data: { user } } = await glash.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, next: "/login?error=auth_code_exchange_failed" }, { status: 401 });
  }

  const { data: existingProfile } = await glash
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .single();

  if (!existingProfile) {
    await glash.from("profiles").insert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || user.user_metadata?.name || "",
      avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || "",
      company_name: user.user_metadata?.company_name || "",
      phone_number: user.user_metadata?.phone_number || "",
    });
  }

  return NextResponse.json({ ok: true, next });
}
