import { NextRequest, NextResponse } from "next/server";
import { getTeamSession } from "@/lib/team-auth";
import { clientIpFromHeaders } from "@/lib/team-auth";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { listMemberCustodyAgreements } from "@/lib/equipment-custody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// A drawn signature is a PNG data URL, as cSign produces. 1MB is far more than a drawing needs.
const MAX_SIGNATURE_BYTES = 1024 * 1024;

/** The devices assigned to the signed-in team member, and their agreements. */
export async function GET() {
  const session = await getTeamSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const agreements = await listMemberCustodyAgreements(session.id);
  return NextResponse.json({ ok: true, agreements, memberName: session.full_name }, { headers });
}

/**
 * Signs, or declines, one custody agreement. Only the person the device was
 * assigned to can sign it, and only while they still hold the device.
 */
export async function POST(req: NextRequest) {
  const session = await getTeamSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id || "");
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid agreement." }, { status: 400 });

  const agreement = await glashMaybeOne<{ id: string; status: string; returned_at: string | null }>(
    `select c.id::text, c.status, a.returned_at
       from public.admin_equipment_custody_agreements c
       join public.admin_equipment_assignments a on a.id = c.assignment_id
      where c.id = $1::uuid and c.team_member_id = $2::uuid`,
    [id, session.id],
  );
  if (!agreement) return NextResponse.json({ error: "Agreement not found." }, { status: 404 });
  if (agreement.returned_at) return NextResponse.json({ error: "This device has been returned." }, { status: 409 });
  if (agreement.status !== "pending") {
    return NextResponse.json({ error: `This agreement was already ${agreement.status}.` }, { status: 409 });
  }

  const userAgent = req.headers.get("user-agent")?.slice(0, 400) || null;
  const ip = clientIpFromHeaders(req.headers);

  if (body.decline === true) {
    const reason = String(body.reason || "").trim().slice(0, 500) || null;
    await glashQuery(
      `update public.admin_equipment_custody_agreements
          set status='declined', declined_at=now(), decline_reason=$2, ip_address=$3, user_agent=$4
        where id=$1::uuid and status='pending'`,
      [id, reason, ip, userAgent],
    );
    return NextResponse.json({ ok: true, status: "declined" }, { headers });
  }

  const signerName = String(body.signerName || "").trim().slice(0, 140);
  const signature = String(body.signatureImage || "");
  if (signerName.length < 2) return NextResponse.json({ error: "Type your full name to sign." }, { status: 400 });
  if (!signature.startsWith("data:image/png;base64,") || signature.length > MAX_SIGNATURE_BYTES) {
    return NextResponse.json({ error: "Draw your signature to sign." }, { status: 400 });
  }

  // Guarded on status so two open tabs cannot both sign it.
  const signed = await glashMaybeOne<{ id: string }>(
    `update public.admin_equipment_custody_agreements
        set status='signed', signed_at=now(), signer_name=$2, signature_image=$3, ip_address=$4, user_agent=$5
      where id=$1::uuid and status='pending'
      returning id::text`,
    [id, signerName, signature, ip, userAgent],
  );
  if (!signed) return NextResponse.json({ error: "This agreement was already signed." }, { status: 409 });
  return NextResponse.json({ ok: true, status: "signed" }, { headers });
}
