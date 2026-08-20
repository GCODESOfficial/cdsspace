import { NextRequest, NextResponse } from "next/server";
import { getClientAccountState } from "@/lib/client-account";
import { getGlashDbAdmin } from "@/lib/glashdb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EDITABLE_FIELDS = [
  "brand_name",
  "brand_tagline",
  "industry",
  "brand_description",
  "contact_name",
  "contact_email",
  "contact_phone",
  "target_audience",
  "competitors",
  "unique_selling_point",
  "brand_personality",
  "brand_values",
  "design_preferences",
  "inspiration_references",
  "assets_needed",
  "goals",
  "long_term_vision",
  "budget_range",
  "timeline",
  "additional_notes",
] as const;

function cleanText(value: unknown, maxLength = 5000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function briefPatch(body: Record<string, unknown>) {
  const patch: Record<string, string | string[]> = {};
  for (const field of EDITABLE_FIELDS) {
    if (!(field in body)) continue;
    if (field === "assets_needed") {
      patch[field] = Array.isArray(body[field])
        ? body[field].filter((value): value is string => typeof value === "string").map((value) => cleanText(value, 160)).filter(Boolean).slice(0, 30)
        : [];
    } else {
      patch[field] = cleanText(body[field]);
    }
  }
  return patch;
}

async function requireClientAccount() {
  const account = await getClientAccountState();
  if (!account?.agreement) return null;
  return account;
}

async function loadCurrentBrief(userId: string) {
  const db = getGlashDbAdmin() as any;
  const { data, error } = await db
    .from("brand_briefs")
    .select("*")
    .eq("client_user_id", userId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

export async function GET() {
  const account = await requireClientAccount();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json({ brief: await loadCurrentBrief(account.user.id) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load the brand brief." },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  const account = await requireClientAccount();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "A valid brand brief is required." }, { status: 400 });

  const patch = briefPatch(body);
  if (!patch.brand_name) {
    return NextResponse.json({ error: "Brand name is required." }, { status: 400 });
  }
  if (!patch.contact_email) {
    return NextResponse.json({ error: "A contact email is required." }, { status: 400 });
  }

  const submit = body.submit === true;
  const now = new Date().toISOString();
  const db = getGlashDbAdmin() as any;

  try {
    const current = await loadCurrentBrief(account.user.id);
    const ownership = {
      client_user_id: account.user.id,
      invite_label: String(patch.brand_name || account.profile.company_name || "Client brand identity"),
      status: submit ? "submitted" : "pending",
      submitted_at: submit ? now : current?.submitted_at || null,
    };

    const query = current
      ? db
          .from("brand_briefs")
          .update({ ...patch, ...ownership })
          .eq("id", current.id)
          .eq("client_user_id", account.user.id)
      : db
          .from("brand_briefs")
          .insert({
            ...patch,
            ...ownership,
            public_token: crypto.randomUUID().replaceAll("-", ""),
          });

    const { data, error } = await query.select("*").single();
    if (error || !data) throw new Error(error?.message || "Could not save the brand brief.");
    return NextResponse.json({ brief: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save the brand brief." },
      { status: 500 },
    );
  }
}
