/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

type FlatFields = Record<string, string>;

function trimVal(v: unknown) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v);
}

export async function POST(req: Request) {
  try {
    const ua = req.headers.get("user-agent") ?? "";
    const fwd = req.headers.get("x-forwarded-for") ?? "";
    const ip = fwd.split(",")[0]?.trim() || null;

    const ct = req.headers.get("content-type") || "";
    const fields: FlatFields = {};
    let portfolioFile: File | null = null;

    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();

      // client sends a JSON "payload" for all text answers
      const payload = form.get("payload");
      if (typeof payload === "string" && payload) {
        const parsed = JSON.parse(payload) as Record<string, unknown>;
        for (const [k, v] of Object.entries(parsed)) fields[k] = trimVal(v) as string;
      } else {
        // fallback: convert all entries to strings
        for (const [k, v] of form.entries()) {
          if (v instanceof File) continue;
          fields[k] = trimVal(v) as string;
        }
      }

      const f = form.get("portfolio_file");
      if (f instanceof File && f.size > 0) portfolioFile = f;
    } else if (ct.includes("application/json")) {
      const json = await req.json();
      for (const [k, v] of Object.entries(json ?? {})) fields[k] = trimVal(v) as string;
    } else {
      const form = await req.formData();
      for (const [k, v] of form.entries()) {
        if (v instanceof File) continue;
        fields[k] = trimVal(v) as string;
      }
    }

    // 1) Insert row first to get ID
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "Supabase client not initialized." }, { status: 500 });
    }
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("applications")
      .insert([{ ip, user_agent: ua, fields }])
      .select("id, created_at")
      .single();

    if (insertErr) throw insertErr;

    // 2) If a file is present, upload to storage and patch row with public URL
    if (portfolioFile) {
      const safeName = portfolioFile.name.replace(/[^\w.\-]+/g, "_");
      const path = `portfolio/${inserted.id}-${Date.now()}-${safeName}`;

      const { error: upErr } = await supabaseAdmin.storage
        .from("applications")
        .upload(path, portfolioFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: portfolioFile.type || undefined,
        });

      if (!upErr) {
        const { data: pub } = supabaseAdmin.storage.from("applications").getPublicUrl(path);
        const merged = { ...fields, "Portfolio File URL": pub.publicUrl };
        await supabaseAdmin.from("applications").update({ fields: merged }).eq("id", inserted.id);
      }
    }

    return NextResponse.json(
      { ok: true, id: inserted.id, created_at: inserted.created_at },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
