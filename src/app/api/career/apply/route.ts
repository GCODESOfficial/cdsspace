/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

const UNAMBIGUOUS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateTrackingCode() {
  let code = "CDS-";
  for (let i = 0; i < 6; i++) {
    code += UNAMBIGUOUS[Math.floor(Math.random() * UNAMBIGUOUS.length)];
  }
  return code;
}

export async function POST(req: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
    }

    const body = await req.json();
    const {
      role_id,
      full_name,
      email,
      phone,
      location,
      cover_letter,
      portfolio_link,
      resume_link,
      work_links,
    } = body ?? {};

    if (!full_name?.trim() || !email?.trim()) {
      return NextResponse.json({ ok: false, error: "Name and email are required" }, { status: 400 });
    }
    if (!role_id) {
      return NextResponse.json({ ok: false, error: "Role is required" }, { status: 400 });
    }

    const db = supabaseAdmin as any;

    // Verify the role exists and is active (prevent applying to disabled/removed roles)
    const { data: role } = await db
      .from("open_roles")
      .select("id, is_active")
      .eq("id", role_id)
      .single();

    if (!role || !role.is_active) {
      return NextResponse.json({ ok: false, error: "This role is no longer accepting applications" }, { status: 400 });
    }

    // Generate a unique tracking code (retry on the very unlikely collision)
    let tracking_code = generateTrackingCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: dup } = await db
        .from("role_applications")
        .select("id")
        .eq("tracking_code", tracking_code)
        .maybeSingle();
      if (!dup) break;
      tracking_code = generateTrackingCode();
    }

    const cleanWorkLinks = Array.isArray(work_links)
      ? work_links.map((l: string) => String(l).trim()).filter(Boolean)
      : null;

    const { data: inserted, error } = await db
      .from("role_applications")
      .insert({
        role_id,
        full_name: String(full_name).trim(),
        email: String(email).trim().toLowerCase(),
        phone: phone ? String(phone).trim() : null,
        location: location ? String(location).trim() : null,
        cover_letter: cover_letter ? String(cover_letter).trim() : null,
        portfolio_link: portfolio_link ? String(portfolio_link).trim() : null,
        resume_link: resume_link ? String(resume_link).trim() : null,
        work_links: cleanWorkLinks && cleanWorkLinks.length > 0 ? cleanWorkLinks : null,
        tracking_code,
      })
      .select("id, tracking_code, created_at")
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, ...inserted }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || "Something went wrong" }, { status: 500 });
  }
}
