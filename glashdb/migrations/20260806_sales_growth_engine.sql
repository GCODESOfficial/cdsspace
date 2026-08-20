-- CDS Space Sales Hub Growth Engine.
-- Human-approved, source-backed company research and outbound delivery.

create extension if not exists "pgcrypto";

create table if not exists public.sales_growth_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_name text not null,
  company_domain text,
  company_summary text,
  positioning text,
  headquarters text,
  markets text[] not null default '{}',
  services text[] not null default '{}',
  brand_voice text not null default 'direct, intelligent, concise, globally ambitious',
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  research_sources jsonb not null default '[]'::jsonb,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_growth_competitors (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.sales_growth_workspaces(id) on delete cascade,
  name text not null,
  domain text,
  summary text,
  strengths text[] not null default '{}',
  opportunity text,
  source_url text,
  confidence integer not null default 50 check (confidence between 0 and 100),
  client_signals jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_sales_growth_competitor_domain
  on public.sales_growth_competitors(workspace_id, lower(domain))
  where nullif(trim(domain), '') is not null;

create table if not exists public.sales_growth_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.sales_growth_workspaces(id) on delete cascade,
  name text not null,
  service_niche text not null,
  audience text not null,
  geography text,
  pain_points text[] not null default '{}',
  value_proposition text not null,
  opening_hook text,
  sender_name text not null default 'CDS Space',
  reply_to text,
  daily_limit integer not null default 10 check (daily_limit between 1 and 100),
  status text not null default 'draft' check (status in ('draft', 'ready', 'active', 'paused', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sales_growth_campaigns_workspace
  on public.sales_growth_campaigns(workspace_id, status, created_at desc);

create table if not exists public.sales_growth_prospects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.sales_growth_workspaces(id) on delete cascade,
  campaign_id uuid references public.sales_growth_campaigns(id) on delete set null,
  company_name text not null,
  domain text,
  description text,
  location text,
  industry text,
  employee_range text,
  source_url text,
  fit_score integer not null default 50 check (fit_score between 0 and 100),
  status text not null default 'discovered'
    check (status in ('discovered', 'researched', 'approved', 'contacted', 'replied', 'qualified', 'won', 'lost', 'suppressed')),
  research_notes text,
  public_evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_sales_growth_prospect_domain
  on public.sales_growth_prospects(workspace_id, lower(domain))
  where nullif(trim(domain), '') is not null;
create index if not exists idx_sales_growth_prospects_campaign
  on public.sales_growth_prospects(campaign_id, status, fit_score desc);

create table if not exists public.sales_growth_contacts (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.sales_growth_prospects(id) on delete cascade,
  full_name text,
  job_title text,
  email text,
  linkedin_url text,
  source_url text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'public', 'verified', 'bounced')),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_sales_growth_contact_email
  on public.sales_growth_contacts(prospect_id, lower(email))
  where nullif(trim(email), '') is not null;

create table if not exists public.sales_growth_emails (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.sales_growth_workspaces(id) on delete cascade,
  campaign_id uuid references public.sales_growth_campaigns(id) on delete set null,
  prospect_id uuid not null references public.sales_growth_prospects(id) on delete cascade,
  contact_id uuid references public.sales_growth_contacts(id) on delete set null,
  sequence_step integer not null default 1 check (sequence_step between 1 and 12),
  recipient_email text,
  subject text not null,
  body_text text not null,
  body_html text,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'scheduled', 'sending', 'sent', 'failed', 'replied', 'skipped')),
  approved_by text,
  approved_at timestamptz,
  scheduled_at timestamptz,
  sent_at timestamptz,
  delivery_error text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sales_growth_emails_campaign
  on public.sales_growth_emails(campaign_id, status, created_at desc);
create index if not exists idx_sales_growth_emails_queue
  on public.sales_growth_emails(status, scheduled_at)
  where status in ('approved', 'scheduled');

create table if not exists public.sales_growth_proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.sales_growth_workspaces(id) on delete cascade,
  campaign_id uuid references public.sales_growth_campaigns(id) on delete set null,
  prospect_id uuid not null references public.sales_growth_prospects(id) on delete cascade,
  title text not null,
  executive_line text not null,
  problem text not null,
  solution text not null,
  deliverables text[] not null default '{}',
  process text[] not null default '{}',
  timeline text,
  investment text,
  call_to_action text not null,
  visual_hook jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'approved', 'sent', 'accepted', 'declined')),
  created_by text not null,
  approved_by text,
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sales_growth_proposals_prospect
  on public.sales_growth_proposals(prospect_id, created_at desc);

create table if not exists public.sales_growth_suppression (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.sales_growth_workspaces(id) on delete cascade,
  email text,
  domain text,
  reason text,
  created_by text not null,
  created_at timestamptz not null default now(),
  check (nullif(trim(coalesce(email, '')), '') is not null or nullif(trim(coalesce(domain, '')), '') is not null)
);

create unique index if not exists idx_sales_growth_suppression_email
  on public.sales_growth_suppression(lower(email))
  where nullif(trim(email), '') is not null;
create unique index if not exists idx_sales_growth_suppression_domain
  on public.sales_growth_suppression(lower(domain))
  where nullif(trim(domain), '') is not null;

alter table public.sales_growth_workspaces enable row level security;
alter table public.sales_growth_competitors enable row level security;
alter table public.sales_growth_campaigns enable row level security;
alter table public.sales_growth_prospects enable row level security;
alter table public.sales_growth_contacts enable row level security;
alter table public.sales_growth_emails enable row level security;
alter table public.sales_growth_proposals enable row level security;
alter table public.sales_growth_suppression enable row level security;

comment on table public.sales_growth_workspaces is 'Sales Hub market intelligence and outbound workspaces.';
comment on column public.sales_growth_competitors.client_signals is 'Public portfolio, case-study, or brand evidence requiring human review.';
comment on column public.sales_growth_contacts.verification_status is 'Public means found on a public source; verified requires a separate validation step.';
comment on table public.sales_growth_emails is 'Human-approved outbound email drafts and delivery history.';
