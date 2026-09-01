/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { getSupabaseAdmin } from "@/lib/supabase";
import { assertTrustedMutationOrigin } from "@/lib/intelligence/security";
import { checkIntelligenceRateLimit } from "@/lib/intelligence/rate-limit";
import { researchPublicSite, searchOpenWeb } from "@/lib/sales-growth-research";
import { buildDealBrandAudit, buildDealProposalContent, buildProposalDeck, buildProposalEmailOpening, type DealProposalContent } from "@/lib/deals-ai";
import { normalizeDeck, PROPOSAL_STAGES, type ProposalDeck } from "@/lib/proposal-deck";
import { brandedEmailHtml } from "@/lib/email-template";
import { sendEmail, verifyEmailReady } from "@/lib/email-from";
import { logActivity } from "@/lib/activity-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function str(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function uuid(value: unknown) {
  const candidate = str(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate) ? candidate : "";
}

function publicUrl(value: unknown) {
  const input = str(value, 1000);
  if (!input) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    return ["http:", "https:"].includes(url.protocol) && url.hostname ? url.toString() : "";
  } catch {
    return "";
  }
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://cdsspace.pro").replace(/\/$/, "");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character] || character);
}

function proposalContent(value: unknown): DealProposalContent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const list = (entry: unknown, max: number) => Array.isArray(entry)
    ? entry.map((item) => str(item, 800)).filter(Boolean).slice(0, max)
    : [];
  const metrics = Array.isArray(input.market_metrics) ? input.market_metrics.flatMap((entry) => {
    const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const label = str(item.label, 180);
    const metricValue = str(item.value, 100);
    if (!label || !metricValue) return [];
    return [{ label, value: metricValue, context: str(item.context, 600), source_url: publicUrl(item.source_url) }];
  }).slice(0, 8) : [];
  return {
    executive_summary: str(input.executive_summary, 5000),
    current_state: str(input.current_state, 8000),
    opportunity: str(input.opportunity, 8000),
    proposed_approach: str(input.proposed_approach, 8000),
    deliverables: list(input.deliverables, 12),
    market_metrics: metrics,
    expected_impact: list(input.expected_impact, 10),
    timeline: str(input.timeline, 3000),
    next_step: str(input.next_step, 3000),
  };
}

function stageValue(value: unknown) {
  const candidate = str(value, 40);
  return PROPOSAL_STAGES.some((stage) => stage.key === candidate) || candidate === "archived" ? candidate : "";
}

// The funnel stage is the field the team manages; status stays in step with it
// so the public proposal link keeps working while a deal moves.
function statusForStage(stage: string) {
  if (stage === "won") return "accepted";
  if (stage === "lost") return "declined";
  if (stage === "archived") return "archived";
  if (stage === "negotiation") return "sent";
  return stage;
}

async function recordProposalEvent(input: {
  proposalId: string;
  type: "created" | "edited" | "sent" | "viewed" | "downloaded" | "stage_changed" | "note";
  actor?: string | null;
  detail?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await glashQuery(
    `insert into public.deal_proposal_events (proposal_id,event_type,actor,detail,metadata) values ($1,$2,$3,$4,$5)`,
    [input.proposalId, input.type, input.actor || null, input.detail || null, JSON.stringify(input.metadata || {})],
  );
}

async function signedProposalRows() {
  const rows = await glashQuery<any>(`select * from public.deal_proposals order by updated_at desc limit 200`);
  const storage = getSupabaseAdmin() as any;
  return Promise.all(rows.map(async (row) => {
    if (!row.cover_storage_path) return { ...row, cover_preview_url: null };
    const { data } = await storage.storage.from("deals-assets").createSignedUrl(row.cover_storage_path, 3600);
    return { ...row, cover_preview_url: data?.signedUrl || null };
  }));
}

export async function GET(req: NextRequest) {
  const resource = str(req.nextUrl.searchParams.get("resource"), 40) || "overview";
  const permission = resource === "proposals" ? "deals.proposals" : resource === "audits" ? "deals.audits" : resource === "prospects" ? "deals.prospects" : "deals";
  const { denied } = await requireAdmin(req, permission);
  if (denied) return denied;
  try {
    if (resource === "proposals") {
      const [proposals, events, funnel] = await Promise.all([
        signedProposalRows(),
        glashQuery<any>(`select * from public.deal_proposal_events order by created_at desc limit 400`),
        glashQuery<any>(`select stage, count(*)::int total, coalesce(sum(deal_value),0)::float value
                           from public.deal_proposals where stage <> 'archived' group by stage`),
      ]);
      return NextResponse.json({ ok: true, proposals, events, funnel });
    }
    if (resource === "audits") {
      const audits = await glashQuery<any>(`select * from public.deal_brand_audits order by updated_at desc limit 200`);
      return NextResponse.json({ ok: true, audits });
    }
    if (resource === "prospects") {
      const prospects = await glashQuery<any>(`select * from public.deal_prospects order by follow_up_at asc nulls last, updated_at desc limit 500`);
      return NextResponse.json({ ok: true, prospects });
    }
    const metrics = await glashMaybeOne<any>(`select
      (select count(*)::int from public.sales_growth_prospects) growth_prospects,
      (select count(*)::int from public.deal_proposals where status not in ('archived')) proposals,
      (select count(*)::int from public.deal_brand_audits where status not in ('archived')) audits,
      (select count(*)::int from public.deal_prospects where status not in ('converted','not_relevant')) checklist,
      (select count(*)::int from public.deal_prospects where follow_up_at <= now() and status in ('ready','contacted','follow_up')) due_follow_ups,
      (select count(*)::int from public.prospect_companies where enrichment_status = 'enriched') generated_companies`);
    return NextResponse.json({ ok: true, metrics: metrics || {} });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not load Deals." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!assertTrustedMutationOrigin(req)) return NextResponse.json({ ok: false, error: "Untrusted request origin." }, { status: 403 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = str(body.action, 50);
  const permission = action.includes("proposal") ? "deals.proposals" : action.includes("audit") ? "deals.audits" : "deals.prospects";
  const { session, denied } = await requireAdmin(req, permission);
  if (denied || !session) return denied || NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    if (action === "generate_proposal") {
      if (!checkIntelligenceRateLimit(`deal-proposal:${session.email}`, 12, 60 * 60_000).allowed) {
        return NextResponse.json({ ok: false, error: "Proposal research limit reached. Please wait before generating another." }, { status: 429 });
      }
      const brandName = str(body.brand_name, 180);
      const targetUrl = publicUrl(body.target_url);
      const socialUrl = publicUrl(body.social_url);
      const focusArea = str(body.focus_area, 1200);
      if (!brandName || !focusArea || (!targetUrl && !socialUrl)) {
        return NextResponse.json({ ok: false, error: "Brand name, work focus, and a website or social link are required." }, { status: 400 });
      }
      const research = targetUrl ? await researchPublicSite(targetUrl, true) : null;
      const query = `${brandName} ${focusArea} market statistics report`;
      const marketSources = await searchOpenWeb(query, 8);
      const title = str(body.title, 240) || `${brandName} ${focusArea} proposal`;
      const [content, deck] = await Promise.all([
        buildDealProposalContent({ brandName, focusArea, targetUrl, socialUrl, research, marketSources }),
        buildProposalDeck({ brandName, focusArea, targetUrl, socialUrl, title, research, marketSources }),
      ]);
      const sources = [
        ...(research?.sources || []).map((url) => ({ title: `${brandName} public website`, url, kind: "website" })),
        ...marketSources.map((source) => ({ title: source.title, url: source.url, kind: "market" })),
      ];
      const coverPath = str(body.cover_storage_path, 600);
      if (coverPath && !coverPath.startsWith("proposals/")) {
        return NextResponse.json({ ok: false, error: "Invalid proposal cover path." }, { status: 400 });
      }
      const proposal = await glashMaybeOne<any>(
        `insert into public.deal_proposals
          (brand_name,target_url,social_url,recipient_email,focus_area,title,status,stage,cover_storage_path,cover_mime_type,content,deck,sources,email_subject,owner_email,created_by,updated_by)
         values ($1,$2,$3,$4,$5,$6,'ready','ready',$7,$8,$9,$10,$11,$12,$13,$13,$13)
         returning *`,
        [brandName, targetUrl || null, socialUrl || null, str(body.recipient_email, 320).toLowerCase() || null, focusArea, title, coverPath || null, coverPath ? "image/webp" : null, JSON.stringify(content), JSON.stringify(deck), JSON.stringify(sources), `A focused proposal for ${brandName}`, session.email],
      );
      if (proposal?.id) await recordProposalEvent({ proposalId: proposal.id, type: "created", actor: session.email, detail: title });
      await logActivity({ action: "deals.proposal.generate", page: "deals/proposals", resource_type: "deal_proposal", resource_id: proposal?.id, resource_label: title, metadata: { source_count: sources.length } });
      return NextResponse.json({ ok: true, proposal }, { status: 201 });
    }

    if (action === "save_proposal") {
      const id = uuid(body.id);
      if (!id) return NextResponse.json({ ok: false, error: "Proposal is invalid." }, { status: 400 });
      const existing = await glashMaybeOne<any>(`select * from public.deal_proposals where id=$1`, [id]);
      if (!existing) return NextResponse.json({ ok: false, error: "Proposal not found." }, { status: 404 });
      const title = str(body.title, 240) || existing.title;
      const focusArea = str(body.focus_area, 1200) || existing.focus_area;
      const content = proposalContent(body.content) || existing.content;
      const deck: ProposalDeck = normalizeDeck(body.deck ?? existing.deck, { brandName: existing.brand_name, focusArea, title });
      const updated = await glashMaybeOne<any>(
        `update public.deal_proposals
            set title=$2, recipient_email=nullif($3,''), focus_area=$4,
                content=$5, deck=$6,
                deal_value=nullif($7,'')::numeric, expected_close_on=nullif($8,'')::date, client_note=nullif($9,''),
                status=case when status='draft' then 'ready' else status end,
                stage=case when stage='draft' then 'ready' else stage end,
                updated_by=$10, updated_at=now()
          where id=$1 returning *`,
        [
          id, title, str(body.recipient_email, 320).toLowerCase(), focusArea,
          JSON.stringify(content), JSON.stringify(deck),
          str(body.deal_value, 20), str(body.expected_close_on, 20), str(body.client_note, 2000),
          session.email,
        ],
      );
      await recordProposalEvent({ proposalId: id, type: "edited", actor: session.email, detail: title });
      return NextResponse.json({ ok: true, proposal: updated });
    }

    if (action === "set_proposal_stage") {
      const id = uuid(body.id);
      const stage = stageValue(body.stage);
      if (!id || !stage) return NextResponse.json({ ok: false, error: "Choose a valid funnel stage." }, { status: 400 });
      const updated = await glashMaybeOne<any>(
        `update public.deal_proposals
            set stage=$2, status=$3, lost_reason=case when $2='lost' then nullif($4,'') else null end,
                updated_by=$5, updated_at=now()
          where id=$1 returning *`,
        [id, stage, statusForStage(stage), str(body.lost_reason, 600), session.email],
      );
      if (!updated) return NextResponse.json({ ok: false, error: "Proposal not found." }, { status: 404 });
      await recordProposalEvent({ proposalId: id, type: "stage_changed", actor: session.email, detail: stage, metadata: { lost_reason: str(body.lost_reason, 600) } });
      await logActivity({ action: "deals.proposal.stage", page: "deals/proposals", resource_type: "deal_proposal", resource_id: id, resource_label: updated.title, metadata: { stage } });
      return NextResponse.json({ ok: true, proposal: updated });
    }

    if (action === "add_proposal_note") {
      const id = uuid(body.id);
      const note = str(body.note, 2000);
      if (!id || !note) return NextResponse.json({ ok: false, error: "Write a note before saving it." }, { status: 400 });
      await recordProposalEvent({ proposalId: id, type: "note", actor: session.email, detail: note });
      return NextResponse.json({ ok: true });
    }

    if (action === "delete_proposal") {
      const id = uuid(body.id);
      if (!id) return NextResponse.json({ ok: false, error: "Invalid proposal." }, { status: 400 });
      await glashQuery(`delete from public.deal_proposals where id=$1`, [id]);
      await logActivity({ action: "deals.proposal.delete", page: "deals/proposals", resource_type: "deal_proposal", resource_id: id });
      return NextResponse.json({ ok: true });
    }

    if (action === "draft_proposal_message") {
      const id = uuid(body.id);
      const proposal = id ? await glashMaybeOne<any>(`select * from public.deal_proposals where id=$1`, [id]) : null;
      if (!proposal) return NextResponse.json({ ok: false, error: "Proposal not found." }, { status: 404 });
      if (!checkIntelligenceRateLimit(`deal-proposal-message:${session.email}`, 30, 60 * 60_000).allowed) {
        return NextResponse.json({ ok: false, error: "Draft limit reached. Please wait before generating another." }, { status: 429 });
      }
      const deck = normalizeDeck(proposal.deck, { brandName: proposal.brand_name, focusArea: proposal.focus_area, title: proposal.title });
      const message = await buildProposalEmailOpening({ brandName: proposal.brand_name, focusArea: proposal.focus_area, deck });
      return NextResponse.json({ ok: true, message });
    }

    if (action === "send_proposal") {
      const id = uuid(body.id);
      const proposal = id ? await glashMaybeOne<any>(`select * from public.deal_proposals where id=$1`, [id]) : null;
      const recipient = str(body.recipient_email, 320).toLowerCase() || proposal?.recipient_email || "";
      if (!proposal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
        return NextResponse.json({ ok: false, error: "Add a valid recipient email before sending." }, { status: 400 });
      }
      const readyError = await verifyEmailReady();
      if (readyError) return NextResponse.json({ ok: false, error: readyError }, { status: 503 });
      const link = `${siteUrl()}/proposal/${proposal.public_token}`;
      const deck = normalizeDeck(proposal.deck, { brandName: proposal.brand_name, focusArea: proposal.focus_area, title: proposal.title });
      const intro = str(body.message, 1200) || deck.big_picture.intro;
      const html = brandedEmailHtml(`
        <p style="margin:0 0 16px;">Excellent Day Admin,</p>
        <p style="margin:0 0 16px;">We prepared a proposal for ${escapeHtml(proposal.brand_name)}: <strong>${escapeHtml(deck.cover.title)}</strong>.</p>
        <p style="margin:0 0 20px;">${escapeHtml(intro)}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr><td style="border-radius:10px;background:#0A4FE8;"><a href="${escapeHtml(link)}" style="display:inline-block;padding:13px 22px;color:#ffffff;text-decoration:none;font-weight:700;">View the proposal</a></td></tr></table>
        <p style="margin:0 0 16px;">It runs through who we are, the big picture, the problem, the opportunities, our process, the payoff, and how we kick off. You can also download it as a PDF from the same page.</p>
        <p style="margin:0 0 16px;">When you are ready, book a time with us at <a href="${escapeHtml(deck.cta.primary_url)}" style="color:#0A4FE8;">${escapeHtml(deck.cta.primary_url)}</a>.</p>
        <p style="margin:0;color:#667085;font-size:13px;">This proposal is evidence-led and intended as the starting point for a working conversation. Final scope and outcomes are confirmed together.</p>
      `, { eyebrow: "CDS Space proposal", preheader: deck.cover.title });
      await sendEmail({ to: recipient, subject: proposal.email_subject || proposal.title, html, fromName: "CDS Space" });
      await glashQuery(
        `update public.deal_proposals
            set recipient_email=$2, status='sent',
                stage=case when stage in ('draft','ready') then 'sent' else stage end,
                sent_at=coalesce(sent_at, now()), last_sent_at=now(), send_count=send_count+1,
                updated_by=$3, updated_at=now()
          where id=$1`,
        [id, recipient, session.email],
      );
      await recordProposalEvent({ proposalId: id, type: "sent", actor: session.email, detail: recipient });
      await logActivity({ action: "deals.proposal.send", page: "deals/proposals", resource_type: "deal_proposal", resource_id: id, resource_label: proposal.title, metadata: { recipient } });
      return NextResponse.json({ ok: true, sent_at: new Date().toISOString() });
    }

    if (action === "generate_audit") {
      if (!checkIntelligenceRateLimit(`deal-audit:${session.email}`, 12, 60 * 60_000).allowed) {
        return NextResponse.json({ ok: false, error: "Brand audit research limit reached. Please wait before generating another." }, { status: 429 });
      }
      const brandName = str(body.brand_name, 180);
      const targetUrl = publicUrl(body.target_url);
      const socialUrl = publicUrl(body.social_url);
      if (!brandName || !targetUrl) return NextResponse.json({ ok: false, error: "Brand name and a public website are required." }, { status: 400 });
      const research = await researchPublicSite(targetUrl, true);
      const content = await buildDealBrandAudit({ brandName, targetUrl, socialUrl, research });
      const overall = Math.round(content.scores.reduce((sum, item) => sum + item.score, 0) / Math.max(1, content.scores.length));
      const sources = research.sources.map((url) => ({ title: `${brandName} public website`, url, kind: "website" }));
      const audit = await glashMaybeOne<any>(
        `insert into public.deal_brand_audits (brand_name,target_url,social_url,status,overall_score,content,sources,created_by,updated_by)
         values ($1,$2,$3,'generated',$4,$5,$6,$7,$7) returning *`,
        [brandName, targetUrl, socialUrl || null, overall, JSON.stringify(content), JSON.stringify(sources), session.email],
      );
      await logActivity({ action: "deals.audit.generate", page: "deals/brand-audits", resource_type: "deal_brand_audit", resource_id: audit?.id, resource_label: brandName, metadata: { source_count: sources.length, overall_score: overall } });
      return NextResponse.json({ ok: true, audit }, { status: 201 });
    }

    if (action === "save_prospect") {
      const id = uuid(body.id);
      const displayName = str(body.display_name, 180);
      const category = str(body.category, 40);
      const status = str(body.status, 40) || "to_research";
      const categories = ["potential_client", "investor", "influencer", "industry_leader"];
      const statuses = ["to_research", "ready", "contacted", "follow_up", "converted", "not_relevant"];
      if (!displayName || !categories.includes(category) || !statuses.includes(status)) {
        return NextResponse.json({ ok: false, error: "Name, category, or status is invalid." }, { status: 400 });
      }
      const values = [category, displayName, str(body.company_name, 180) || null, publicUrl(body.website) || null, publicUrl(body.social_url) || null, str(body.email, 320).toLowerCase() || null, str(body.phone, 60) || null, str(body.location, 180) || null, str(body.notes, 4000) || null, str(body.next_action, 1000) || null, str(body.follow_up_at, 40) || null, status, session.email, typeof body.research_brief === "string" ? str(body.research_brief, 40000) : null];
      const prospect = id
        ? await glashMaybeOne<any>(`update public.deal_prospects set category=$2,display_name=$3,company_name=$4,website=$5,social_url=$6,email=$7,phone=$8,location=$9,notes=$10,next_action=$11,follow_up_at=$12::timestamptz,status=$13,updated_by=$14,research_brief=coalesce($15, research_brief),updated_at=now() where id=$1 returning *`, [id, ...values])
        : await glashMaybeOne<any>(`insert into public.deal_prospects (category,display_name,company_name,website,social_url,email,phone,location,notes,next_action,follow_up_at,status,created_by,updated_by,research_brief) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::timestamptz,$12,$13,$13,$14) returning *`, values);
      await logActivity({ action: id ? "deals.prospect.update" : "deals.prospect.create", page: "deals/prospects", resource_type: "deal_prospect", resource_id: prospect?.id, resource_label: displayName, metadata: { category, status } });
      return NextResponse.json({ ok: true, prospect }, { status: id ? 200 : 201 });
    }

    if (action === "delete_prospect") {
      const id = uuid(body.id);
      if (!id) return NextResponse.json({ ok: false, error: "Invalid prospect." }, { status: 400 });
      await glashQuery(`delete from public.deal_prospects where id=$1`, [id]);
      await logActivity({ action: "deals.prospect.delete", page: "deals/prospects", resource_type: "deal_prospect", resource_id: id });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Unknown Deals action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Deals request failed." }, { status: 500 });
  }
}
