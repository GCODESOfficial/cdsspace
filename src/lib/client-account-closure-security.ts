import "server-only";

import { randomInt, timingSafeEqual } from "node:crypto";
import { normalizeClientEmail, securityHash } from "@/lib/client-login-security";
import { brandedEmailHtml } from "@/lib/email-template";
import { sendEmail } from "@/lib/email-from";

export const ACCOUNT_CLOSURE_OTP_TTL_MINUTES = 15;
export const ACCOUNT_CLOSURE_OTP_RESEND_SECONDS = 60;
export const ACCOUNT_CLOSURE_OTP_MAX_ATTEMPTS = 5;
export const ACCOUNT_CLOSURE_OTP_MAX_SENDS_PER_HOUR = 5;

export function generateAccountClosureOtp() {
  return String(randomInt(100000, 1000000));
}

export function accountClosureOtpHash(userId: string, email: string, otp: string) {
  return securityHash("client-account-closure-otp", `${userId}:${normalizeClientEmail(email)}:${otp}`);
}

export function accountClosureOtpMatches(expectedHash: string, userId: string, email: string, otp: string) {
  try {
    const expected = Buffer.from(expectedHash, "hex");
    const received = Buffer.from(accountClosureOtpHash(userId, email, otp), "hex");
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

export async function sendAccountClosureOtp(input: { email: string; name?: string | null; otp: string }) {
  const firstName = String(input.name || "client").trim().split(/\s+/)[0] || "client";
  const html = brandedEmailHtml(
    `<h1 style="margin:0 0 14px;color:#0D1B39;font-size:24px;line-height:1.25;">Confirm account closure</h1>
     <p style="margin:0 0 16px;">Hello ${escapeHtml(firstName)},</p>
     <p style="margin:0 0 18px;">A request was made to permanently close your CDS Space business account. Enter this code in your account settings only if you made the request.</p>
     <div style="margin:0 0 18px;border:1px solid #FECACA;border-radius:12px;background:#FFF7F7;padding:18px;text-align:center;">
       <div style="font-size:12px;color:#69738D;">Account closure code</div>
       <div style="margin-top:8px;color:#991B1B;font-family:Arial,Helvetica,sans-serif;font-size:30px;font-weight:800;letter-spacing:6px;">${escapeHtml(input.otp)}</div>
     </div>
     <p style="margin:0 0 12px;"><strong>This code expires in ${ACCOUNT_CLOSURE_OTP_TTL_MINUTES} minutes.</strong></p>
     <p style="margin:0;color:#69738D;font-size:13px;line-height:1.6;">If you did not request account closure, do not share this code. Keep the account open and contact CDS Space support.</p>`,
    { eyebrow: "Account security", preheader: "Confirm your CDS Space account closure request." },
  );

  await sendEmail({
    to: input.email,
    subject: "Confirm your CDS Space account closure",
    text: `Your CDS Space account closure code is ${input.otp}. It expires in ${ACCOUNT_CLOSURE_OTP_TTL_MINUTES} minutes. If you did not request this, do not share the code.`,
    html,
    fromName: "CDS Space Security",
  });
}
