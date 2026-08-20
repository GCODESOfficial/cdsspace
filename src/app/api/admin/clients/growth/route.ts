/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { logActivity } from "@/lib/activity-log";
import { sendEmail, verifyEmailReady } from "@/lib/email-from";
import { brandedEmailHtml } from "@/lib/email-template";
import { buildCampaignPlans, buildCompanyIntelligence, buildOutreachPack } from "@/lib/sales-growth-ai";
import { CDS_SERVICE_LINES } from "@/lib/sales-growth-shared";
import { normalizeDomain, researchPublicSite, searchOpenWeb } from "@/lib/sales-growth-research";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function str(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function list(value: unknown, max = 20) {
  return Array.isArray(value) ? value.map((entry) => str(entry, 500)).filter(Boolean).slice(0, max) : [];
}

function uuid(value: unknown) {
  const candidate = str(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate) ? candidate : "";
}

function score(value: unknown, fallback = 50) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || fallback)));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

function emailHtml(body: string, companyName: string) {
  const paragraphs = body.split(/\n{2,}/).map((part) => `<p style="margin:0 0 16px">${escapeHtml(part).replace(/\n/g, "<br>")}</p>`).join("");
  const compliance = `<div style="border-top:1px solid #e5ecf8;margin-top:24px;padding-top:16px;color:#77829a;font-size:12px">Sent by CDS Space after reviewing public information about ${escapeHtml(companyName)}. If this is not relevant, reply “stop” and we will not contact you again.</div>`;
  return brandedEmailHtml(`${paragraphs}${compliance}`, { eyebrow: "Partnership outreach" });
}

async function workspace(id: string) {
  return glashMaybeOne<any>(`select * from public.sales_growth_workspaces where id = $1`, [id]);
}

async function getState(selectedId?: string) {
  const workspaces = await glashQuery<any>(
    `select w.*,
      (select count(*)::int from public.sales_growth_competitors c where c.workspace_id = w.id) competitor_count,
      (select count(*)::int from public.sales_growth_campaigns c where c.workspace_id = w.id) campaign_count,
      (select count(*)::int from public.sales_growth_prospects p where p.workspace_id = w.id) prospect_count,
      (select count(*)::int from public.sales_growth_emails e where e.workspace_id = w.id and e.status = 'sent') sent_count
     from public.sales_growth_workspaces w
     order by w.updated_at desc`,
  );
  const activeId = selectedId && workspaces.some((item) => item.id === selectedId) ? selectedId : workspaces[0]?.id;
  if (!activeId) return { workspaces, active: null, competitors: [], campaigns: [], prospects: [], contacts: [], emails: [], proposals: [], metrics: { sent: 0, replied: 0, qualified: 0, won: 0 } };
  const [active, competitors, campaigns, prospects, contacts, emails, proposals, metrics] = await Promise.all([
    workspace(activeId),
    glashQuery<any>(`select * from public.sales_growth_competitors where workspace_id = $1 order by confidence desc, created_at desc`, [activeId]),
    glashQuery<any>(`select * from public.sales_growth_campaigns where workspace_id = $1 order by created_at desc`, [activeId]),
    glashQuery<any>(`select p.*, c.name campaign_name from public.sales_growth_prospects p left join public.sales_growth_campaigns c on c.id = p.campaign_id where p.workspace_id = $1 order by p.fit_score desc, p.created_at desc`, [activeId]),
    glashQuery<any>(`select c.* from public.sales_growth_contacts c join public.sales_growth_prospects p on p.id = c.prospect_id where p.workspace_id = $1 order by c.is_primary desc, c.created_at`, [activeId]),
    glashQuery<any>(`select e.*, p.company_name, c.full_name contact_name, c.job_title from public.sales_growth_emails e join public.sales_growth_prospects p on p.id = e.prospect_id left join public.sales_growth_contacts c on c.id = e.contact_id where e.workspace_id = $1 order by e.created_at desc`, [activeId]),
    glashQuery<any>(`select p.*, prospect.company_name from public.sales_growth_proposals p join public.sales_growth_prospects prospect on prospect.id = p.prospect_id where p.workspace_id = $1 order by p.created_at desc`, [activeId]),
    glashMaybeOne<any>(`select
      count(*) filter (where status = 'sent')::int sent,
      count(*) filter (where status = 'replied')::int replied,
      (select count(*)::int from public.sales_growth_prospects where workspace_id = $1 and status = 'qualified') qualified,
      (select count(*)::int from public.sales_growth_prospects where workspace_id = $1 and status = 'won') won
     from public.sales_growth_emails where workspace_id = $1`, [activeId]),
  ]);
  return { workspaces, active, competitors, campaigns, prospects, contacts, emails, proposals, metrics: metrics || { sent: 0, replied: 0, qualified: 0, won: 0 } };
}

export async function GET(req: NextRequest) {
  const { denied } = await requireAdmin(req, "clients.growth.view");
  if (denied) return denied;
  try {
    return NextResponse.json({ ok: true, ...(await getState(uuid(req.nextUrl.searchParams.get("workspace_id")))) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not load the growth workspace." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = str(body.action, 40);
  const permission = action === "send_email" ? "clients.growth.send" : action === "approve_email" ? "clients.growth.approve" : "clients.growth.create";
  const { session, denied } = await requireAdmin(req, permission);
  if (denied || !session) return denied || NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    if (action === "create_workspace") {
      const companyName = str(body.company_name, 180);
      const name = str(body.name, 180) || `${companyName} Growth`;
      if (!companyName) return NextResponse.json({ ok: false, error: "Company name is required." }, { status: 400 });
      const row = await glashMaybeOne<any>(
        `insert into public.sales_growth_workspaces (name, company_name, company_domain, headquarters, markets, services, brand_voice, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
        [name, companyName, normalizeDomain(str(body.company_domain, 300)) || null, str(body.headquarters, 180) || null, list(body.markets, 12), list(body.services, 16), str(body.brand_voice, 500) || "direct, intelligent, concise, globally ambitious", session.email],
      );
      await logActivity({ action: "growth_workspace.create", page: "clients/growth", resource_type: "growth_workspace", resource_id: row?.id, resource_label: name });
      return NextResponse.json({ ok: true, workspace: row }, { status: 201 });
    }

    const workspaceId = uuid(body.workspace_id);
    const current = workspaceId ? await workspace(workspaceId) : null;
    if (!current) return NextResponse.json({ ok: false, error: "Choose a valid growth workspace." }, { status: 404 });

    if (action === "update_workspace") {
      const updated = await glashMaybeOne<any>(
        `update public.sales_growth_workspaces set
          name = coalesce(nullif($2,''), name), company_name = coalesce(nullif($3,''), company_name),
          company_domain = nullif($4,''), headquarters = nullif($5,''), markets = $6, services = $7,
          brand_voice = coalesce(nullif($8,''), brand_voice), updated_at = now()
         where id = $1 returning *`,
        [workspaceId, str(body.name, 180), str(body.company_name, 180), normalizeDomain(str(body.company_domain, 300)), str(body.headquarters, 180), list(body.markets, 12), list(body.services, 16), str(body.brand_voice, 500)],
      );
      await logActivity({ action: "growth_workspace.update", page: "clients/growth", resource_type: "growth_workspace", resource_id: workspaceId, resource_label: updated?.name });
      return NextResponse.json({ ok: true, workspace: updated });
    }

    if (action === "research_company") {
      if (!current.company_domain) return NextResponse.json({ ok: false, error: "Add the public company website first." }, { status: 400 });
      const site = await researchPublicSite(current.company_domain, false);
      const intel = await buildCompanyIntelligence({
        companyName: current.company_name,
        domain: current.company_domain,
        headquarters: current.headquarters || "",
        services: current.services || [],
        markets: current.markets || [],
        siteText: site.text,
      });
      await glashQuery(
        `update public.sales_growth_workspaces set company_summary=$2, positioning=$3, services=$4, markets=$5, research_sources=$6, updated_at=now() where id=$1`,
        [workspaceId, intel.company_summary, intel.positioning, intel.services, intel.markets, JSON.stringify(site.sources.map((url) => ({ url, kind: "public_website", researched_at: new Date().toISOString() })))],
      );
      await logActivity({ action: "growth_workspace.research", page: "clients/growth", resource_type: "growth_workspace", resource_id: workspaceId, resource_label: current.name, metadata: { sources: site.sources.length } });
      return NextResponse.json({ ok: true, intelligence: intel, sources: site.sources });
    }

    if (action === "discover_competitors") {
      const market = str(body.market, 180) || current.markets?.[0] || current.headquarters || "global";
      const niche = str(body.query, 240) || (current.services || []).slice(0, 2).join(" ") || "branding agency";
      const results = await searchOpenWeb(`${niche} ${market} agency studio`, 14);
      const ownDomain = normalizeDomain(current.company_domain || "");
      const accepted = results.filter((result) => result.domain !== ownDomain).slice(0, 10);
      for (const result of accepted) {
        await glashQuery(
          `insert into public.sales_growth_competitors (workspace_id,name,domain,summary,source_url,confidence)
           values ($1,$2,$3,$4,$5,$6) on conflict do nothing`,
          [workspaceId, result.title.replace(/\s*[|-].*$/, "").slice(0, 180), result.domain, result.description.slice(0, 1200), result.url, 65],
        );
      }
      await logActivity({ action: "growth_competitor.discover", page: "clients/growth", resource_type: "growth_workspace", resource_id: workspaceId, resource_label: current.name, metadata: { query: niche, found: accepted.length } });
      return NextResponse.json({ ok: true, found: accepted.length, results: accepted });
    }

    if (action === "add_competitor") {
      const name = str(body.name, 180);
      if (!name) return NextResponse.json({ ok: false, error: "Competitor name is required." }, { status: 400 });
      const row = await glashMaybeOne<any>(
        `insert into public.sales_growth_competitors (workspace_id,name,domain,summary,source_url,confidence)
         values ($1,$2,$3,$4,$5,$6) returning *`,
        [workspaceId, name, normalizeDomain(str(body.domain, 300)) || null, str(body.summary, 2000) || null, str(body.source_url, 1000) || null, score(body.confidence, 70)],
      );
      await logActivity({ action: "growth_competitor.create", page: "clients/growth", resource_type: "growth_competitor", resource_id: row?.id, resource_label: name });
      return NextResponse.json({ ok: true, competitor: row }, { status: 201 });
    }

    if (action === "scan_competitor") {
      const competitorId = uuid(body.competitor_id);
      const competitor = await glashMaybeOne<any>(`select * from public.sales_growth_competitors where id=$1 and workspace_id=$2`, [competitorId, workspaceId]);
      if (!competitor?.domain) return NextResponse.json({ ok: false, error: "This competitor needs a public website." }, { status: 400 });
      const site = await researchPublicSite(competitor.domain, true);
      const signals = site.clientSignals;
      const strengths = [site.description].filter(Boolean).slice(0, 4);
      await glashQuery(
        `update public.sales_growth_competitors set summary=coalesce(nullif($3,''),summary), strengths=$4, client_signals=$5, source_url=coalesce(source_url,$6), confidence=$7, updated_at=now() where id=$1 and workspace_id=$2`,
        [competitorId, workspaceId, site.description, strengths, JSON.stringify(signals), site.sources[0] || null, signals.length ? 85 : 72],
      );
      await logActivity({ action: "growth_competitor.research", page: "clients/growth", resource_type: "growth_competitor", resource_id: competitorId, resource_label: competitor.name, metadata: { public_client_signals: signals.length, sources: site.sources } });
      return NextResponse.json({ ok: true, signals, sources: site.sources });
    }

    if (action === "build_campaigns") {
      const competitors = await glashQuery<any>(`select name,summary,opportunity from public.sales_growth_competitors where workspace_id=$1 order by confidence desc limit 10`, [workspaceId]);
      const plans = await buildCampaignPlans({
        companyName: current.company_name,
        companySummary: current.company_summary || "",
        positioning: current.positioning || "",
        services: current.services?.length ? current.services : [...CDS_SERVICE_LINES],
        markets: current.markets || [],
        competitorContext: competitors.map((item) => `${item.name}: ${item.summary || ""}`).join("\n").slice(0, 9000),
      });
      let created = 0;
      for (const plan of plans) {
        const row = await glashMaybeOne<any>(
          `insert into public.sales_growth_campaigns (workspace_id,name,service_niche,audience,geography,pain_points,value_proposition,opening_hook,reply_to)
           select $1,$2,$3,$4,$5,$6,$7,$8,$9
           where not exists (select 1 from public.sales_growth_campaigns where workspace_id=$1 and lower(name)=lower($2)) returning id`,
          [workspaceId, plan.name, plan.service_niche, plan.audience, plan.geography || null, plan.pain_points, plan.value_proposition, plan.opening_hook || null, process.env.EMAIL_FROM || "support@cdsspace.pro"],
        );
        if (row) created += 1;
      }
      await logActivity({ action: "growth_campaign.build", page: "clients/growth", resource_type: "growth_workspace", resource_id: workspaceId, resource_label: current.name, metadata: { created } });
      return NextResponse.json({ ok: true, created, campaigns: plans });
    }

    if (action === "add_campaign") {
      const name = str(body.name, 180);
      const serviceNiche = str(body.service_niche, 240);
      const audience = str(body.audience, 1000);
      const valueProposition = str(body.value_proposition, 1500);
      if (!name || !serviceNiche || !audience || !valueProposition) return NextResponse.json({ ok: false, error: "Name, service niche, audience, and value proposition are required." }, { status: 400 });
      const row = await glashMaybeOne<any>(
        `insert into public.sales_growth_campaigns (workspace_id,name,service_niche,audience,geography,pain_points,value_proposition,opening_hook,reply_to)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
        [workspaceId, name, serviceNiche, audience, str(body.geography, 400) || null, list(body.pain_points, 8), valueProposition, str(body.opening_hook, 500) || null, str(body.reply_to, 320) || process.env.EMAIL_FROM || "support@cdsspace.pro"],
      );
      await logActivity({ action: "growth_campaign.create", page: "clients/growth", resource_type: "growth_campaign", resource_id: row?.id, resource_label: name });
      return NextResponse.json({ ok: true, campaign: row }, { status: 201 });
    }

    if (action === "discover_prospects") {
      const campaignId = uuid(body.campaign_id);
      const campaign = await glashMaybeOne<any>(`select * from public.sales_growth_campaigns where id=$1 and workspace_id=$2`, [campaignId, workspaceId]);
      if (!campaign) return NextResponse.json({ ok: false, error: "Choose a campaign first." }, { status: 400 });
      const query = str(body.query, 240) || `${campaign.audience} ${campaign.geography || ""}`;
      const results = await searchOpenWeb(query, 18);
      const blockedDomains = new Set<string>([
        normalizeDomain(current.company_domain || ""),
        ...(await glashQuery<any>(`select domain from public.sales_growth_competitors where workspace_id=$1`, [workspaceId])).map((item) => normalizeDomain(item.domain || "")),
      ]);
      let created = 0;
      for (const result of results.filter((item) => !blockedDomains.has(item.domain)).slice(0, 15)) {
        const keywordHits = campaign.audience.toLowerCase().split(/\W+/).filter((word: string) => word.length > 5 && `${result.title} ${result.description}`.toLowerCase().includes(word)).length;
        const row = await glashMaybeOne<any>(
          `insert into public.sales_growth_prospects (workspace_id,campaign_id,company_name,domain,description,source_url,fit_score,public_evidence)
           values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing returning id`,
          [workspaceId, campaignId, result.title.replace(/\s*[|-].*$/, "").slice(0, 180), result.domain, result.description.slice(0, 1500), result.url, Math.min(94, 62 + keywordHits * 6), JSON.stringify([{ url: result.url, excerpt: result.description, kind: "public_search_result" }])],
        );
        if (row) created += 1;
      }
      await logActivity({ action: "growth_prospect.discover", page: "clients/growth", resource_type: "growth_campaign", resource_id: campaignId, resource_label: campaign.name, metadata: { query, created } });
      return NextResponse.json({ ok: true, created, searched: results.length });
    }

    if (action === "add_prospect") {
      const companyName = str(body.company_name, 180);
      if (!companyName) return NextResponse.json({ ok: false, error: "Prospect company name is required." }, { status: 400 });
      const row = await glashMaybeOne<any>(
        `insert into public.sales_growth_prospects (workspace_id,campaign_id,company_name,domain,description,location,industry,source_url,fit_score,public_evidence)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
        [workspaceId, uuid(body.campaign_id) || null, companyName, normalizeDomain(str(body.domain, 300)) || null, str(body.description, 1500) || null, str(body.location, 300) || null, str(body.industry, 180) || null, str(body.source_url, 1000) || null, score(body.fit_score, 70), JSON.stringify([])],
      );
      await logActivity({ action: "growth_prospect.create", page: "clients/growth", resource_type: "growth_prospect", resource_id: row?.id, resource_label: companyName });
      return NextResponse.json({ ok: true, prospect: row }, { status: 201 });
    }

    if (action === "enrich_prospect") {
      const prospectId = uuid(body.prospect_id);
      const prospect = await glashMaybeOne<any>(`select * from public.sales_growth_prospects where id=$1 and workspace_id=$2`, [prospectId, workspaceId]);
      if (!prospect?.domain) return NextResponse.json({ ok: false, error: "Add the prospect website before finding public contacts." }, { status: 400 });
      const site = await researchPublicSite(prospect.domain, true);
      const evidence = [
        { url: site.sources[0], excerpt: site.description, kind: "public_website" },
        ...site.brandSignals.map((signal) => ({ url: site.sources[0], excerpt: signal, kind: "public_brand_signal" })),
        { url: site.sources[0], excerpt: `Public homepage structure: ${site.technicalMetrics.heading_count} headings, ${site.technicalMetrics.internal_link_count} internal links, ${site.technicalMetrics.script_count} scripts, and approximately ${site.technicalMetrics.visible_text_characters} visible text characters.`, kind: "public_technical_signal" },
        ...site.sources.slice(1).map((url) => ({ url, kind: "public_company_page" })),
      ] as any[];
      await glashQuery(
        `update public.sales_growth_prospects set description=coalesce(nullif($3,''),description), public_evidence=$4, status='researched', updated_at=now() where id=$1 and workspace_id=$2`,
        [prospectId, workspaceId, site.description, JSON.stringify(evidence)],
      );
      const contacts = [...site.people];
      for (const found of site.emails) {
        if (!contacts.some((person) => person.email === found.email)) contacts.push({ name: "Public contact", job_title: "", email: found.email, source_url: found.source_url });
      }
      let created = 0;
      for (const [index, contact] of contacts.slice(0, 20).entries()) {
        const row = await glashMaybeOne<any>(
          `insert into public.sales_growth_contacts (prospect_id,full_name,job_title,email,source_url,verification_status,is_primary)
           values ($1,$2,$3,$4,$5,'public',$6) on conflict do nothing returning id`,
          [prospectId, contact.name || null, contact.job_title || null, contact.email || null, contact.source_url, index === 0],
        );
        if (row) created += 1;
      }
      await logActivity({ action: "growth_prospect.research", page: "clients/growth", resource_type: "growth_prospect", resource_id: prospectId, resource_label: prospect.company_name, metadata: { public_contacts: created, sources: site.sources } });
      return NextResponse.json({ ok: true, created, sources: site.sources, contacts });
    }

    if (action === "save_contact") {
      const prospectId = uuid(body.prospect_id);
      const prospect = await glashMaybeOne<any>(`select id,company_name from public.sales_growth_prospects where id=$1 and workspace_id=$2`, [prospectId, workspaceId]);
      if (!prospect) return NextResponse.json({ ok: false, error: "Choose a valid prospect." }, { status: 400 });
      const row = await glashMaybeOne<any>(
        `insert into public.sales_growth_contacts (prospect_id,full_name,job_title,email,linkedin_url,source_url,verification_status,is_primary)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
        [prospectId, str(body.full_name, 180) || null, str(body.job_title, 180) || null, str(body.email, 320).toLowerCase() || null, str(body.linkedin_url, 1000) || null, str(body.source_url, 1000) || null, ["unverified", "public", "verified"].includes(str(body.verification_status, 20)) ? str(body.verification_status, 20) : "unverified", Boolean(body.is_primary)],
      );
      await logActivity({ action: "growth_contact.create", page: "clients/growth", resource_type: "growth_contact", resource_id: row?.id, resource_label: str(body.full_name, 180) || prospect.company_name });
      return NextResponse.json({ ok: true, contact: row }, { status: 201 });
    }

    if (action === "generate_outreach") {
      const prospectId = uuid(body.prospect_id);
      const contactId = uuid(body.contact_id);
      const row = await glashMaybeOne<any>(
        `select p.*, c.name campaign_name, c.service_niche, c.value_proposition,
                contact.full_name contact_name, contact.job_title, contact.email contact_email
         from public.sales_growth_prospects p
         left join public.sales_growth_campaigns c on c.id=p.campaign_id
         left join public.sales_growth_contacts contact on contact.id=$3 and contact.prospect_id=p.id
         where p.id=$1 and p.workspace_id=$2`,
        [prospectId, workspaceId, contactId || null],
      );
      if (!row) return NextResponse.json({ ok: false, error: "Choose a prospect." }, { status: 400 });
      const evidence = Array.isArray(row.public_evidence) ? row.public_evidence.map((entry: any) => entry.excerpt || entry.url).filter(Boolean).join(" ") : "";
      const pack = await buildOutreachPack({
        companyName: current.company_name,
        positioning: current.positioning || "",
        campaignName: row.campaign_name || "Focused outreach",
        serviceNiche: row.service_niche || "Brand infrastructure",
        valueProposition: row.value_proposition || "Build a clearer, more coherent brand system.",
        prospectCompany: row.company_name,
        prospectDescription: row.description || "",
        prospectEvidence: evidence.slice(0, 3000),
        contactName: row.contact_name || "",
        contactTitle: row.job_title || "",
      });
      const email = await glashMaybeOne<any>(
        `insert into public.sales_growth_emails (workspace_id,campaign_id,prospect_id,contact_id,recipient_email,subject,body_text,body_html,created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
        [workspaceId, row.campaign_id || null, prospectId, contactId || null, row.contact_email || null, pack.subject, pack.body_text, emailHtml(pack.body_text, row.company_name), session.email],
      );
      await glashQuery(
        `insert into public.sales_growth_emails (workspace_id,campaign_id,prospect_id,contact_id,sequence_step,recipient_email,subject,body_text,body_html,created_by)
         values ($1,$2,$3,$4,2,$5,$6,$7,$8,$9)`,
        [workspaceId, row.campaign_id || null, prospectId, contactId || null, row.contact_email || null, pack.follow_up_subject, pack.follow_up_text, emailHtml(pack.follow_up_text, row.company_name), session.email],
      );
      const proposal = await glashMaybeOne<any>(
        `insert into public.sales_growth_proposals (workspace_id,campaign_id,prospect_id,title,executive_line,problem,solution,deliverables,process,timeline,investment,call_to_action,visual_hook,created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`,
        [workspaceId, row.campaign_id || null, prospectId, pack.proposal.title, pack.proposal.executive_line, pack.proposal.problem, pack.proposal.solution, pack.proposal.deliverables, pack.proposal.process, pack.proposal.timeline, pack.proposal.investment, pack.proposal.call_to_action, JSON.stringify(pack.hook), session.email],
      );
      await logActivity({ action: "growth_outreach.generate", page: "clients/growth", resource_type: "growth_prospect", resource_id: prospectId, resource_label: row.company_name, metadata: { email_id: email?.id, proposal_id: proposal?.id } });
      return NextResponse.json({ ok: true, email, proposal, pack });
    }

    if (action === "update_email") {
      const emailId = uuid(body.email_id);
      const subject = str(body.subject, 300);
      const bodyText = str(body.body_text, 12_000);
      const recipient = str(body.recipient_email, 320).toLowerCase();
      if (!emailId || !subject || !bodyText) return NextResponse.json({ ok: false, error: "Recipient, subject, and message are required." }, { status: 400 });
      const updated = await glashMaybeOne<any>(
        `update public.sales_growth_emails e set recipient_email=nullif($3,''), subject=$4, body_text=$5,
          body_html=$6, status='draft', approved_by=null, approved_at=null, updated_at=now()
         from public.sales_growth_prospects p where e.id=$1 and e.workspace_id=$2 and p.id=e.prospect_id returning e.*`,
        [emailId, workspaceId, recipient, subject, bodyText, emailHtml(bodyText, "the recipient organisation")],
      );
      if (!updated) return NextResponse.json({ ok: false, error: "Email draft was not found." }, { status: 404 });
      await logActivity({ action: "growth_email.update", page: "clients/growth", resource_type: "growth_email", resource_id: emailId, resource_label: subject });
      return NextResponse.json({ ok: true, email: updated });
    }

    if (action === "approve_email") {
      const emailId = uuid(body.email_id);
      const approved = await glashMaybeOne<any>(
        `update public.sales_growth_emails set status='approved', approved_by=$3, approved_at=now(), updated_at=now()
         where id=$1 and workspace_id=$2 and status in ('draft','failed') and nullif(trim(recipient_email),'') is not null returning *`,
        [emailId, workspaceId, session.email],
      );
      if (!approved) return NextResponse.json({ ok: false, error: "Add a recipient email or return the message to draft before approval." }, { status: 409 });
      await logActivity({ action: "growth_email.approve", page: "clients/growth", resource_type: "growth_email", resource_id: emailId, resource_label: approved.subject });
      return NextResponse.json({ ok: true, email: approved });
    }

    if (action === "send_email") {
      const emailId = uuid(body.email_id);
      const outbound = await glashMaybeOne<any>(
        `select e.*, p.company_name, p.domain, c.sender_name, c.reply_to
         from public.sales_growth_emails e
         join public.sales_growth_prospects p on p.id=e.prospect_id
         left join public.sales_growth_campaigns c on c.id=e.campaign_id
         where e.id=$1 and e.workspace_id=$2`,
        [emailId, workspaceId],
      );
      if (!outbound || outbound.status !== "approved") return NextResponse.json({ ok: false, error: "This message must be approved immediately before it is sent." }, { status: 409 });
      if (!outbound.recipient_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(outbound.recipient_email)) return NextResponse.json({ ok: false, error: "Add a valid recipient email." }, { status: 400 });
      const suppressed = await glashMaybeOne<any>(
        `select id from public.sales_growth_suppression where lower(email)=lower($1) or (nullif(domain,'') is not null and lower(domain)=lower($2)) limit 1`,
        [outbound.recipient_email, normalizeDomain(outbound.domain || outbound.recipient_email.split("@")[1])],
      );
      if (suppressed) return NextResponse.json({ ok: false, error: "This recipient or domain is on the suppression list." }, { status: 409 });
      const readyError = await verifyEmailReady();
      if (readyError) return NextResponse.json({ ok: false, error: readyError }, { status: 503 });
      const claimed = await glashMaybeOne<any>(`update public.sales_growth_emails set status='sending', updated_at=now() where id=$1 and workspace_id=$2 and status='approved' returning id`, [emailId, workspaceId]);
      if (!claimed) return NextResponse.json({ ok: false, error: "This message is already being processed." }, { status: 409 });
      try {
        await sendEmail({
          to: outbound.recipient_email,
          subject: outbound.subject,
          text: `${outbound.body_text}\n\nIf this is not relevant, reply “stop” and we will not contact you again.`,
          html: outbound.body_html || emailHtml(outbound.body_text, outbound.company_name),
          fromName: outbound.sender_name || "CDS Space",
          replyTo: outbound.reply_to || process.env.EMAIL_FROM,
        });
        await glashQuery(`update public.sales_growth_emails set status='sent', sent_at=now(), delivery_error=null, updated_at=now() where id=$1`, [emailId]);
        await glashQuery(`update public.sales_growth_prospects set status='contacted', updated_at=now() where id=$1 and status not in ('replied','qualified','won')`, [outbound.prospect_id]);
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 1000) : "Email delivery failed.";
        await glashQuery(`update public.sales_growth_emails set status='failed', delivery_error=$2, updated_at=now() where id=$1`, [emailId, message]);
        return NextResponse.json({ ok: false, error: message }, { status: 502 });
      }
      await logActivity({ action: "growth_email.send", page: "clients/growth", resource_type: "growth_email", resource_id: emailId, resource_label: outbound.subject, metadata: { recipient: outbound.recipient_email, prospect: outbound.company_name } });
      return NextResponse.json({ ok: true, sent_at: new Date().toISOString() });
    }

    if (action === "update_prospect_status") {
      const prospectId = uuid(body.prospect_id);
      const status = str(body.status, 30);
      const allowed = ["discovered", "researched", "approved", "contacted", "replied", "qualified", "won", "lost", "suppressed"];
      if (!allowed.includes(status)) return NextResponse.json({ ok: false, error: "Invalid prospect status." }, { status: 400 });
      const updated = await glashMaybeOne<any>(`update public.sales_growth_prospects set status=$3, updated_at=now() where id=$1 and workspace_id=$2 returning *`, [prospectId, workspaceId, status]);
      if (!updated) return NextResponse.json({ ok: false, error: "Prospect not found." }, { status: 404 });
      await logActivity({ action: "growth_prospect.update", page: "clients/growth", resource_type: "growth_prospect", resource_id: prospectId, resource_label: updated.company_name, metadata: { status } });
      return NextResponse.json({ ok: true, prospect: updated });
    }

    if (action === "suppress") {
      const email = str(body.email, 320).toLowerCase();
      const domain = normalizeDomain(str(body.domain, 300));
      if (!email && !domain) return NextResponse.json({ ok: false, error: "Email or domain is required." }, { status: 400 });
      await glashQuery(
        `insert into public.sales_growth_suppression (workspace_id,email,domain,reason,created_by) values ($1,$2,$3,$4,$5) on conflict do nothing`,
        [workspaceId, email || null, domain || null, str(body.reason, 1000) || "Manual suppression", session.email],
      );
      await logActivity({ action: "growth_suppression.create", page: "clients/growth", resource_type: "growth_suppression", resource_label: email || domain });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Unknown growth action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Growth Engine request failed.";
    return NextResponse.json({ ok: false, error: message }, { status: /duplicate|unique/i.test(message) ? 409 : 500 });
  }
}
