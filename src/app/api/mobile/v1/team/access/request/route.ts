import { after } from "next/server";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { mobileJson, readMobileBody } from "@/lib/mobile-api";
import { clientRequestContext, consumeSecurityRateLimit, maskClientEmail } from "@/lib/client-login-security";
import { isBlockedEmail } from "@/lib/security/email-blocklist";
import { brandedEmailHtml } from "@/lib/email-template";
import { sendEmail } from "@/lib/email-from";
import { generateTeamEmailOtp, isValidTeamEmail, normalizeTeamEmail } from "@/lib/team-email-verification";
import {
  TEAM_ACCESS_CODE_TTL_SECONDS,
  TEAM_ACCESS_RESEND_SECONDS,
  createTeamAccessChallenge,
} from "@/lib/team-mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Step 1 of the app's team access check: email a one-time code to an active
// team member. The answer is the same whether or not the address belongs to
// one, so the endpoint cannot be used to discover who works at CDS Space.
export async function POST(request: Request) {
  const body = await readMobileBody(request);
  const email = normalizeTeamEmail(body.email);
  if (!isValidTeamEmail(email)) {
    return mobileJson({ error: "Enter your CDS Space team email address" }, 400);
  }

  const context = await clientRequestContext();
  const [networkBlocked, emailBlocked] = await Promise.all([
    consumeSecurityRateLimit({ bucket: "team-access-network", identifier: context.ipHash, limit: 20, windowSeconds: 15 * 60, blockSeconds: 15 * 60 }),
    consumeSecurityRateLimit({ bucket: "team-access-email", identifier: email, limit: 5, windowSeconds: 60 * 60, blockSeconds: 60 * 60 }),
  ]);
  if (networkBlocked || emailBlocked) {
    return mobileJson({ error: "Too many code requests. Wait a while and try again." }, 429);
  }

  const member = isBlockedEmail(email)
    ? null
    : await glashMaybeOne<{ id: string; full_name: string | null }>(
        "select id, full_name from public.team_members where lower(email) = $1 and is_active = true limit 1",
        [email],
      );

  const code = generateTeamEmailOtp();
  const challengeId = createTeamAccessChallenge(member?.id || null, code);

  if (member) {
    after(() =>
      sendTeamAccessCode(email, member.full_name || "", code).catch((error: unknown) => {
        console.error("[team-access] code email failed:", error instanceof Error ? error.message : error);
      }),
    );
  }

  return mobileJson({
    challengeId,
    maskedEmail: maskClientEmail(email),
    expiresInSeconds: TEAM_ACCESS_CODE_TTL_SECONDS,
    resendInSeconds: TEAM_ACCESS_RESEND_SECONDS,
  });
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function sendTeamAccessCode(email: string, name: string, code: string) {
  const firstName = name.trim().split(/\s+/)[0] || "team member";
  const minutes = Math.round(TEAM_ACCESS_CODE_TTL_SECONDS / 60);
  const html = brandedEmailHtml(
    `<h1 style="margin:0 0 14px;color:#0D1B39;font-size:24px;line-height:1.25;">Your team portal access code</h1>
     <p style="margin:0 0 16px;">Hello ${escapeHtml(firstName)},</p>
     <p style="margin:0 0 18px;">Enter this code in the CDS Space app to open the team sign-in.</p>
     <div style="margin:0 0 18px;border:1px solid #DDE5F4;border-radius:12px;background:#F8FAFD;padding:18px;text-align:center;">
       <div style="font-size:12px;color:#69738D;">Your access code</div>
       <div style="margin-top:8px;color:#0D1B39;font-family:Arial,Helvetica,sans-serif;font-size:30px;font-weight:800;letter-spacing:6px;">${escapeHtml(code)}</div>
     </div>
     <p style="margin:0 0 12px;"><strong>This code expires in ${minutes} minutes.</strong></p>
     <p style="margin:0;color:#69738D;font-size:13px;line-height:1.6;">If you did not request this code, someone may be trying to reach your team account. Never share the code with anyone.</p>`,
    { eyebrow: "Team account security", preheader: `Your CDS Space team access code expires in ${minutes} minutes.` },
  );
  await sendEmail({
    to: email,
    subject: "Your CDS Space team access code",
    text: `Your CDS Space team access code is ${code}. It expires in ${minutes} minutes.`,
    html,
    fromName: "CDS Space Team",
  });
}
