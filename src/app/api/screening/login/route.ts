import { NextResponse } from "next/server";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import {
  SCREENING_COOKIE,
  ensureCandidateForApplication,
  generateSessionToken,
  screeningCookieOptions,
  sessionExpiresAt,
} from "@/lib/screening-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Screening portal login.
 * Body: { email, tracking_code }
 * Succeeds only when the email + tracking code match a SHORTLISTED application.
 */
export async function POST(req: Request) {
  try {
    const { email, tracking_code } = (await req.json().catch(() => ({}))) ?? {};
    const mail = String(email ?? "").trim().toLowerCase();
    const code = String(tracking_code ?? "").trim().toUpperCase();

    if (!mail || !code) {
      return NextResponse.json(
        { ok: false, error: "Email and tracking code are required." },
        { status: 400 },
      );
    }

    // Look up by tracking code first (unique), then verify email + status
    // server-side so we never reveal which half was wrong.
    const app = await glashMaybeOne<{
      id: string;
      email: string;
      status: string;
    }>(
      `select id, lower(email) as email, status
         from public.role_applications
        where upper(tracking_code) = $1
        limit 1`,
      [code],
    );

    const matches = !!app && app.email === mail;
    if (!matches) {
      return NextResponse.json(
        { ok: false, error: "No shortlisted application matches that email and tracking code." },
        { status: 404 },
      );
    }

    if (app!.status !== "shortlisted") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Your application has not been shortlisted for screening yet. You'll be notified by email once it is.",
        },
        { status: 403 },
      );
    }

    const candidateId = await ensureCandidateForApplication(app!.id);
    if (!candidateId) {
      return NextResponse.json({ ok: false, error: "Could not open your screening session." }, { status: 500 });
    }

    const token = generateSessionToken();
    const expires = sessionExpiresAt();
    await glashQuery(
      `update public.screening_candidates
          set session_token = $1, session_expires_at = $2
        where id = $3`,
      [token, expires, candidateId],
    );

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SCREENING_COOKIE, token, screeningCookieOptions());
    return res;
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Login failed" },
      { status: 500 },
    );
  }
}
