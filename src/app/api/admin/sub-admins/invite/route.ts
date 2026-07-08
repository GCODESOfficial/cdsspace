import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { emailFrom, createEmailTransport, EMAIL_MODE } from "@/lib/email-from";
import { brandedEmailHtml } from "@/lib/email-template";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAdminSession } from "@/app/api/admin-check/route";

export const runtime = "nodejs";

const INVITE_TTL_DAYS = 7;

function hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
}

function siteUrl() {
    const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
    if (fromEnv) return fromEnv.replace(/\/$/, "");
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return "http://localhost:3000";
}

/**
 * Create a one-time invite link for a newly-created sub-admin. The raw token
 * lives only in the emailed / copied link; the database stores just its
 * SHA-256 hash. When the sub-admin clicks the link, the login page calls
 * /api/admin-invite/redeem to trade the token for their credentials exactly
 * once, then the token is marked used.
 *
 * Only the super admin can create invites.
 */
export async function POST(req: NextRequest) {
    const session = getAdminSession(req);
    if (!session || session.role !== "super_admin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const subAdminId = typeof body?.sub_admin_id === "string" ? body.sub_admin_id : null;
    const shouldEmail = body?.send_email !== false; // default true

    if (!subAdminId) {
        return NextResponse.json({ error: "sub_admin_id is required" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = getSupabaseAdmin();

    const { data: subAdmin, error: fetchError } = await sb
        .from("sub_admins")
        .select("id, name, email")
        .eq("id", subAdminId)
        .maybeSingle();

    if (fetchError || !subAdmin) {
        return NextResponse.json({ error: "Sub-admin not found" }, { status: 404 });
    }

    const rawToken = randomBytes(32).toString("hex"); // 64 hex chars
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    // Invalidate any earlier unused invites for this sub-admin - only the
    // latest link should work. Keep the history by just marking them used.
    await sb
        .from("sub_admin_invites")
        .update({ used_at: new Date().toISOString() })
        .eq("sub_admin_id", subAdminId)
        .is("used_at", null);

    const { error: insertError } = await sb.from("sub_admin_invites").insert({
        sub_admin_id: subAdminId,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
    });

    if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const inviteUrl = `${siteUrl()}/admin/login?invite=${rawToken}`;

    let emailSent = false;
    let emailError: string | undefined;

    // Attempt when an HTTPS transport is active (Gmail API / Resend), or when
    // SMTP creds are present. createEmailTransport() picks the right one.
    if (shouldEmail && (EMAIL_MODE !== "smtp" || (process.env.EMAIL_USER && process.env.EMAIL_PASS))) {
        try {
            const transporter = createEmailTransport();

            await transporter.sendMail({
                from: emailFrom("CDS Space Admin"),
                to: subAdmin.email,
                subject: "You've been added as a CDS Space admin",
                html: buildInviteHtml({
                    name: subAdmin.name,
                    email: subAdmin.email,
                    inviteUrl,
                    ttlDays: INVITE_TTL_DAYS,
                }),
                text: buildInviteText({
                    name: subAdmin.name,
                    inviteUrl,
                    ttlDays: INVITE_TTL_DAYS,
                }),
            });
            emailSent = true;
        } catch (e) {
            emailError = e instanceof Error ? e.message : "Unknown email error";
            // Non-fatal - the super admin can still copy the link from the UI.
        }
    }

    return NextResponse.json({
        invite_url: inviteUrl,
        expires_at: expiresAt.toISOString(),
        email_sent: emailSent,
        email_error: emailError,
    });
}

function buildInviteHtml(opts: { name: string; email: string; inviteUrl: string; ttlDays: number }) {
    return brandedEmailHtml(
        `
        <h2 style="color:#0D1B39;margin:0 0 12px;">Welcome to CDS Space admin, ${escapeHtml(opts.name)}.</h2>
        <p style="line-height:1.6;">
            You've been added as a sub-admin for <strong>cdsspace.pro</strong>.
            Click the button below to sign in - your email and password will be filled in for you automatically.
        </p>
        <p style="text-align:center;margin:28px 0;">
            <a href="${opts.inviteUrl}"
               style="background:linear-gradient(146deg,#0035C1,#0575FF);color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600;display:inline-block;">
                Open my admin dashboard
            </a>
        </p>
        <p style="font-size:13px;color:#6b7280;line-height:1.6;">
            This link is single-use and expires in ${opts.ttlDays} days. For your security, please sign in from a trusted device and change your password afterwards.
        </p>
        <p style="font-size:13px;color:#6b7280;">If you didn't expect this email, you can ignore it.</p>
      `,
        { eyebrow: "Admin Invitation", preheader: "You've been added as a CDS Space admin." },
    );
}

function buildInviteText(opts: { name: string; inviteUrl: string; ttlDays: number }) {
    return [
        `Welcome to CDS Space admin, ${opts.name}.`,
        "",
        "You've been added as a sub-admin. Open this link to sign in - your credentials will be filled in automatically:",
        opts.inviteUrl,
        "",
        `The link is single-use and expires in ${opts.ttlDays} days.`,
        "For your security, sign in from a trusted device and change your password afterwards.",
        "",
        "- CDS Space",
    ].join("\n");
}

function escapeHtml(s: string) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
