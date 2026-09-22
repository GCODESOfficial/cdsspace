import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { assertTrustedMutationOrigin, cleanText } from "@/lib/intelligence/security";
import { logActivityBackground } from "@/lib/activity-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = new Set(["sales", "marketing", "client_experience"]);
const CHANNELS = new Set(["Any channel", "Phone call", "WhatsApp", "Email", "Social message", "In person"]);
const STAGES = new Set(["Opening", "Discovery", "Follow-up", "Objection handling", "Closing", "Onboarding", "Service recovery"]);

function uuid(value: unknown) {
  const candidate = cleanText(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate) ? candidate : "";
}

function actorKey(session: { role: string; memberId?: string; email: string }) {
  return session.memberId || `${session.role}:${session.email.trim().toLowerCase()}`;
}

function normalize(body: Record<string, unknown>) {
  const category = cleanText(body.category, 40);
  const channel = cleanText(body.channel, 40);
  const stage = cleanText(body.stage, 40);
  const tags = Array.isArray(body.tags)
    ? body.tags.map((tag) => cleanText(tag, 40).toLowerCase()).filter(Boolean).slice(0, 12)
    : cleanText(body.tags, 400).split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean).slice(0, 12);
  return {
    category: CATEGORIES.has(category) ? category : "sales",
    title: cleanText(body.title, 140),
    scriptText: cleanText(body.scriptText, 6000),
    useCase: cleanText(body.useCase, 1200) || null,
    channel: CHANNELS.has(channel) ? channel : "Any channel",
    stage: STAGES.has(stage) ? stage : "Opening",
    market: cleanText(body.market, 100) || "Global",
    language: cleanText(body.language, 80) || "English",
    tags: Array.from(new Set(tags)),
    sortOrder: Number.isFinite(Number(body.sortOrder)) ? Math.max(0, Math.min(10000, Math.round(Number(body.sortOrder)))) : 100,
  };
}

function privateHeaders() {
  return { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };
}

export async function GET(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "clients.sales_scripts.view");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const actor = actorKey(session);
  const scripts = await glashQuery(
    `select id, source_script_id, category, title, script_text, use_case, channel, stage, market, language, tags, status, sort_order, created_by, created_at, updated_at
       from public.admin_sales_scripts
      where status <> 'draft' or created_by = $1
      order by case status when 'draft' then 0 when 'published' then 1 else 2 end, category, sort_order, updated_at desc`,
    [actor],
  );
  return NextResponse.json({ ok: true, scripts }, { headers: privateHeaders() });
}

export async function POST(req: NextRequest) {
  if (!assertTrustedMutationOrigin(req)) return NextResponse.json({ error: "Untrusted request origin." }, { status: 403 });
  const { session, denied } = await requireAdmin(req, "clients.sales_scripts.edit");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const input = normalize(body);
  const actor = actorKey(session);
  const requestedId = uuid(body.id);
  const sourceId = uuid(body.sourceId);
  const action = body.action === "save_draft" ? "save_draft" : "publish";

  if (action === "save_draft") {
    const existing = requestedId
      ? await glashMaybeOne<{ id: string }>(`select id from public.admin_sales_scripts where id=$1 and status='draft' and created_by=$2`, [requestedId, actor])
      : await glashMaybeOne<{ id: string }>(`select id from public.admin_sales_scripts where status='draft' and created_by=$1`, [actor]);
    const rows = existing
      ? await glashQuery<{ id: string; updated_at: string }>(
          `update public.admin_sales_scripts set source_script_id=$2,category=$3,title=$4,script_text=$5,use_case=$6,channel=$7,stage=$8,market=$9,language=$10,tags=$11,sort_order=$12,updated_by=$13,updated_at=now() where id=$1 returning id,updated_at`,
          [existing.id, sourceId || null, input.category, input.title, input.scriptText, input.useCase, input.channel, input.stage, input.market, input.language, input.tags, input.sortOrder, actor],
        )
      : await glashQuery<{ id: string; updated_at: string }>(
          `insert into public.admin_sales_scripts(source_script_id,category,title,script_text,use_case,channel,stage,market,language,tags,status,sort_order,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',$11,$12,$12) returning id,updated_at`,
          [sourceId || null, input.category, input.title, input.scriptText, input.useCase, input.channel, input.stage, input.market, input.language, input.tags, input.sortOrder, actor],
        );
    return NextResponse.json({ ok: true, id: rows[0].id, savedAt: rows[0].updated_at }, { headers: privateHeaders() });
  }

  if (input.title.length < 3) return NextResponse.json({ error: "Add a clear script title." }, { status: 400 });
  if (input.scriptText.length < 12) return NextResponse.json({ error: "Write the approved wording before publishing." }, { status: 400 });
  let row: { id: string };
  if (requestedId) {
    const draft = await glashMaybeOne<{ id: string; source_script_id: string | null }>(`select id,source_script_id from public.admin_sales_scripts where id=$1 and status='draft' and created_by=$2`, [requestedId, actor]);
    if (!draft) return NextResponse.json({ error: "That draft is no longer available." }, { status: 404 });
    if (draft.source_script_id) {
      [row] = await glashQuery<{ id: string }>(
        `update public.admin_sales_scripts set category=$2,title=$3,script_text=$4,use_case=$5,channel=$6,stage=$7,market=$8,language=$9,tags=$10,sort_order=$11,updated_by=$12,updated_at=now() where id=$1 and status <> 'draft' returning id`,
        [draft.source_script_id, input.category, input.title, input.scriptText, input.useCase, input.channel, input.stage, input.market, input.language, input.tags, input.sortOrder, actor],
      );
      await glashQuery(`delete from public.admin_sales_scripts where id=$1`, [draft.id]);
    } else {
      [row] = await glashQuery<{ id: string }>(
        `update public.admin_sales_scripts set category=$2,title=$3,script_text=$4,use_case=$5,channel=$6,stage=$7,market=$8,language=$9,tags=$10,status='published',sort_order=$11,updated_by=$12,updated_at=now() where id=$1 returning id`,
        [draft.id, input.category, input.title, input.scriptText, input.useCase, input.channel, input.stage, input.market, input.language, input.tags, input.sortOrder, actor],
      );
    }
  } else {
    [row] = await glashQuery<{ id: string }>(
      `insert into public.admin_sales_scripts(category,title,script_text,use_case,channel,stage,market,language,tags,status,sort_order,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'published',$10,$11,$11) returning id`,
      [input.category, input.title, input.scriptText, input.useCase, input.channel, input.stage, input.market, input.language, input.tags, input.sortOrder, actor],
    );
  }
  logActivityBackground({ action: "sales_script.publish", page: "clients/sales-scripts", resource_type: "sales_script", resource_id: row.id, resource_label: input.title, metadata: { category: input.category, channel: input.channel } });
  return NextResponse.json({ ok: true, id: row.id }, { headers: privateHeaders() });
}

export async function PATCH(req: NextRequest) {
  if (!assertTrustedMutationOrigin(req)) return NextResponse.json({ error: "Untrusted request origin." }, { status: 403 });
  const { session, denied } = await requireAdmin(req, "clients.sales_scripts.edit");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const id = uuid(body.id);
  if (!id) return NextResponse.json({ error: "Choose a valid sales script." }, { status: 400 });
  const actor = actorKey(session);
  const action = cleanText(body.action, 30);
  if (action === "archive" || action === "restore") {
    const status = action === "archive" ? "archived" : "published";
    const rows = await glashQuery<{ id: string; title: string }>(`update public.admin_sales_scripts set status=$2,updated_by=$3,updated_at=now() where id=$1 and status <> 'draft' returning id,title`, [id, status, actor]);
    if (!rows[0]) return NextResponse.json({ error: "Sales script not found." }, { status: 404 });
    logActivityBackground({ action: `sales_script.${action}`, page: "clients/sales-scripts", resource_type: "sales_script", resource_id: id, resource_label: rows[0].title });
    return NextResponse.json({ ok: true });
  }
  const input = normalize(body);
  if (input.title.length < 3 || input.scriptText.length < 12) return NextResponse.json({ error: "A title and approved script wording are required." }, { status: 400 });
  const rows = await glashQuery<{ id: string }>(
    `update public.admin_sales_scripts set category=$2,title=$3,script_text=$4,use_case=$5,channel=$6,stage=$7,market=$8,language=$9,tags=$10,sort_order=$11,updated_by=$12,updated_at=now() where id=$1 and status <> 'draft' returning id`,
    [id, input.category, input.title, input.scriptText, input.useCase, input.channel, input.stage, input.market, input.language, input.tags, input.sortOrder, actor],
  );
  if (!rows[0]) return NextResponse.json({ error: "Sales script not found." }, { status: 404 });
  logActivityBackground({ action: "sales_script.edit", page: "clients/sales-scripts", resource_type: "sales_script", resource_id: id, resource_label: input.title });
  return NextResponse.json({ ok: true });
}
