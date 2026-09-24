/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";
import { consumeSecurityRateLimit } from "@/lib/client-login-security";
import { SECURE_FORM_UPLOAD_BUCKET, secureFormUploadUrl } from "@/lib/secure-form-uploads";

export const runtime = "nodejs";

type FlatFields = Record<string, string>;

function trimVal(v: unknown) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v);
}

export async function POST(req: Request) {
  try {
    const requestBytes = Number(req.headers.get("content-length") || 0);
    if (requestBytes > 12 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: "The application is too large." }, { status: 413 });
    }
    const ua = req.headers.get("user-agent") ?? "";
    const fwd = req.headers.get("x-forwarded-for") ?? "";
    const ip = fwd.split(",")[0]?.trim() || null;
    if (await consumeSecurityRateLimit({
      bucket: "public-job-application",
      identifier: String(ip || "unknown").slice(0, 96),
      limit: 5,
      windowSeconds: 60 * 60,
      blockSeconds: 60 * 60,
    })) {
      return NextResponse.json({ ok: false, error: "Too many applications. Please try again later." }, { status: 429 });
    }

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

    const safeFields = Object.fromEntries(
      Object.entries(fields).slice(0, 100).map(([key, value]) => [key.slice(0, 120), String(value).slice(0, 12_000)]),
    );
    Object.keys(fields).forEach((key) => delete fields[key]);
    Object.assign(fields, safeFields);
    let safePortfolio: Awaited<ReturnType<typeof assertSafeUpload>> | null = null;
    if (portfolioFile) {
      if (portfolioFile.size > 10 * 1024 * 1024) {
        return NextResponse.json({ ok: false, error: "Portfolio files must be 10MB or smaller." }, { status: 413 });
      }
      safePortfolio = await assertSafeUpload(portfolioFile, {
        allow: ["image", "pdf", "office", "zip", "design"],
        maxBytes: 10 * 1024 * 1024,
        imageMaxDimension: 12_000,
      });
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
    if (portfolioFile && safePortfolio) {
      const safeName = portfolioFile.name.replace(/\.[^.]+$/, "").replace(/[^\w.\-]+/g, "_").slice(0, 120) || "portfolio";
      const path = `applications/${inserted.id}-${Date.now()}-${safeName}.${safePortfolio.ext}`;

        const applicationStorage = (supabaseAdmin as any).storage;
        const { error: upErr } = await applicationStorage
          .from(SECURE_FORM_UPLOAD_BUCKET)
          .upload(path, safePortfolio.buffer, {
            cacheControl: "3600",
            upsert: false,
            contentType: safePortfolio.contentType,
          });

        if (!upErr) {
          const merged = { ...fields, "Portfolio File URL": secureFormUploadUrl("applications", path) };
          await supabaseAdmin.from("applications").update({ fields: merged }).eq("id", inserted.id);
        }
    }

    return NextResponse.json(
      { ok: true, id: inserted.id, created_at: inserted.created_at },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: err instanceof UploadSecurityError ? err.status : 500 },
    );
  }
}
