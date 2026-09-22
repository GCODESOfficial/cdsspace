-- Deals pipeline and brand-audit expansion.
--
-- Two things land here. First, a brand audit becomes a shareable, refinable
-- document rather than a one-shot report: it remembers the company it was run
-- for, keeps a per-touchpoint diagnosis beside the scorecard, and its public
-- link can be turned off. Second, every touch on a prospect is written to one
-- timeline, so the pipeline view can say where a prospect stands without
-- anybody moving a card by hand.

alter table public.deal_brand_audits
  add column if not exists company_id uuid references public.prospect_companies(id) on delete set null,
  add column if not exists touchpoints jsonb not null default '[]'::jsonb,
  add column if not exists share_enabled boolean not null default true,
  add column if not exists refined_count integer not null default 0,
  add column if not exists last_shared_at timestamptz,
  add column if not exists view_count integer not null default 0,
  add column if not exists last_viewed_at timestamptz;

create index if not exists deal_brand_audits_company_idx
  on public.deal_brand_audits (company_id)
  where company_id is not null;
create index if not exists deal_brand_audits_prospect_idx
  on public.deal_brand_audits (prospect_id, updated_at desc)
  where prospect_id is not null;

comment on column public.deal_brand_audits.touchpoints is
  'One entry per brand touchpoint diagnosed (website, identity, messaging, social, search, content), each with its own state, evidence and fix.';
comment on column public.deal_brand_audits.share_enabled is
  'When false the public /audit/<token> link stops resolving, without deleting the audit.';

-- Every touch on a prospect, in one place, in the order it happened.
create table if not exists public.deal_prospect_events (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.deal_prospects(id) on delete cascade,
  -- The pipeline stage this event proves the prospect has reached. Null for
  -- events that are worth showing on the timeline but move nothing.
  stage text check (stage in (
    'shortlisted','contacted','audit_shared','proposal_sent','proposal_viewed',
    'meeting_scheduled','invoice_sent','paid','project_started','project_completed','lost'
  )),
  event_type text not null,
  detail text,
  -- Which surface produced it, so a derived event can be told from a recorded one.
  source text not null default 'deals',
  actor text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists deal_prospect_events_prospect_idx
  on public.deal_prospect_events (prospect_id, occurred_at desc);
create index if not exists deal_prospect_events_stage_idx
  on public.deal_prospect_events (stage, occurred_at desc)
  where stage is not null;

alter table public.deal_prospect_events enable row level security;

comment on table public.deal_prospect_events is
  'Append-only timeline of everything that has happened to a prospect since it was shortlisted. The pipeline stage is read from this plus the live proposal, consultation, invoice and project tables; nothing is set by hand.';
