import "server-only";

import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { brandedEmailHtml } from "@/lib/email-template";
import { sendEmail } from "@/lib/email-from";

export const TEAM_EMAIL_OTP_TTL_MINUTES = 15;
export const TEAM_EMAIL_OTP_RESEND_SECONDS = 60;
export const TEAM_EMAIL_OTP_MAX_ATTEMPTS = 5;
export const TEAM_EMAIL_OTP_MAX_SENDS_PER_HOUR = 5;

const OTP_SECRET = process.env.TEAM_EMAIL_OTP_SECRET
  || process.env.ADMIN_SESSION_SECRET
  || process.env.GLASHDB_SERVICE_ROLE_KEY
  || "";

export function normalizeTeamEmail(value: unknown) {
  return String(value || "").trim().toLowerCase().slice(0, 320);
}

export function isValidTeamEmail(email: string) {
  return email.length >= 3
    && email.length <= 320
    && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email);
}

export function generateTeamEmailOtp() {
  return String(randomInt(100000, 1000000));
}

export function hashTeamEmailOtp(memberId: string, email: string, otp: string) {
  if (!OTP_SECRET) throw new Error("Team email verification is not configured.");
  return createHmac("sha256", OTP_SECRET)
    .update(`${memberId}:${normalizeTeamEmail(email)}:${otp}`)
    .digest("hex");
}

export function teamEmailOtpMatches(expectedHash: string, memberId: string, email: string, otp: string) {
  try {
    const expected = Buffer.from(expectedHash, "hex");
    const received = Buffer.from(hashTeamEmailOtp(memberId, email, otp), "hex");
    return expected.length === received.length && timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function sendTeamEmailOtp(input: {
  email: string;
  memberName: string;
  otp: string;
}) {
  const firstName = input.memberName.trim().split(/\s+/)[0] || "team member";
  const html = brandedEmailHtml(
    `<h1 style="margin:0 0 14px;color:#0D1B39;font-size:24px;line-height:1.25;">Verify your email address</h1>
     <p style="margin:0 0 16px;">Hello ${escapeHtml(firstName)},</p>
     <p style="margin:0 0 18px;">Enter the verification code below in your CDS Space team profile.</p>
     <div style="margin:0 0 18px;border:1px solid #DDE5F4;border-radius:12px;background:#F8FAFD;padding:18px;text-align:center;">
       <div style="font-size:12px;color:#69738D;">Your verification code</div>
       <div style="margin-top:8px;color:#0D1B39;font-family:Arial,Helvetica,sans-serif;font-size:30px;font-weight:800;letter-spacing:6px;">${escapeHtml(input.otp)}</div>
     </div>
     <p style="margin:0 0 12px;"><strong>This code expires in ${TEAM_EMAIL_OTP_TTL_MINUTES} minutes.</strong></p>
     <p style="margin:0;color:#69738D;font-size:13px;line-height:1.6;">If you did not request this code, you can safely ignore this email. Never share the code with anyone.</p>`,
    {
      eyebrow: "Team account security",
      preheader: "Your CDS Space email verification code expires in 15 minutes.",
    },
  );

  await sendEmail({
    to: input.email,
    subject: "Verify your CDS Space team email",
    text: `Your CDS Space email verification code is ${input.otp}. It expires in ${TEAM_EMAIL_OTP_TTL_MINUTES} minutes.`,
    html,
    fromName: "CDS Space Team",
  });
}
