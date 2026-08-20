import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getSupabaseAdmin } from "@/lib/supabase";
import { assertCleanBuffer } from "@/lib/upload-security";
import { ADMIN_FEATURE_PERMISSION_KEYS, notifyAdminFeatureEvent } from "@/lib/admin-feature-notifications";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const full_name = String(form.get("full_name") || "").trim();
    const email = String(form.get("email") || "").trim();
    const company = String(form.get("company") || "").trim() || null;
    const budget_range = String(form.get("budget_range") || "").trim() || null;
    const message = String(form.get("message") || "").trim() || null;
    const how_heard = String(form.get("how_heard") || "").trim() || null;
    const whatsapp = String(form.get("whatsapp") || "").trim() || null;
    const location = String(form.get("location") || "").trim() || null;

    // Chip multi-selects arrive as JSON arrays of strings.
    const parseList = (key: string): string[] => {
      try {
        const raw = JSON.parse(String(form.get(key) || "[]"));
        return Array.isArray(raw) ? raw.map((x) => String(x).slice(0, 80)).filter(Boolean).slice(0, 20) : [];
      } catch {
        return [];
      }
    };
    const topics = parseList("topics");
    const preferred_days = parseList("preferred_days");
    const preferred_times = parseList("preferred_times");

    if (!full_name || !email) {
      return NextResponse.json({ error: "Full name and email are required" }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    // The shared admin client intentionally strips browser-only members from its
    // public type. Storage is available on this server-only client at runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storage = (sb as any).storage;

    // Upload any attached files to the public consultation-uploads bucket
    const files = form.getAll("files") as File[];
    const file_urls: string[] = [];
    for (const file of files) {
      if (!(file instanceof File) || file.size === 0) continue;
      const ext = file.name.split(".").pop() || "bin";
      const path = `${new Date().toISOString().slice(0, 10)}/${uuidv4()}.${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      // Public form: silently drop any attachment that looks like an executable.
      try { assertCleanBuffer(buffer); } catch { continue; }
      const { error: upErr } = await storage.from("consultation-uploads").upload(path, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (upErr) continue;
      const { data } = storage.from("consultation-uploads").getPublicUrl(path);
      file_urls.push(data.publicUrl);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: consultation, error } = await (sb as any).from("consultation_requests").insert({
      full_name, email, company, budget_range, message, how_heard, file_urls,
      whatsapp, location, topics, preferred_days, preferred_times,
    }).select("id, created_at").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await notifyAdminFeatureEvent({
      permissionKeys: ADMIN_FEATURE_PERMISSION_KEYS.consultations,
      title: `New consultation request from ${full_name}`,
      body: company ? `${full_name} from ${company} requested a consultation.` : `${full_name} requested a consultation.`,
      link: "/admin/consultations",
      eyebrow: "Sales Hub · Consultations",
      details: {
        Email: email,
        Company: company,
        Budget: budget_range,
        Topics: topics.join(", "),
        Reference: consultation?.id,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
