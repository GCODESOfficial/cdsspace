import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { glashMaybeOne } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function xml(value: unknown) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character] || character);
}

function wrap(value: string, max = 18) {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (`${current} ${word}`.trim().length > max && current) {
      lines.push(current);
      current = word;
    } else current = `${current} ${word}`.trim();
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { denied } = await requireAdmin(req, "clients.growth.view");
  if (denied) return denied;
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid visual hook." }, { status: 400 });
  const proposal = await glashMaybeOne<{ company_name: string; visual_hook: Record<string, unknown> }>(
    `select prospect.company_name, p.visual_hook from public.sales_growth_proposals p join public.sales_growth_prospects prospect on prospect.id=p.prospect_id where p.id=$1`,
    [id],
  );
  if (!proposal) return NextResponse.json({ error: "Visual hook not found." }, { status: 404 });
  const hook = proposal.visual_hook || {};
  const lines = wrap(String(hook.headline || "The business moved. The brand should move with it."));
  const headline = lines.map((line, index) => `<text x="96" y="${250 + index * 72}" fill="white" font-family="Arial, Helvetica, sans-serif" font-size="60" font-weight="800">${xml(line)}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
    <rect width="1200" height="675" fill="#0A4FE8"/>
    <circle cx="1090" cy="95" r="210" fill="#1E64EB"/>
    <circle cx="1040" cy="635" r="260" fill="#0642C5"/>
    <rect x="96" y="72" width="132" height="8" rx="4" fill="#A9C8FF"/>
    <text x="96" y="122" fill="#D7E5FF" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="700" letter-spacing="3">${xml(String(hook.eyebrow || "BRAND DIRECTION").toUpperCase())}</text>
    ${headline}
    <text x="96" y="515" fill="#D7E5FF" font-family="Arial, Helvetica, sans-serif" font-size="24">${xml(hook.subline || `A focused growth direction for ${proposal.company_name}.`)}</text>
    <rect x="96" y="552" width="270" height="54" rx="27" fill="white"/>
    <text x="231" y="587" text-anchor="middle" fill="#0A4FE8" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="800">${xml(String(hook.cta || "SEE THE DIRECTION").toUpperCase().slice(0, 28))}</text>
    <text x="1104" y="600" text-anchor="end" fill="white" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="800">CDS SPACE</text>
  </svg>`;
  const filename = proposal.company_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "visual-hook";
  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="CDS-Space-${filename}-hook.svg"`,
      "Cache-Control": "private, no-store",
    },
  });
}
