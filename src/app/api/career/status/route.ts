/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
    }

    const { tracking_code, email } = (await req.json()) ?? {};

    if (!tracking_code?.trim() || !email?.trim()) {
      return NextResponse.json(
        { ok: false, error: "Tracking code and email are required" },
        { status: 400 }
      );
    }

    const code = String(tracking_code).trim().toUpperCase();
    const mail = String(email).trim().toLowerCase();

    const db = supabaseAdmin as any;

    const { data, error } = await db
      .from("role_applications")
      .select(
        "id, full_name, status, admin_note, created_at, status_updated_at, role_id, tracking_code, email"
      )
      .eq("tracking_code", code)
      .single();

    // Compare email server-side to avoid leaking whether the code exists
    if (error || !data || String(data.email).toLowerCase() !== mail) {
      return NextResponse.json(
        { ok: false, error: "No application matches that tracking code and email" },
        { status: 404 }
      );
    }

    let role: { title: string; role_type: string; location: string | null } | null = null;
    if (data.role_id) {
      const { data: r } = await db
        .from("open_roles")
        .select("title, role_type, location")
        .eq("id", data.role_id)
        .single();
      role = r ?? null;
    }

    return NextResponse.json({
      ok: true,
      application: {
        tracking_code: data.tracking_code,
        full_name: data.full_name,
        status: data.status,
        admin_note: data.admin_note,
        created_at: data.created_at,
        status_updated_at: data.status_updated_at,
        role,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || "Something went wrong" }, { status: 500 });
  }
}
