import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * Exchange a raw invite token for the sub-admin's credentials, exactly once.
 *
 * The login page calls this on mount if the URL carries `?invite=TOKEN`. The
 * token is hashed, matched against `sub_admin_invites`, checked for not
 * used / not expired, then the sub-admin's email and (plaintext) password
 * are returned so the form can pre-fill.
 *
 * The server immediately marks the invite `used_at=now()` before returning,
 * so even a replayed request cannot fetch the credentials a second time.
 */
export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => null);
    const token = typeof body?.token === "string" ? body.token.trim() : "";

    if (!token || token.length < 32) {
        return NextResponse.json({ error: "Invalid invite token" }, { status: 400 });
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = getSupabaseAdmin();

    const { data: invite, error: inviteError } = await sb
        .from("sub_admin_invites")
        .select("id, sub_admin_id, used_at, expires_at")
        .eq("token_hash", tokenHash)
        .maybeSingle();

    if (inviteError || !invite) {
        return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    if (invite.used_at) {
        return NextResponse.json({ error: "Invite has already been used" }, { status: 410 });
    }

    if (new Date(invite.expires_at).getTime() < Date.now()) {
        return NextResponse.json({ error: "Invite has expired" }, { status: 410 });
    }

    // Mark used BEFORE returning credentials. If the update fails, bail out
    // so we don't hand out credentials with an unused token still in the DB.
    const { error: updateError } = await sb
        .from("sub_admin_invites")
        .update({ used_at: new Date().toISOString() })
        .eq("id", invite.id)
        .is("used_at", null);

    if (updateError) {
        return NextResponse.json({ error: "Failed to redeem invite" }, { status: 500 });
    }

    const { data: subAdmin, error: subAdminError } = await sb
        .from("sub_admins")
        .select("email, password, is_active")
        .eq("id", invite.sub_admin_id)
        .maybeSingle();

    if (subAdminError || !subAdmin) {
        return NextResponse.json({ error: "Sub-admin not found" }, { status: 404 });
    }

    if (!subAdmin.is_active) {
        return NextResponse.json({ error: "Account is inactive" }, { status: 403 });
    }

    return NextResponse.json({
        email: subAdmin.email,
        password: subAdmin.password,
    });
}
