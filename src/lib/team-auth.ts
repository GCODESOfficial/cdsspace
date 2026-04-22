/* eslint-disable @typescript-eslint/no-explicit-any */
import { cookies } from "next/headers";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase";

export const TEAM_SESSION_COOKIE = "team_session";
const SESSION_DAYS = 30;

export function hashPassword(password: string, salt: string): string {
  return crypto.createHash("sha256").update(password + ":" + salt).digest("hex");
}

export function generateSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function generateInviteToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export interface TeamSession {
  id: string;
  full_name: string;
  email: string;
  username: string;
  avatar_url: string | null;
  role_title: string | null;
  department: string | null;
  is_sub_admin: boolean;
  permissions: string[];
  language: string | null;
}

/** Server-only: read the currently logged-in team member from the session cookie. */
export async function getTeamSession(): Promise<TeamSession | null> {
  const store = await cookies();
  const token = store.get(TEAM_SESSION_COOKIE)?.value;
  if (!token || !supabaseAdmin) return null;

  const db = supabaseAdmin as any;
  const { data, error } = await db
    .from("team_members")
    .select(
      "id, full_name, email, username, avatar_url, role_title, department, is_sub_admin, permissions, language, session_expires_at, is_active"
    )
    .eq("session_token", token)
    .maybeSingle();

  if (error || !data || !data.is_active) return null;
  if (data.session_expires_at && new Date(data.session_expires_at) < new Date()) return null;

  return {
    id: data.id,
    full_name: data.full_name,
    email: data.email,
    username: data.username,
    avatar_url: data.avatar_url,
    role_title: data.role_title,
    department: data.department,
    is_sub_admin: !!data.is_sub_admin,
    permissions: data.permissions || [],
    language: data.language ?? "en",
  };
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
  };
}
