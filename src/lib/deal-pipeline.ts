/**
 * Where every prospect stands, worked out rather than typed in.
 *
 * A prospect's stage is never a field somebody sets. It is read from what has
 * actually happened around them: the timeline written when we shortlist or
 * email them, the proposals raised against them, the consultations they booked,
 * the invoices raised in their name and the projects that followed. The
 * furthest thing that can be proved is the stage they are at.
 */
import { glashQuery } from "@/lib/glashdb/postgres";
import { getSupabaseAdmin } from "@/lib/supabase";
import { PIPELINE_STAGES as STAGE_LIST, type PipelineEvent, type PipelineProspect, type PipelineStage } from "@/lib/deal-pipeline-stages";

export { PIPELINE_STAGES } from "@/lib/deal-pipeline-stages";
export type { PipelineEvent, PipelineProspect, PipelineStage } from "@/lib/deal-pipeline-stages";

/** Order matters: the furthest stage reached is the one shown. */
const STAGE_ORDER: Record<string, number> = Object.fromEntries(
  STAGE_LIST.map((stage, index) => [stage.key, index + 1]),
);
STAGE_ORDER.lost = 0;

function normalise(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

/** finance_projects only stores a client name, so a project is matched on that. */
function nameKey(value: string | null | undefined) {
  return (value || "").toLowerCase().replace(/\b(ltd|limited|inc|plc|llc|co|company|corp|corporation|group|nigeria|ng)\b/g, "").replace(/[^a-z0-9]/g, "");
}

function pushEvent(into: PipelineEvent[], event: PipelineEvent) {
  if (!event.occurred_at) return;
  into.push(event);
}

/**
 * A proposal, audit or event table enriches the pipeline but is not the
 * pipeline itself. A transient failure in one of those reads must not hide the
 * checklist, especially while a cold database connection is waking up.
 */
async function optionalPipelineRows<T>(label: string, read: Promise<T[]>): Promise<T[]> {
  try {
    return await read;
  } catch (error) {
    console.error(`[deals pipeline] ${label} lookup failed:`, error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Builds the pipeline for every prospect on the checklist. One pass per source
 * table rather than one query per prospect, so a long checklist stays a handful
 * of reads.
 */
export async function buildPipeline(): Promise<PipelineProspect[]> {
  const prospects = await glashQuery<any>(
    `select id, display_name, company_name, email, website, category, status, next_action, follow_up_at, created_at, updated_at
       from public.deal_prospects
      order by updated_at desc
      limit 1000`,
  );
  if (!prospects.length) return [];

  const ids = prospects.map((row) => row.id);
  const emails = Array.from(new Set(prospects.map((row) => normalise(row.email)).filter(Boolean)));
  const names = new Map<string, string[]>();
  for (const prospect of prospects) {
    const key = nameKey(prospect.company_name || prospect.display_name);
    if (!key) continue;
    names.set(key, [...(names.get(key) || []), prospect.id]);
  }

  const [recorded, proposals, audits, linkedCompanies] = await Promise.all([
    optionalPipelineRows("timeline events", glashQuery<any>(
      `select prospect_id, stage, event_type, detail, source, metadata, occurred_at
         from public.deal_prospect_events
        where prospect_id = any($1::uuid[])
        order by occurred_at asc`,
      [ids],
    )),
    optionalPipelineRows("proposals", glashQuery<any>(
      `select id, prospect_id, lower(recipient_email) recipient_email, brand_name, title, stage,
              last_sent_at, first_viewed_at, last_viewed_at, updated_at
         from public.deal_proposals
        where stage <> 'archived'
          and (prospect_id = any($1::uuid[]) or ($2::text[] <> '{}' and lower(recipient_email) = any($2::text[])))`,
      [ids, emails],
    )),
    optionalPipelineRows("brand audits", glashQuery<any>(
      `select id, prospect_id, brand_name, share_enabled, last_shared_at, last_viewed_at, updated_at
         from public.deal_brand_audits
        where prospect_id = any($1::uuid[])`,
      [ids],
    )),
    optionalPipelineRows("prospect-generation links", glashQuery<any>(
      `select id, prospect_id
         from public.prospect_companies
        where prospect_id = any($1::uuid[])`,
      [ids],
    )),
  ]);

  // Consultations, invoices and projects live in Supabase rather than GlashDB,
  // and none of them are worth failing the whole view over.
  const supabase = getSupabaseAdmin() as any;
  const [consultations, invoices, projects] = await Promise.all([
    emails.length && supabase
      ? supabase.from("consultation_requests").select("email, full_name, company, scheduled_at, status, created_at").in("email", emails)
          .then((result: any) => result.data || []).catch(() => [])
      : Promise.resolve([]),
    emails.length && supabase
      ? supabase.from("finance_invoices").select("id, invoice_number, client_email, client_name, status, total, currency, issue_date, project_id, created_at")
          .in("client_email", emails).then((result: any) => result.data || []).catch(() => [])
      : Promise.resolve([]),
    supabase
      ? supabase.from("finance_projects").select("id, name, client, status, duration_start, duration_end, updated_at")
          .then((result: any) => result.data || []).catch(() => [])
      : Promise.resolve([]),
  ]);

  const byId = new Map<string, PipelineEvent[]>(ids.map((id) => [id, [] as PipelineEvent[]]));
  const byEmail = new Map<string, string[]>();
  for (const prospect of prospects) {
    const email = normalise(prospect.email);
    if (email) byEmail.set(email, [...(byEmail.get(email) || []), prospect.id]);
  }
  const proposalFor = new Map<string, any>();
  const auditFor = new Map<string, any>();
  // The stored relationship is authoritative. Event metadata is retained as a
  // fallback for a company that was later removed from the research directory.
  const companyFor = new Map<string, string>(linkedCompanies.map((company) => [company.prospect_id, company.id]));

  for (const event of recorded) {
    const companyId = typeof event.metadata?.company_id === "string" ? event.metadata.company_id : "";
    if (companyId && !companyFor.has(event.prospect_id)) companyFor.set(event.prospect_id, companyId);
    pushEvent(byId.get(event.prospect_id) || [], {
      stage: event.stage || null,
      event_type: event.event_type,
      detail: event.detail || "",
      source: event.source || "deals",
      occurred_at: event.occurred_at,
    });
  }

  const targetsOf = (prospectId: string | null, email: string | null) => {
    if (prospectId && byId.has(prospectId)) return [prospectId];
    const matched = email ? byEmail.get(normalise(email)) : undefined;
    return matched || [];
  };

  for (const proposal of proposals) {
    for (const id of targetsOf(proposal.prospect_id, proposal.recipient_email)) {
      const events = byId.get(id)!;
      if (!proposalFor.has(id)) proposalFor.set(id, proposal);
      if (proposal.last_sent_at) {
        pushEvent(events, { stage: "proposal_sent", event_type: "Proposal sent", detail: proposal.title, source: "proposals", occurred_at: proposal.last_sent_at });
      }
      if (proposal.first_viewed_at) {
        pushEvent(events, { stage: "proposal_viewed", event_type: "Proposal opened by the client", detail: proposal.title, source: "proposals", occurred_at: proposal.first_viewed_at });
      }
      if (proposal.stage === "lost") {
        pushEvent(events, { stage: "lost", event_type: "Proposal lost", detail: proposal.title, source: "proposals", occurred_at: proposal.updated_at });
      }
    }
  }

  for (const audit of audits) {
    const id = audit.prospect_id;
    if (!id || !byId.has(id)) continue;
    if (!auditFor.has(id)) auditFor.set(id, audit);
    if (audit.share_enabled && audit.last_shared_at) {
      pushEvent(byId.get(id)!, { stage: "audit_shared", event_type: "Brand audit shared", detail: audit.brand_name, source: "audits", occurred_at: audit.last_shared_at });
    }
  }

  for (const consultation of consultations) {
    for (const id of targetsOf(null, consultation.email)) {
      if (!consultation.scheduled_at) continue;
      pushEvent(byId.get(id)!, {
        stage: "meeting_scheduled",
        event_type: "Consultation booked",
        detail: [consultation.company, consultation.status].filter(Boolean).join(" · "),
        source: "consultations",
        occurred_at: consultation.scheduled_at,
      });
    }
  }

  const invoiceProjects = new Set<string>();
  for (const invoice of invoices) {
    for (const id of targetsOf(null, invoice.client_email)) {
      const amount = `${invoice.currency || ""} ${Number(invoice.total || 0).toLocaleString()}`.trim();
      if (invoice.project_id) invoiceProjects.add(`${invoice.project_id}:${id}`);
      if (["sent", "overdue", "paid"].includes(invoice.status)) {
        pushEvent(byId.get(id)!, { stage: "invoice_sent", event_type: `Invoice ${invoice.invoice_number}`, detail: amount, source: "finance", occurred_at: invoice.issue_date || invoice.created_at });
      }
      if (invoice.status === "paid") {
        pushEvent(byId.get(id)!, { stage: "paid", event_type: `Invoice ${invoice.invoice_number} paid`, detail: amount, source: "finance", occurred_at: invoice.issue_date || invoice.created_at });
      }
    }
  }

  for (const project of projects) {
    const linked = new Set<string>();
    for (const key of invoiceProjects) {
      const [projectId, prospectId] = key.split(":");
      if (projectId === project.id) linked.add(prospectId);
    }
    // A project raised without an invoice is matched on the client name.
    for (const id of names.get(nameKey(project.client)) || []) linked.add(id);
    for (const id of linked) {
      if (!byId.has(id)) continue;
      if (["active", "paused", "completed"].includes(project.status)) {
        pushEvent(byId.get(id)!, { stage: "project_started", event_type: "Project started", detail: project.name, source: "projects", occurred_at: project.duration_start || project.updated_at });
      }
      if (project.status === "completed") {
        pushEvent(byId.get(id)!, { stage: "project_completed", event_type: "Project delivered", detail: project.name, source: "projects", occurred_at: project.duration_end || project.updated_at });
      }
    }
  }

  const now = Date.now();
  return prospects.map<PipelineProspect>((prospect) => {
    const events = (byId.get(prospect.id) || []).slice();
    // Being on the checklist at all is the first thing that can be proved.
    pushEvent(events, { stage: "shortlisted", event_type: "Added to the checklist", detail: "", source: "checklist", occurred_at: prospect.created_at });
    if (prospect.status === "not_relevant") {
      pushEvent(events, { stage: "lost", event_type: "Marked not relevant", detail: "", source: "checklist", occurred_at: prospect.updated_at });
    }
    events.sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());

    const reached = Array.from(new Set(events.map((event) => event.stage).filter(Boolean))) as PipelineStage[];
    const lost = reached.includes("lost");
    const furthest = reached
      .filter((stage) => stage !== "lost")
      .sort((a, b) => (STAGE_ORDER[a] || 0) - (STAGE_ORDER[b] || 0))
      .pop();
    const stage: PipelineStage = lost && !furthest ? "lost" : (furthest || "shortlisted");
    const reachedAt = [...events].reverse().find((event) => event.stage === stage)?.occurred_at || null;
    const lastTouch = events.length ? events[events.length - 1].occurred_at : null;

    return {
      id: prospect.id,
      display_name: prospect.display_name,
      company_name: prospect.company_name,
      email: prospect.email,
      website: prospect.website,
      category: prospect.category,
      status: prospect.status,
      next_action: prospect.next_action,
      follow_up_at: prospect.follow_up_at,
      updated_at: prospect.updated_at,
      stage: lost ? "lost" : stage,
      stage_reached_at: reachedAt,
      reached: reached.sort((a, b) => (STAGE_ORDER[a] || 0) - (STAGE_ORDER[b] || 0)),
      last_touch_at: lastTouch,
      idle_days: lastTouch ? Math.floor((now - new Date(lastTouch).getTime()) / 86_400_000) : null,
      company_id: companyFor.get(prospect.id) || null,
      proposal_id: proposalFor.get(prospect.id)?.id || null,
      audit_id: auditFor.get(prospect.id)?.id || null,
      events: events.slice(-40).reverse(),
    };
  });
}

/** Writes one event onto a prospect's timeline. Never throws into the caller. */
export async function recordProspectEvent(input: {
  prospectId: string;
  stage?: PipelineStage | null;
  type: string;
  detail?: string;
  source?: string;
  actor?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await glashQuery(
    `insert into public.deal_prospect_events (prospect_id, stage, event_type, detail, source, actor, metadata)
     values ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [
      input.prospectId, input.stage || null, input.type.slice(0, 160), (input.detail || "").slice(0, 600),
      (input.source || "deals").slice(0, 40), input.actor || null, JSON.stringify(input.metadata || {}),
    ],
  ).catch(() => undefined);
}
