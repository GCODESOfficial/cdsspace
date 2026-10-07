/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { getSupabaseAdmin } from "@/lib/supabase";
import { assertTrustedMutationOrigin } from "@/lib/intelligence/security";
import { checkIntelligenceRateLimit } from "@/lib/intelligence/rate-limit";
import { fetchPublicPage, researchPublicSite, searchOpenWeb } from "@/lib/sales-growth-research";
import { AUDIT_TOUCHPOINTS, buildDealBrandAudit, buildDealProposalContent, buildProposalDeck, buildProposalEmailOpening, proposalRewriteSpec, rewriteProposalField, type DealAuditContent, type DealProposalContent } from "@/lib/deals-ai";
import { assessBrandConsistency, type BrandFinding } from "@/lib/prospect-brand";
import { buildPipeline, recordProspectEvent } from "@/lib/deal-pipeline";
import { sweepSocialPresence } from "@/lib/deal-audit-social";
import { normalizeDeck, PROPOSAL_STAGES, type ProposalDeck } from "@/lib/proposal-deck";
import { brandedEmailHtml } from "@/lib/email-template";
import { sendEmail, verifyEmailReady } from "@/lib/email-from";
import { logActivity } from "@/lib/activity-log";
import { applyResearchOverrides, mergeResearchOverrides } from "@/lib/prospect-research-overrides";
import { CDS_SENDER, cleanCopy } from "@/lib/ai/cds-voice";
import { friendlyCompanyName } from "@/lib/prospect-outreach-writer";
import { emailCoverHtml, isEmailCoverPath, loadEmailCover } from "@/lib/email-cover";

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

function socialPlatform(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("linkedin")) return "linkedin";
    if (host.includes("facebook")) return "facebook";
    if (host === "x.com" || host.endsWith(".x.com") || host.includes("twitter")) return "x";
    if (host.includes("instagram")) return "instagram";
    if (host.includes("youtube")) return "youtube";
    if (host.includes("tiktok")) return "tiktok";
  } catch {
    /* The URL was already validated by publicUrl. */
  }
  return "social";
}

function auditSocials(value: unknown, singleUrl = "") {
  const output: Array<{ platform: string; url: string }> = [];
  for (const raw of Array.isArray(value) ? value : []) {
    const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const url = publicUrl(item.url);
    if (!url || output.some((entry) => entry.url === url)) continue;
    output.push({ platform: str(item.platform, 40) || socialPlatform(url), url });
  }
  const url = publicUrl(singleUrl);
  if (url && !output.some((entry) => entry.url === url)) output.push({ platform: socialPlatform(url), url });
  return output.slice(0, 8);
}

async function inspectBrandIdentity(brandName: string, targetUrl: string, socials: Array<{ platform: string; url: string }>): Promise<BrandFinding[]> {
  if (!socials.length) return [];
  try {
    const page = await fetchPublicPage(targetUrl);
    return await assessBrandConsistency({
      companyName: brandName,
      siteHtml: page.html,
      siteUrl: page.url,
      socials,
    });
  } catch {
    return [];
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

/**
 * What a proposal starts from when it is raised off an existing record.
 *
 * A directory company, a brand audit and a checklist entry each already carry
 * the brand, the site and the reason we are writing, so the create form's
 * fields are read off them rather than retyped. Anything the caller passes by
 * hand still wins; this only fills the gaps.
 */
/** The focus is the brief the proposal is written from, so it has room for the research behind it. */
const PROPOSAL_FOCUS_MAX = 4000;

/** What the proposal argues, drawn from a company's research (as the team corrected it). */
function researchFocus(company: any) {
  const list = (value: unknown) => (Array.isArray(value) ? value : []).map((entry) => String(entry || "").trim()).filter(Boolean);
  const services = (Array.isArray(company.service_fit) ? company.service_fit : [])
    .map((entry: any) => entry?.service ? `${entry.service}${entry.reason ? ` (${entry.reason})` : ""}` : "")
    .filter(Boolean);
  return [
    String(company.outreach_angle || "").trim(),
    list(company.pain_points).length ? `What is holding them back: ${list(company.pain_points).slice(0, 4).join("; ")}.` : "",
    list(company.how_we_help).length ? `Where CDS Space helps: ${list(company.how_we_help).slice(0, 4).join("; ")}.` : "",
    services.length ? `Services that fit: ${services.slice(0, 4).join("; ")}.` : "",
    list(company.website_findings).length ? `On the website: ${list(company.website_findings).slice(0, 3).join("; ")}.` : "",
  ].filter(Boolean).join("\n\n");
}

async function proposalSeed(body: Record<string, unknown>) {
  const empty = {
    brand_name: "", target_url: "", social_url: "", focus_area: "",
    recipient_email: "", prospect_id: null as string | null, audit_id: null as string | null,
  };

  const companyId = uuid(body.company_id);
  if (companyId) {
    const company = await glashMaybeOne<any>(`select * from public.prospect_companies where id=$1`, [companyId]);
    if (!company) return { error: "That company is no longer in the directory.", status: 404 } as const;
    const lead = await glashMaybeOne<any>(
      `select email from public.prospect_company_contacts
        where company_id=$1 and email is not null
        order by case when seniority='decision_maker' then 0 else 1 end limit 1`,
      [companyId],
    );
    // The focus is the research talking: what is wrong, and what we would do.
    // A company already on the checklist uses the research as corrected there.
    const checklist = company.prospect_id
      ? await glashMaybeOne<any>(`select research_overrides from public.deal_prospects where id=$1`, [company.prospect_id])
      : null;
    const focus = researchFocus(applyResearchOverrides(company, checklist?.research_overrides));
    return {
      ...empty,
      brand_name: company.company_name || "",
      target_url: publicUrl(company.website),
      social_url: publicUrl(company.socials?.[0]?.url),
      focus_area: str(focus, PROPOSAL_FOCUS_MAX) || `Brand, website and communication work for ${company.company_name}.`,
      recipient_email: str(lead?.email || company.emails?.[0]?.email || "", 320).toLowerCase(),
      prospect_id: company.prospect_id || null,
    };
  }

  const auditId = uuid(body.audit_id);
  if (auditId) {
    const audit = await glashMaybeOne<any>(`select * from public.deal_brand_audits where id=$1`, [auditId]);
    if (!audit) return { error: "That brand audit no longer exists.", status: 404 } as const;
    const content = audit.content || {};
    // The audit already argued the case, so the proposal opens from its own
    // summary and the actions it ranked first.
    const focus = [
      content.summary || "",
      (content.recommendations || []).length
        ? `Priorities from the audit: ${[...(content.recommendations || [])].sort((a: any, b: any) => a.priority - b.priority).slice(0, 3).map((item: any) => item.title).join("; ")}.`
        : "",
      (content.touchpoints || []).filter((entry: any) => entry.state === "weak" || entry.state === "missing").length
        ? `Weakest touchpoints: ${(content.touchpoints || []).filter((entry: any) => entry.state === "weak" || entry.state === "missing").map((entry: any) => entry.label).join(", ")}.`
        : "",
    ].filter(Boolean).join("\n\n");
    return {
      ...empty,
      brand_name: audit.brand_name || "",
      target_url: publicUrl(audit.target_url),
      social_url: publicUrl(audit.social_url),
      focus_area: str(focus, PROPOSAL_FOCUS_MAX) || `Acting on the brand audit for ${audit.brand_name}.`,
      prospect_id: audit.prospect_id || null,
      audit_id: audit.id,
    };
  }

  const fromProspect = uuid(body.from_prospect_id);
  if (fromProspect) {
    const prospect = await glashMaybeOne<any>(`select * from public.deal_prospects where id=$1`, [fromProspect]);
    if (!prospect) return { error: "That prospect is no longer on the checklist.", status: 404 } as const;
    // A checklist entry that came from the directory argues from its research,
    // with the team's corrections applied, plus whatever the team has noted.
    const researched = await glashMaybeOne<any>(`select * from public.prospect_companies where prospect_id=$1 limit 1`, [prospect.id]);
    const notes = [prospect.next_action || "", prospect.notes || ""].map((value) => String(value || "").trim()).filter(Boolean).join("\n\n");
    const focus = researched
      ? [researchFocus(applyResearchOverrides(researched, prospect.research_overrides)), notes ? `Our notes: ${notes}` : ""].filter(Boolean).join("\n\n")
      : notes || String(prospect.research_brief || "").trim().slice(0, 900);
    return {
      ...empty,
      brand_name: prospect.company_name || prospect.display_name || "",
      target_url: publicUrl(prospect.website),
      social_url: publicUrl(prospect.social_url),
      focus_area: str(focus, PROPOSAL_FOCUS_MAX) || `Brand and communication work for ${prospect.company_name || prospect.display_name}.`,
      recipient_email: str(prospect.email || "", 320).toLowerCase(),
      prospect_id: prospect.id,
    };
  }

  return empty;
}

export async function GET(req: NextRequest) {
  const resource = str(req.nextUrl.searchParams.get("resource"), 40) || "overview";
  const permission = resource === "proposals" ? "deals.proposals" : resource === "audits" ? "deals.audits"
    : resource === "prospects" || resource === "pipeline" ? "deals.prospects" : "deals";
  const { denied } = await requireAdmin(req, permission);
  if (denied) return denied;
  try {
    if (resource === "proposals") {
      // The checklist rides along so a proposal can be raised from a prospect
      // already researched rather than retyping what Deals already knows. Only
      // the fields the create form fills, and only prospects still in play.
      const [proposals, events, funnel, prospects] = await Promise.all([
        signedProposalRows(),
        glashQuery<any>(`select * from public.deal_proposal_events order by created_at desc limit 400`),
        glashQuery<any>(`select stage, count(*)::int total, coalesce(sum(deal_value),0)::float value
                           from public.deal_proposals where stage <> 'archived' group by stage`),
        glashQuery<any>(`select id, display_name, company_name, category, status, website, social_url, email, phone,
                                location, notes, next_action, research_brief, follow_up_at
                           from public.deal_prospects
                          where status <> 'not_relevant'
                          order by display_name asc limit 500`),
      ]);
      return NextResponse.json({ ok: true, proposals, events, funnel, prospects });
    }
    if (resource === "audits") {
      const audits = await glashQuery<any>(`select * from public.deal_brand_audits order by updated_at desc limit 200`);
      return NextResponse.json({ ok: true, audits });
    }
    if (resource === "pipeline") {
      const pipeline = await buildPipeline();
      return NextResponse.json({ ok: true, pipeline });
    }
    if (resource === "prospects") {
      // Each entry carries the directory record its research came from, if any,
      // with the headline figures its row shows before the details are opened.
      const prospects = await glashQuery<any>(`
        select p.*, r.id research_company_id, to_jsonb(r) research_summary
          from public.deal_prospects p
          left join lateral (
            select c.id, c.deal_score, c.priority, c.activity_status, c.website_status, c.website_score, c.issues,
                   c.is_public, c.stock_exchanges, c.ticker, c.industry, c.city, coalesce(c.hq_country, c.country) country,
                   c.founded_year, c.employee_count, c.domain, c.enriched_at
              from public.prospect_companies c
             where c.prospect_id = p.id
             limit 1
          ) r on true
         order by p.follow_up_at asc nulls last, p.updated_at desc limit 500`);
      return NextResponse.json({ ok: true, prospects });
    }
    const metrics = await glashMaybeOne<any>(`select
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
    if (action === "preview_proposal") {
      // Everything a proposal would be written from, returned for the team to
      // read and correct before anything is generated.
      const seed = await proposalSeed(body);
      if ("error" in seed) return NextResponse.json({ ok: false, error: seed.error }, { status: seed.status });
      return NextResponse.json({ ok: true, seed: { ...seed, focus_max: PROPOSAL_FOCUS_MAX } });
    }

    if (action === "generate_proposal") {
      if (!checkIntelligenceRateLimit(`deal-proposal:${session.email}`, 12, 60 * 60_000).allowed) {
        return NextResponse.json({ ok: false, error: "Proposal research limit reached. Please wait before generating another." }, { status: 429 });
      }
      // A proposal can be raised from four places, and only the create form
      // supplies every field by hand. From a directory company, a brand audit
      // or a checklist entry we already know the brand, the site and what the
      // work is about, so the seed is read off that record instead of retyped.
      const seed = await proposalSeed(body);
      if ("error" in seed) return NextResponse.json({ ok: false, error: seed.error }, { status: seed.status });

      const brandName = str(body.brand_name, 180) || seed.brand_name;
      const targetUrl = publicUrl(body.target_url) || seed.target_url;
      const socialUrl = publicUrl(body.social_url) || seed.social_url;
      const focusArea = str(body.focus_area, PROPOSAL_FOCUS_MAX) || seed.focus_area;
      if (!brandName || !focusArea || (!targetUrl && !socialUrl)) {
        return NextResponse.json({ ok: false, error: "Brand name, work focus, and a website or social link are required." }, { status: 400 });
      }
      // The link is kept so the prospect card, the proposal, the audit and that
      // person's chat tag all point at the same deal.
      const prospectId = uuid(body.prospect_id) || seed.prospect_id;
      const prospect = prospectId
        ? await glashMaybeOne<any>(`select id, display_name, company_name, status from public.deal_prospects where id=$1`, [prospectId])
        : null;
      if (prospectId && !prospect) {
        return NextResponse.json({ ok: false, error: "That prospect is no longer on the checklist." }, { status: 400 });
      }

      const research = targetUrl ? await researchPublicSite(targetUrl, true) : null;
      const query = `${brandName} ${focusArea} market statistics report`;
      const marketSources = await searchOpenWeb(query, 8);
      // A focus area can contain a full research brief. It belongs in the AI
      // context, not verbatim in the proposal name. The generated deck supplies
      // the concise engagement title when the sender has not written one.
      const requestedTitle = str(body.title, 240);
      const generationTitle = requestedTitle || `${brandName} project proposal`;
      const [content, deck] = await Promise.all([
        buildDealProposalContent({ brandName, focusArea, targetUrl, socialUrl, research, marketSources }),
        buildProposalDeck({ brandName, focusArea, targetUrl, socialUrl, title: generationTitle, research, marketSources }),
      ]);
      const title = requestedTitle || str(deck.cover.title, 240) || generationTitle;
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
          (brand_name,target_url,social_url,recipient_email,focus_area,title,status,stage,cover_storage_path,cover_mime_type,content,deck,sources,email_subject,owner_email,created_by,updated_by,prospect_id,audit_id)
         values ($1,$2,$3,$4,$5,$6,'ready','ready',$7,$8,$9,$10,$11,$12,$13,$13,$13,$14,$15)
         returning *`,
        [brandName, targetUrl || null, socialUrl || null, str(body.recipient_email, 320).toLowerCase() || seed.recipient_email || null, focusArea, title, coverPath || null, coverPath ? "image/webp" : null, JSON.stringify(content), JSON.stringify(deck), JSON.stringify(sources), `A proposal for ${friendlyCompanyName(brandName)}`, session.email, prospect?.id || null, seed.audit_id],
      );
      if (proposal?.id) await recordProposalEvent({ proposalId: proposal.id, type: "created", actor: session.email, detail: prospect ? `${title} (from the checklist entry for ${prospect.display_name})` : title });
      // A prospect we have written a proposal for is no longer one to research.
      if (prospect && ["to_research", "ready"].includes(prospect.status)) {
        await glashQuery(`update public.deal_prospects set status='contacted', updated_by=$2, updated_at=now() where id=$1`, [prospect.id, session.email]);
      }
      await logActivity({ action: "deals.proposal.generate", page: "deals/proposals", resource_type: "deal_proposal", resource_id: proposal?.id, resource_label: title, metadata: { source_count: sources.length } });
      return NextResponse.json({ ok: true, proposal }, { status: 201 });
    }

    if (action === "save_proposal") {
      const id = uuid(body.id);
      if (!id) return NextResponse.json({ ok: false, error: "Proposal is invalid." }, { status: 400 });
      const existing = await glashMaybeOne<any>(`select * from public.deal_proposals where id=$1`, [id]);
      if (!existing) return NextResponse.json({ ok: false, error: "Proposal not found." }, { status: 404 });
      const title = str(body.title, 240) || existing.title;
      const focusArea = str(body.focus_area, PROPOSAL_FOCUS_MAX) || existing.focus_area;
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

    if (action === "rewrite_proposal_field") {
      const id = uuid(body.id);
      const fieldPath = str(body.field_path, 120);
      const spec = proposalRewriteSpec(fieldPath);
      const proposal = id ? await glashMaybeOne<any>(`select * from public.deal_proposals where id=$1`, [id]) : null;
      if (!proposal) return NextResponse.json({ ok: false, error: "Proposal not found." }, { status: 404 });
      if (!spec) return NextResponse.json({ ok: false, error: "That proposal field cannot be rewritten." }, { status: 400 });
      if (!checkIntelligenceRateLimit(`deal-proposal-field:${session.email}`, 80, 60 * 60_000).allowed) {
        return NextResponse.json({ ok: false, error: "Field rewrite limit reached. Please wait before trying again." }, { status: 429 });
      }

      // The browser sends the current editor draft because its last keystroke
      // may still be inside the autosave debounce. It is normalised before it
      // becomes model context, and only the requested string is returned.
      const title = str(body.title, 240) || proposal.title;
      const focusArea = str(body.focus_area, PROPOSAL_FOCUS_MAX) || proposal.focus_area;
      const deck = normalizeDeck(body.deck ?? proposal.deck, { brandName: proposal.brand_name, focusArea, title });
      const value = await rewriteProposalField({
        brandName: proposal.brand_name,
        focusArea,
        title,
        fieldPath,
        currentValue: str(body.current_value, spec.maxCharacters),
        deck,
      });
      return NextResponse.json({ ok: true, value });
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
      const intro = cleanCopy(str(body.message, 1200) || deck.big_picture.intro);
      // A real greeting: the person if we know their name, otherwise their team.
      const recipientName = cleanCopy(str(body.recipient_name, 120));
      const greeting = recipientName ? recipientName.split(/\s+/)[0] : `${friendlyCompanyName(proposal.brand_name)} team`;
      const coverPath = body.cover_storage_path ? String(body.cover_storage_path) : "";
      if (coverPath && !isEmailCoverPath(coverPath)) {
        return NextResponse.json({ ok: false, error: "That cover image is not valid. Upload it again." }, { status: 400 });
      }
      const cover = coverPath ? await loadEmailCover(coverPath) : null;
      const html = brandedEmailHtml(`
        ${cover ? emailCoverHtml() : ""}
        <p style="margin:0 0 16px;">Hello ${escapeHtml(greeting)},</p>
        <p style="margin:0 0 16px;">${escapeHtml(intro)}</p>
        <p style="margin:0 0 6px;">The proposal, <strong>${escapeHtml(deck.cover.title)}</strong>, is ready for you here:</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0 22px;"><tr><td style="border-radius:10px;background:#0A4FE8;"><a href="${escapeHtml(link)}" style="display:inline-block;padding:13px 22px;color:#ffffff;text-decoration:none;font-weight:700;">View the proposal</a></td></tr></table>
        <p style="margin:0 0 16px;">It sets out what we understood about ${escapeHtml(friendlyCompanyName(proposal.brand_name))}, where we see the opportunity, and how we would approach the work. You can also download it as a PDF from the same page.</p>
        <p style="margin:0 0 16px;">If it resonates, the simplest next step is a short conversation to shape the scope together. You can choose a time at <a href="${escapeHtml(deck.cta.primary_url)}" style="color:#0A4FE8;">${escapeHtml(deck.cta.primary_url)}</a>, or simply reply to this email.</p>
        <p style="margin:0 0 4px;">Best regards,</p>
        <p style="margin:0;"><strong>${escapeHtml(CDS_SENDER.name)}</strong><br/>${escapeHtml(CDS_SENDER.title)}</p>
      `, { eyebrow: "CDS Space proposal", preheader: deck.cover.title });
      await sendEmail({
        to: recipient,
        subject: proposal.email_subject || proposal.title,
        html,
        fromName: `${CDS_SENDER.name}, CDS Space`,
        ...(cover ? { attachments: [cover] } : {}),
      });
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
      // Raised from a directory company or a checklist prospect, the audit keeps
      // both links so the pipeline can see it and the socials already researched
      // are judged instead of guessed at.
      const companyId = uuid(body.company_id);
      const company = companyId
        ? await glashMaybeOne<any>(`select id, prospect_id, socials from public.prospect_companies where id=$1`, [companyId])
        : null;
      const prospectId = uuid(body.prospect_id) || company?.prospect_id || null;
      const socials = auditSocials(company?.socials, socialUrl);

      const research = await researchPublicSite(targetUrl, true);
      // Every platform is checked before the audit says anything about social,
      // including the ones the website links to itself, which this used to
      // ignore entirely. An absence is only reportable once it has been looked
      // for, so "no social presence" now arrives with the searches that found
      // none rather than as a conclusion drawn from silence.
      const sweep = await sweepSocialPresence({
        brandName,
        targetUrl,
        known: socials,
        siteLinks: research.socialLinks,
        pagesRead: research.sources.length,
      });
      const auditedSocials = auditSocials([...socials, ...sweep.found]);
      const brandConsistency = await inspectBrandIdentity(brandName, targetUrl, auditedSocials);
      const content = await buildDealBrandAudit({ brandName, targetUrl, socialUrl, research, socials: auditedSocials, brandConsistency, socialSweep: sweep });
      const overall = Math.round(content.scores.reduce((sum, item) => sum + item.score, 0) / Math.max(1, content.scores.length));
      const websiteSources = research.sources.map((url) => ({ title: `${brandName} public website`, url, kind: "website" }));
      const socialSources = auditedSocials.map((entry) => ({ title: `${brandName} ${entry.platform}`, url: entry.url, kind: "social" }));
      const sources = [...websiteSources, ...socialSources].filter((entry, index, list) => list.findIndex((candidate) => candidate.url === entry.url) === index);
      const audit = await glashMaybeOne<any>(
        `insert into public.deal_brand_audits (brand_name,target_url,social_url,status,overall_score,content,touchpoints,sources,created_by,updated_by,company_id,prospect_id)
         values ($1,$2,$3,'generated',$4,$5,$6,$7,$8,$8,$9,$10) returning *`,
        [brandName, targetUrl, socialUrl || null, overall, JSON.stringify(content), JSON.stringify(content.touchpoints || []), JSON.stringify(sources), session.email, company?.id || null, prospectId],
      );
      if (prospectId && audit?.id) {
        await recordProspectEvent({ prospectId, type: "Brand audit generated", detail: brandName, source: "audits", actor: session.email, metadata: { audit_id: audit.id, overall_score: overall } });
      }
      await logActivity({ action: "deals.audit.generate", page: "deals/brand-audits", resource_type: "deal_brand_audit", resource_id: audit?.id, resource_label: brandName, metadata: { source_count: sources.length, overall_score: overall } });
      return NextResponse.json({ ok: true, audit }, { status: 201 });
    }

    if (action === "refine_audit" || action === "save_audit" || action === "set_audit_share" || action === "delete_audit") {
      const id = uuid(body.id);
      if (!id) return NextResponse.json({ ok: false, error: "Audit is invalid." }, { status: 400 });
      const existing = await glashMaybeOne<any>(`select * from public.deal_brand_audits where id=$1`, [id]);
      if (!existing) return NextResponse.json({ ok: false, error: "Audit not found." }, { status: 404 });

      if (action === "delete_audit") {
        await glashQuery(`delete from public.deal_brand_audits where id=$1`, [id]);
        await logActivity({ action: "deals.audit.delete", page: "deals/brand-audits", resource_type: "deal_brand_audit", resource_id: id, resource_label: existing.brand_name });
        return NextResponse.json({ ok: true });
      }

      // Turning the share off leaves the audit intact; the public link simply
      // stops resolving. Turning it on is what the pipeline reads as "shared".
      if (action === "set_audit_share") {
        const enabled = body.share_enabled !== false;
        const audit = await glashMaybeOne<any>(
          `update public.deal_brand_audits
              set share_enabled=$2,
                  last_shared_at=case when $2 then coalesce(last_shared_at, now()) else last_shared_at end,
                  updated_by=$3, updated_at=now()
            where id=$1 returning *`,
          [id, enabled, session.email],
        );
        if (enabled && existing.prospect_id && !existing.last_shared_at) {
          await recordProspectEvent({ prospectId: existing.prospect_id, stage: "audit_shared", type: "Brand audit link shared", detail: existing.brand_name, source: "audits", actor: session.email, metadata: { audit_id: id } });
        }
        return NextResponse.json({ ok: true, audit });
      }

      // Hand edits. The report is ours to correct, so the whole content object
      // is replaced with what the editor sends, touchpoints kept to our own list.
      if (action === "save_audit") {
        const incoming = (body.content && typeof body.content === "object" ? body.content : {}) as Partial<DealAuditContent>;
        const scores = Array.isArray(incoming.scores) ? incoming.scores.slice(0, 8) : existing.content?.scores || [];
        const known = new Map((Array.isArray(incoming.touchpoints) ? incoming.touchpoints : []).map((entry: any) => [String(entry?.key || ""), entry]));
        const touchpoints = AUDIT_TOUCHPOINTS.map((entry) => {
          const item = known.get(entry.key) || {};
          const state = String(item.state || "unknown");
          return {
            key: entry.key,
            label: entry.label,
            state: ["strong", "adequate", "weak", "missing", "unknown"].includes(state) ? state : "unknown",
            observation: str(item.observation, 1200),
            fix: str(item.fix, 1200) || entry.asks,
            evidence: Array.isArray(item.evidence) ? item.evidence.map((value: unknown) => str(value, 500)).filter(Boolean).slice(0, 4) : [],
          };
        });
        const content = { ...existing.content, ...incoming, touchpoints };
        const overall = Math.round(scores.reduce((sum: number, item: any) => sum + (Number(item?.score) || 0), 0) / Math.max(1, scores.length));
        const audit = await glashMaybeOne<any>(
          `update public.deal_brand_audits
              set brand_name=coalesce(nullif($2,''), brand_name), overall_score=$3, content=$4::jsonb,
                  touchpoints=$5::jsonb, status='reviewed', updated_by=$6, updated_at=now()
            where id=$1 returning *`,
          [id, str(body.brand_name, 180), overall, JSON.stringify(content), JSON.stringify(touchpoints), session.email],
        );
        return NextResponse.json({ ok: true, audit });
      }

      // Refine: re-research and rewrite against a written instruction, keeping
      // whatever still holds. The note steers the rewrite, it is never evidence.
      if (!checkIntelligenceRateLimit(`deal-audit:${session.email}`, 12, 60 * 60_000).allowed) {
        return NextResponse.json({ ok: false, error: "Brand audit research limit reached. Please wait before refining again." }, { status: 429 });
      }
      const refineNote = str(body.note, 1200);
      if (!refineNote) return NextResponse.json({ ok: false, error: "Say what should be reconsidered." }, { status: 400 });
      const research = await researchPublicSite(existing.target_url, true);
      const company = existing.company_id
        ? await glashMaybeOne<any>(`select socials from public.prospect_companies where id=$1`, [existing.company_id])
        : null;
      const socials = auditSocials(company?.socials, existing.social_url || "");
      // A refine re-researches, so the platform sweep runs again too: a channel
      // opened since the first audit is picked up, and one that still does not
      // exist stays evidenced rather than inherited from the previous version.
      const sweep = await sweepSocialPresence({
        brandName: existing.brand_name,
        targetUrl: existing.target_url,
        known: socials,
        siteLinks: research.socialLinks,
        pagesRead: research.sources.length,
      });
      const auditedSocials = auditSocials([...socials, ...sweep.found]);
      const brandConsistency = await inspectBrandIdentity(existing.brand_name, existing.target_url, auditedSocials);
      const content = await buildDealBrandAudit({
        brandName: existing.brand_name,
        targetUrl: existing.target_url,
        socialUrl: existing.social_url || "",
        research,
        socials: auditedSocials,
        brandConsistency,
        socialSweep: sweep,
        refineNote,
        previous: existing.content || null,
      });
      const overall = Math.round(content.scores.reduce((sum, item) => sum + item.score, 0) / Math.max(1, content.scores.length));
      const websiteSources = research.sources.map((url) => ({ title: `${existing.brand_name} public website`, url, kind: "website" }));
      const socialSources = auditedSocials.map((entry) => ({ title: `${existing.brand_name} ${entry.platform}`, url: entry.url, kind: "social" }));
      const sources = [...websiteSources, ...socialSources].filter((entry, index, list) => list.findIndex((candidate) => candidate.url === entry.url) === index);
      const audit = await glashMaybeOne<any>(
        `update public.deal_brand_audits
            set overall_score=$2, content=$3::jsonb, touchpoints=$4::jsonb, sources=$5::jsonb,
                status='generated', refined_count=refined_count+1, updated_by=$6, updated_at=now()
          where id=$1 returning *`,
        [id, overall, JSON.stringify(content), JSON.stringify(content.touchpoints || []), JSON.stringify(sources), session.email],
      );
      await logActivity({ action: "deals.audit.refine", page: "deals/brand-audits", resource_type: "deal_brand_audit", resource_id: id, resource_label: existing.brand_name, metadata: { note: refineNote.slice(0, 200) } });
      return NextResponse.json({ ok: true, audit });
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

    if (action === "save_research_overrides") {
      const id = uuid(body.id);
      if (!id) return NextResponse.json({ ok: false, error: "Invalid prospect." }, { status: 400 });
      const existing = await glashMaybeOne<any>(`select research_overrides, display_name from public.deal_prospects where id=$1`, [id]);
      if (!existing) return NextResponse.json({ ok: false, error: "That prospect is no longer on the checklist." }, { status: 404 });
      const overrides = mergeResearchOverrides(existing.research_overrides, body.changes);
      const prospect = await glashMaybeOne<any>(
        `update public.deal_prospects set research_overrides=$2::jsonb, updated_by=$3, updated_at=now() where id=$1 returning *`,
        [id, JSON.stringify(overrides), session.email],
      );
      await logActivity({
        action: "deals.prospect.research_edit",
        page: "deals/prospects",
        resource_type: "deal_prospect",
        resource_id: id,
        resource_label: existing.display_name,
        metadata: { fields: Object.keys((body.changes as Record<string, unknown>) || {}) },
      });
      return NextResponse.json({ ok: true, prospect, overrides });
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
