import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const full_name = String(form.get("full_name") || "").trim();
    const email = String(form.get("email") || "").trim();
    const company = String(form.get("company") || "").trim() || null;
    const budget_range = String(form.get("budget_range") || "").trim() || null;
    const message = String(form.get("message") || "").trim() || null;
    const how_heard = String(form.get("how_heard") || "").trim() || null;

    if (!full_name || !email) {
      return NextResponse.json({ error: "Full name and email are required" }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // Upload any attached files to the public consultation-uploads bucket
    const files = form.getAll("files") as File[];
    const file_urls: string[] = [];
    for (const file of files) {
      if (!(file instanceof File) || file.size === 0) continue;
      const ext = file.name.split(".").pop() || "bin";
      const path = `${new Date().toISOString().slice(0, 10)}/${uuidv4()}.${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: upErr } = await sb.storage.from("consultation-uploads").upload(path, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (upErr) continue;
      const { data } = sb.storage.from("consultation-uploads").getPublicUrl(path);
      file_urls.push(data.publicUrl);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb as any).from("consultation_requests").insert({
      full_name, email, company, budget_range, message, how_heard, file_urls,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
