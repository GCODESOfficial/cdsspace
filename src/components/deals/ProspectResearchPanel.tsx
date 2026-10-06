"use client";

/**
 * A company's research, shown the same way wherever it appears: in the prospect
 * directory and on the prospect checklist. On the checklist the team can also
 * correct it - each correctable section opens in place, saves as it is typed,
 * and can be reset to what the research found.
 */

import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Loader2, Palette, Pencil, RotateCcw, Server } from "lucide-react";
import {
  RESEARCH_FIELD_LABELS,
  type ResearchField,
  type ResearchOverrides,
  type ServiceFit,
} from "@/lib/prospect-research-overrides";

export type ProspectContact = { id: string; full_name: string; job_title: string | null; seniority: string; email: string | null; email_confidence: string; linkedin_url: string | null; source_url: string | null };
export type ProspectCompetitor = { name: string; url: string; note: string; type: "direct" | "indirect"; country?: string; basis?: "search" | "knowledge" };
export type ProspectResearch = {
  id: string; company_name: string; domain: string | null; website: string | null; country: string | null; hq_country: string | null; city: string | null;
  country_count: number; countries: string[];
  industry: string | null; employee_range: string | null; employee_count: number | null; size_band: string | null; founded_year: number | null;
  is_public: boolean | null; stock_exchanges: string[]; ticker: string | null; is_startup: boolean | null;
  activity_status: string; activity_evidence: string | null;
  website_status: string; website_score: number | null; website_findings: string[]; issues: string[];
  brand_consistency: Array<{ area: string; status: string; detail: string; evidence: string[] }>;
  domain_variants: Array<{ host: string; url: string; status: number | null; ok: boolean; redirectsTo: string | null; note: string }>;
  dns_contacts: Array<{ kind: string; value: string; detail: string }>;
  socials: Array<{ platform: string; url: string }>; emails: Array<{ email: string; source_url: string; kind: string }>;
  brief: string | null; pain_points: string[]; how_we_help: string[]; service_fit: ServiceFit[];
  competitors_local: ProspectCompetitor[]; competitors_global: ProspectCompetitor[];
  outreach_angle: string | null; outreach_subject: string | null; outreach_email: string | null;
  deal_score: number; priority: string; sources: string[];
  enrichment_status: string; enrichment_error: string | null; review_status: string; prospect_id: string | null;
  enriched_at?: string | null;
  contacts: ProspectContact[];
};

export const ACTIVITY_TONE: Record<string, string> = { active: "bg-emerald-50 text-emerald-700 border-emerald-200", dormant: "bg-amber-50 text-amber-700 border-amber-200", inactive: "bg-rose-50 text-rose-700 border-rose-200", unknown: "bg-slate-50 text-slate-600 border-slate-200" };
export const WEBSITE_TONE: Record<string, string> = { outdated: "bg-rose-50 text-rose-700 border-rose-200", dated: "bg-amber-50 text-amber-700 border-amber-200", modern: "bg-emerald-50 text-emerald-700 border-emerald-200", missing: "bg-rose-50 text-rose-700 border-rose-200", broken: "bg-rose-50 text-rose-700 border-rose-200", unknown: "bg-slate-50 text-slate-600 border-slate-200" };
export const PRIORITY_TONE: Record<string, string> = { high: "bg-[#0A4FE8] text-white", medium: "bg-blue-50 text-[#0A4FE8]", low: "bg-slate-100 text-slate-600" };

/** Saves one corrected field; `null` resets it to the research. */
export type ResearchEditHandler = (field: ResearchField, value: string | string[] | ServiceFit[] | null) => Promise<void>;

export function ProspectResearchPanel({
  company,
  overrides,
  onEdit,
  competitorActions,
  outreachActions,
}: {
  company: ProspectResearch;
  overrides?: ResearchOverrides;
  onEdit?: ResearchEditHandler;
  competitorActions?: React.ReactNode;
  outreachActions?: React.ReactNode;
}) {
  const edited = overrides || {};
  const value = <K extends ResearchField>(field: K) => (field in edited ? (edited as Record<string, unknown>)[field] : company[field as keyof ProspectResearch]);
  const editable = (field: ResearchField) => onEdit ? { field, edited: field in edited, onEdit } : undefined;
  const findings = value("website_findings") as string[] | undefined;
  const subject = value("outreach_subject") as string | null;
  const email = value("outreach_email") as string | null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <TextBlock title="Brief" text={value("brief") as string | null} empty="Not researched yet." edit={editable("brief")} />
      <TextBlock title="Still trading?" text={value("activity_evidence") as string | null} empty="Not confirmed." edit={editable("activity_evidence")} />
      {company.countries?.length > 0 && <TextBlock title={`Present in ${company.countries.length} ${company.countries.length === 1 ? "country" : "countries"}`} text={company.countries.join(", ")} />}
      <ListBlock
        title="Website findings"
        items={findings || []}
        suffix={company.website_score !== null ? `Website score ${company.website_score} out of 100` : ""}
        edit={editable("website_findings")}
      />
      <ListBlock title="Pain points" items={(value("pain_points") as string[]) || []} edit={editable("pain_points")} />
      <ListBlock title="How CDS Space helps" items={(value("how_we_help") as string[]) || []} edit={editable("how_we_help")} />
      <ServiceFitBlock items={(value("service_fit") as ServiceFit[]) || []} edit={editable("service_fit")} />
      <div>
        <p className="text-xs font-semibold text-slate-600">Key decision makers</p>
        {!company.contacts?.length ? <p className="mt-1 text-sm text-slate-500">No named contacts were found on public pages.</p>
          : <ul className="mt-2 space-y-2">{company.contacts.map((contact) => <li key={contact.id} className="rounded-xl bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-[#07133B]">{contact.full_name} <span className="text-xs font-normal text-slate-500">{contact.job_title || ""}</span></p>
            <p className="mt-0.5 text-xs text-slate-500">{contact.seniority.replace("_", " ")}{contact.email ? ` · ${contact.email}` : " · no public email"}</p>
            {contact.source_url && <a href={contact.source_url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-[#0A4FE8]">Source <ExternalLink className="h-3 w-3" /></a>}
          </li>)}</ul>}
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-600">Emails and social accounts</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          {(company.emails || []).map((entry) => <li key={entry.email}>{entry.email} <span className="text-xs text-slate-400">({entry.kind})</span></li>)}
          {(company.socials || []).map((entry) => <li key={entry.url}><a href={entry.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#0A4FE8]">{entry.platform}</a></li>)}
          {!company.emails?.length && !company.socials?.length && <li className="text-slate-500">None found publicly.</li>}
        </ul>
      </div>
      {company.brand_consistency?.length > 0 && <div>
        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600"><Palette className="h-3.5 w-3.5 text-[#0A4FE8]" /> Brand consistency, website against social</p>
        <ul className="mt-2 space-y-2">{company.brand_consistency.map((entry, index) => <li key={index} className="rounded-xl bg-slate-50 p-3 text-sm">
          <p className="font-semibold text-[#07133B]">{entry.area} <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] ${entry.status === "consistent" ? "bg-emerald-50 text-emerald-700" : entry.status === "variant" ? "bg-[#0A4FE8]/10 text-[#0A4FE8]" : entry.status === "differs" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{entry.status === "variant" ? "brand variant" : entry.status}</span></p>
          <p className="mt-1 text-slate-600">{entry.detail}</p>
          {entry.evidence?.length > 0 && <p className="mt-1 flex flex-wrap gap-2">{entry.evidence.map((link) => <a key={link} href={link} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[#0A4FE8]">view</a>)}</p>}
        </li>)}</ul>
      </div>}
      {company.domain_variants?.length > 0 && <div>
        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600"><Server className="h-3.5 w-3.5 text-[#0A4FE8]" /> Domain configuration</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">{company.domain_variants.map((entry) => <li key={entry.host}>
          <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${entry.ok ? "bg-emerald-500" : "bg-rose-500"}`} />
          <span className="font-semibold text-[#07133B]">{entry.host}</span> {entry.note}
        </li>)}</ul>
        {(company.dns_contacts || []).length > 0 && <ul className="mt-2 space-y-1 text-sm text-slate-600">{company.dns_contacts.map((entry, index) => <li key={index}><span className="font-semibold text-[#07133B]">{entry.value}</span> {entry.detail}</li>)}</ul>}
      </div>}
      <CompetitorBlock title="Local competitors" description="Companies based in the same country, competing for the same customers." items={company.competitors_local || []} />
      <CompetitorBlock title="Global competitors" description="Companies based outside that country, competing for the same buyers." items={company.competitors_global || []} />
      {competitorActions && <div className="lg:col-span-2">{competitorActions}</div>}
      <div className="lg:col-span-2 space-y-3">
        {onEdit ? (
          <>
            <TextBlock title={RESEARCH_FIELD_LABELS.outreach_subject} text={subject} empty="No subject suggested." edit={editable("outreach_subject")} />
            <TextBlock title={RESEARCH_FIELD_LABELS.outreach_email} text={email} empty="No first email suggested." edit={editable("outreach_email")} boxed />
          </>
        ) : email ? (
          <div>
            <p className="text-xs font-semibold text-slate-600">Suggested first email{subject ? ` - ${subject}` : ""}</p>
            <p className="mt-1 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{email}</p>
          </div>
        ) : null}
        {outreachActions}
        {email && <p className="text-xs text-slate-400">Review every claim against the sources before sending.</p>}
      </div>
      {company.sources?.length > 0 && <div className="lg:col-span-2">
        <p className="text-xs font-semibold text-slate-600">Sources</p>
        <ul className="mt-1 space-y-0.5">{company.sources.slice(0, 12).map((source) => <li key={source}><a href={source} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-[#0A4FE8]">{source}</a></li>)}</ul>
      </div>}
      {company.enrichment_error && <p className="text-xs text-rose-600 lg:col-span-2">Last research error: {company.enrichment_error}</p>}
    </div>
  );
}

type EditProps = { field: ResearchField; edited: boolean; onEdit: ResearchEditHandler };

/**
 * The heading of a correctable section, and its editor. While open, every
 * pause in typing saves the draft, so nothing is lost to a refresh; "Done"
 * closes it. A section that differs from the research says so and can be reset.
 */
function Editable({ title, edit, draftFrom, parse, children }: {
  title: string;
  edit?: EditProps;
  draftFrom: () => string;
  parse: (text: string) => string | string[] | ServiceFit[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const lastSaved = useRef("");

  useEffect(() => {
    if (!open || !edit || draft === lastSaved.current) return;
    const timer = window.setTimeout(async () => {
      setState("saving");
      try {
        await edit.onEdit(edit.field, parse(draft));
        lastSaved.current = draft;
        setState("saved");
      } catch { setState("error"); }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [draft, open, edit, parse]);

  const begin = () => {
    const text = draftFrom();
    lastSaved.current = text;
    setDraft(text);
    setState("idle");
    setOpen(true);
  };

  const reset = async () => {
    if (!edit) return;
    setState("saving");
    try { await edit.onEdit(edit.field, null); setOpen(false); setState("idle"); }
    catch { setState("error"); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold text-slate-600">{title}</p>
        {edit?.edited && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10.5px] font-semibold text-violet-700" title="The team corrected this section; a recheck will not overwrite it">Edited</span>}
        {edit && !open && (
          <button type="button" onClick={begin} className="ml-auto inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-semibold text-slate-400 hover:bg-blue-50 hover:text-[#0A4FE8]" aria-label={`Edit ${title.toLowerCase()}`}>
            <Pencil className="h-3 w-3" /> Edit
          </button>
        )}
        {edit?.edited && !open && (
          <button type="button" onClick={reset} className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-semibold text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Show what the research found instead">
            <RotateCcw className="h-3 w-3" /> Reset to research
          </button>
        )}
      </div>
      {open ? (
        <div className="mt-1.5">
          <textarea
            autoFocus
            rows={Math.min(14, Math.max(3, draft.split("\n").length + 1))}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm leading-6 text-slate-700 outline-none focus:border-[#0A4FE8]"
          />
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-slate-400">{parse === parseText ? "" : edit?.field === "service_fit" ? "One service per line, as Service: reason. " : "One item per line. Delete a line to remove a misleading finding. "}</span>
            <span className={state === "error" ? "text-rose-600" : "text-slate-400"}>
              {state === "saving" ? "Saving..." : state === "saved" ? "Saved" : state === "error" ? "Could not save. Keep typing to retry." : ""}
            </span>
            <button type="button" onClick={() => setOpen(false)} disabled={state === "saving"} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-[#0A4FE8] px-2.5 py-1 font-semibold text-white disabled:opacity-50">
              {state === "saving" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Done
            </button>
          </div>
        </div>
      ) : children}
    </div>
  );
}

const parseText = (text: string) => text.trim();
const parseList = (text: string) => text.split("\n").map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim()).filter(Boolean);
const parseServiceFit = (text: string): ServiceFit[] => parseList(text).map((line) => {
  const at = line.indexOf(":");
  return at === -1 ? { service: line, reason: "" } : { service: line.slice(0, at).trim(), reason: line.slice(at + 1).trim() };
}).filter((entry) => entry.service);

function TextBlock({ title, text, empty = "", edit, boxed }: { title: string; text: string | null | undefined; empty?: string; edit?: EditProps; boxed?: boolean }) {
  const body = <p className={`mt-1 whitespace-pre-wrap text-sm leading-6 ${boxed ? "rounded-xl bg-slate-50 p-3 text-slate-700" : "text-slate-600"}`}>{text || <span className="text-slate-500">{empty}</span>}</p>;
  if (!edit) return <div><p className="text-xs font-semibold text-slate-600">{title}</p>{body}</div>;
  return <Editable title={title} edit={edit} draftFrom={() => text || ""} parse={parseText}>{body}</Editable>;
}

function ListBlock({ title, items, suffix, edit }: { title: string; items: string[]; suffix?: string; edit?: EditProps }) {
  const body = <>
    {items?.length ? <ul className="mt-1 list-disc space-y-1 pl-4 text-sm leading-6 text-slate-600">{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="mt-1 text-sm text-slate-500">Nothing recorded.</p>}
    {suffix && <p className="mt-1 text-xs text-slate-400">{suffix}</p>}
  </>;
  if (!edit) return <div><p className="text-xs font-semibold text-slate-600">{title}</p>{body}</div>;
  return <Editable title={title} edit={edit} draftFrom={() => (items || []).join("\n")} parse={parseList}>{body}</Editable>;
}

function ServiceFitBlock({ items, edit }: { items: ServiceFit[]; edit?: EditProps }) {
  const lines = (items || []).map((entry) => `${entry.service}: ${entry.reason}`);
  const body = lines.length
    ? <ul className="mt-1 list-disc space-y-1 pl-4 text-sm leading-6 text-slate-600">{lines.map((line, index) => <li key={index}>{line}</li>)}</ul>
    : <p className="mt-1 text-sm text-slate-500">Nothing recorded.</p>;
  if (!edit) return <div><p className="text-xs font-semibold text-slate-600">Service fit</p>{body}</div>;
  return <Editable title="Service fit" edit={edit} draftFrom={() => lines.join("\n")} parse={parseServiceFit}>{body}</Editable>;
}

function CompetitorBlock({ title, description, items }: { title: string; description: string; items: ProspectCompetitor[] }) {
  const groups: Array<{ type: ProspectCompetitor["type"]; label: string; description: string }> = [
    { type: "direct", label: "Direct", description: "A substantially similar offer for the same customers and use case" },
    { type: "indirect", label: "Indirect", description: "A substitute satisfying the same need or competing for the same budget" },
  ];
  return <div>
    <p className="text-xs font-semibold text-slate-600">{title}</p>
    <p className="mt-1 text-[11px] leading-5 text-slate-500">{description}</p>
    <div className="mt-2 space-y-3">
      {groups.map((group) => {
        const competitors = items.filter((entry) => entry.type === group.type);
        return <div key={group.type} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${group.type === "direct" ? "bg-[#0A4FE8]/10 text-[#0A4FE8]" : "bg-violet-50 text-violet-700"}`}>{group.label}</span>
            <span className="text-[11px] text-slate-500">{group.description}</span>
          </div>
          {competitors.length ? <ul className="mt-2 space-y-2">
            {competitors.map((entry) => <li key={`${entry.type}-${entry.url}`} className="text-sm leading-5 text-slate-600">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <a href={entry.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#0A4FE8]">
                  {entry.name}<ExternalLink className="h-3 w-3" />
                </a>
                {entry.country && <span className="text-xs text-slate-500">{entry.country}</span>}
                {entry.basis === "knowledge" && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-500" title="Identified from the company's industry and what it does, not from a search result. Confirm before quoting it.">From industry knowledge</span>}
              </span>
              {entry.note && <p className="mt-0.5 text-xs leading-5 text-slate-500">{entry.note}</p>}
            </li>)}
          </ul> : <p className="mt-2 text-xs text-slate-500">No verified {group.label.toLowerCase()} competitor found for this scope yet.</p>}
        </div>;
      })}
    </div>
  </div>;
}
