import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getSupabaseAdmin } from "@/lib/supabase";
import { assertCleanBuffer } from "@/lib/upload-security";
import { ADMIN_FEATURE_PERMISSION_KEYS, notifyAdminFeatureEvent } from "@/lib/admin-feature-notifications";
import { queueAdminAlert } from "@/lib/admin-alerts";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const full_name = String(form.get("full_name") || "").trim();
    const email = String(form.get("email") || "").trim();
    const company = String(form.get("company") || "").trim() || null;
    const message = String(form.get("message") || "").trim() || null;
    const how_heard = String(form.get("how_heard") || "").trim() || null;
    const whatsapp = String(form.get("whatsapp") || "").trim() || null;
    const location = String(form.get("location") || "").trim() || null;
    // Present only when the visitor arrived from the Kickoff Meet button on a
    // proposal link. Never trusted as-is: it is looked up before it is stored.
    const proposalTokenRaw = String(form.get("proposal_token") || "").trim();
    const proposalToken = /^[0-9a-f-]{36}$/i.test(proposalTokenRaw) ? proposalTokenRaw : null;

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

    // Everything except the messenger number and the uploads is required.
    if (!full_name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return NextResponse.json({ error: "A full name and a valid email address are required" }, { status: 400 });
    }
    if (!company || !location || !message || !how_heard) {
      return NextResponse.json({ error: "Company, business location, project details, and how you heard about us are required" }, { status: 400 });
    }
    if (topics.length === 0) {
      return NextResponse.json({ error: "Choose at least one thing to discuss" }, { status: 400 });
    }
    // One meeting day at a time, and Sundays have no morning session.
    if (preferred_days.length !== 1) {
      return NextResponse.json({ error: "Choose one preferred meeting day" }, { status: 400 });
    }
    if (preferred_times.length === 0) {
      return NextResponse.json({ error: "Choose at least one preferred meeting time" }, { status: 400 });
    }
    if (preferred_days[0] === "Sun" && preferred_times.some((slot) => /^morning/i.test(slot))) {
      return NextResponse.json({ error: "Sunday sessions run in the afternoon and evening only" }, { status: 400 });
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

    // Resolve the proposal before storing it, so a forged or stale token simply
    // produces an unattributed request rather than a failed booking.
    let proposal: { id: string; title: string | null; brand_name: string | null } | null = null;
    if (proposalToken) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sb as any)
        .from("deal_proposals")
        .select("id, title, brand_name")
        .eq("public_token", proposalToken)
        .maybeSingle();
      proposal = data || null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: consultation, error } = await (sb as any).from("consultation_requests").insert({
      full_name, email, company, message, how_heard, file_urls,
      whatsapp, location, topics, preferred_days, preferred_times,
      proposal_id: proposal?.id ?? null,
    }).select("id, created_at").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Put the booking on the proposal's funnel timeline. Decorative for the
    // client, so a failure here must never fail the booking itself.
    if (proposal) {
      const requestedWindow = [preferred_days.join(", "), preferred_times.join(", ")].filter(Boolean).join(" ");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any).from("deal_proposal_events").insert({
        proposal_id: proposal.id,
        event_type: "scheduled",
        actor: full_name,
        detail: requestedWindow
          ? `Kickoff meet requested for ${requestedWindow}`
          : "Kickoff meet requested",
        metadata: { consultation_id: consultation?.id, email },
      }).then(undefined, () => undefined);
    }

    await notifyAdminFeatureEvent({
      permissionKeys: ADMIN_FEATURE_PERMISSION_KEYS.consultations,
      title: `New consultation request from ${full_name}`,
      body: company ? `${full_name} from ${company} requested a consultation.` : `${full_name} requested a consultation.`,
      link: "/admin/consultations",
      eyebrow: "Sales Hub · Consultations",
      details: {
        Email: email,
        Company: company,
        Topics: topics.join(", "),
        Proposal: proposal ? (proposal.title || proposal.brand_name) : null,
        Reference: consultation?.id,
      },
    });

    // The desk is told the moment the booking lands, separately from the
    // permission-routed notification above, which rides the digest queue.
    queueAdminAlert({
      kind: "consultation",
      subject: company ? `${full_name} (${company})` : full_name,
      details: [
        ["Email", email],
        ["WhatsApp", whatsapp],
        ["Company", company],
        ["Location", location],
        ["To discuss", topics.join(", ")],
        ["Preferred days", preferred_days.join(", ")],
        ["Preferred times", preferred_times.join(", ")],
        ["How they heard", how_heard],
        ["Against proposal", proposal ? (proposal.title || proposal.brand_name) : null],
        ["Reference", consultation?.id],
      ],
      body: message,
      actionPath: "/admin/consultations",
      actionLabel: "Open consultations",
      replyTo: email,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
