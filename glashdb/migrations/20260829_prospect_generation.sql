-- Prospect generation: paste a link to a company listing (or raw notes about
-- companies), harvest candidates from it, then enrich each company from public
-- web sources - is it still trading, is the website outdated, which social
-- accounts exist, which decision makers can be reached, who competes with them
-- locally and globally, and where CDS Space services fit their pain points.
--
-- Rows here are a research staging area. A reviewed company is promoted into
-- public.deal_prospects so the existing checklist stays the single follow-up list.

begin;

create extension if not exists "pgcrypto";

create table if not exists public.prospect_import_batches (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  source_kind text not null default 'text'
    check (source_kind in ('url', 'text')),
  source_url text,
  raw_input text not null default '',
  status text not null default 'parsed'
    check (status in ('parsing', 'parsed', 'failed')),
  discovered_count integer not null default 0,
  created_count integer not null default 0,
  duplicate_count integer not null default 0,
  error text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prospect_import_batches_recent_idx
  on public.prospect_import_batches (created_at desc);

create table if not exists public.prospect_companies (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.prospect_import_batches(id) on delete set null,
  company_name text not null,
  domain text,
  website text,
  country text,
  city text,
  industry text,
  employee_range text,
  founded_year integer,

  -- Is the company still trading? Derived from reachability plus public signals.
  activity_status text not null default 'unknown'
    check (activity_status in ('unknown', 'active', 'dormant', 'inactive')),
  activity_evidence text,

  -- Website health. `outdated` is the buying signal we care about most.
  website_status text not null default 'unknown'
    check (website_status in ('unknown', 'missing', 'broken', 'outdated', 'dated', 'modern')),
  website_score integer,
  website_findings jsonb not null default '[]'::jsonb,

  socials jsonb not null default '[]'::jsonb,
  emails jsonb not null default '[]'::jsonb,
  phones jsonb not null default '[]'::jsonb,

  brief text,
  pain_points jsonb not null default '[]'::jsonb,
  how_we_help jsonb not null default '[]'::jsonb,
  service_fit jsonb not null default '[]'::jsonb,
  competitors_local jsonb not null default '[]'::jsonb,
  competitors_global jsonb not null default '[]'::jsonb,

  outreach_angle text,
  outreach_subject text,
  outreach_email text,

  deal_score integer not null default 0,
  priority text not null default 'medium'
    check (priority in ('high', 'medium', 'low')),
  sources jsonb not null default '[]'::jsonb,

  enrichment_status text not null default 'queued'
    check (enrichment_status in ('queued', 'running', 'enriched', 'failed', 'skipped')),
  enrichment_error text,
  enrichment_attempts integer not null default 0,
  enriched_at timestamptz,

  review_status text not null default 'new'
    check (review_status in ('new', 'shortlisted', 'promoted', 'rejected')),
  prospect_id uuid references public.deal_prospects(id) on delete set null,
  notes text,

  created_by text not null,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per company domain keeps repeated imports of the same list additive
-- rather than duplicating research work across 12,000 records.
create unique index if not exists prospect_companies_domain_key
  on public.prospect_companies (domain) where domain is not null;
create unique index if not exists prospect_companies_name_key
  on public.prospect_companies (lower(company_name)) where domain is null;
create index if not exists prospect_companies_queue_idx
  on public.prospect_companies (enrichment_status, created_at);
create index if not exists prospect_companies_review_idx
  on public.prospect_companies (review_status, deal_score desc, updated_at desc);
create index if not exists prospect_companies_batch_idx
  on public.prospect_companies (batch_id, created_at desc);

create table if not exists public.prospect_company_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.prospect_companies(id) on delete cascade,
  full_name text not null,
  job_title text,
  -- decision_maker is the tier worth an outreach email; the rest is context.
  seniority text not null default 'unknown'
    check (seniority in ('decision_maker', 'influencer', 'operational', 'unknown')),
  email text,
  email_confidence text not null default 'unknown'
    check (email_confidence in ('verified_public', 'pattern_guess', 'unknown')),
  phone text,
  linkedin_url text,
  source_url text,
  created_at timestamptz not null default now()
);

create index if not exists prospect_company_contacts_company_idx
  on public.prospect_company_contacts (company_id, seniority);

alter table public.prospect_import_batches enable row level security;
alter table public.prospect_companies enable row level security;
alter table public.prospect_company_contacts enable row level security;

comment on table public.prospect_import_batches is
  'One pasted company list (URL or raw text) submitted to prospect generation.';
comment on table public.prospect_companies is
  'Researched company records built from public web sources, promoted into deal_prospects once reviewed.';
comment on table public.prospect_company_contacts is
  'Key decision makers and other named contacts found on public company pages.';

commit;
