import { NextRequest, NextResponse } from "next/server";
import { financeDb } from "@/lib/finance/api-auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = financeDb();
  const { data: invite } = await sb.from("finance_contractor_invites").select("*").eq("token", token).single();
  if (!invite) return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
  if (invite.used) return NextResponse.json({ error: "Invite already used" }, { status: 410 });
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: "Invite expired" }, { status: 410 });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const sb = financeDb();
  const { data: invite } = await sb.from("finance_contractor_invites").select("*").eq("token", token).single();
  if (!invite) return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
  if (invite.used) return NextResponse.json({ error: "Invite already used" }, { status: 410 });
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: "Invite expired" }, { status: 410 });

  const { data: contractor, error } = await sb.from("finance_contractors").insert({
    name: body.name,
    business_niche: body.business_niche || null,
    phone: body.phone || null,
    whatsapp: body.whatsapp || null,
    email: body.email || null,
    bank_name: body.bank_name || null,
    account_name: body.account_name || null,
    account_number: body.account_number || null,
    bank_code: body.bank_code || null,
    office_location: body.office_location || null,
    start_date: body.start_date || null,
    notes: body.notes || null,
    source: "public",
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb.from("finance_contractor_invites").update({ used: true, contractor_id: contractor.id }).eq("token", token);
  return NextResponse.json({ ok: true });
}
