begin;

create extension if not exists "pgcrypto";

create table if not exists public.deal_prospects (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'potential_client'
    check (category in ('potential_client', 'investor', 'influencer', 'industry_leader')),
  display_name text not null,
  company_name text,
  website text,
  social_url text,
  email text,
  phone text,
  location text,
  notes text,
  next_action text,
  follow_up_at timestamptz,
  status text not null default 'to_research'
    check (status in ('to_research', 'ready', 'contacted', 'follow_up', 'converted', 'not_relevant')),
  created_by text not null,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deal_prospects_follow_up_idx
  on public.deal_prospects (status, follow_up_at, updated_at desc);
create index if not exists deal_prospects_category_idx
  on public.deal_prospects (category, status, updated_at desc);

create table if not exists public.deal_brand_audits (
  id uuid primary key default gen_random_uuid(),
  public_token uuid not null default gen_random_uuid() unique,
  prospect_id uuid references public.deal_prospects(id) on delete set null,
  brand_name text not null,
  target_url text not null,
  social_url text,
  status text not null default 'draft'
    check (status in ('draft', 'generated', 'reviewed', 'archived')),
  overall_score integer check (overall_score between 0 and 100),
  content jsonb not null default '{}'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  created_by text not null,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deal_brand_audits_updated_idx
  on public.deal_brand_audits (status, updated_at desc);

create table if not exists public.deal_proposals (
  id uuid primary key default gen_random_uuid(),
  public_token uuid not null default gen_random_uuid() unique,
  prospect_id uuid references public.deal_prospects(id) on delete set null,
  audit_id uuid references public.deal_brand_audits(id) on delete set null,
  brand_name text not null,
  target_url text,
  social_url text,
  recipient_email text,
  focus_area text not null,
  title text not null,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'sent', 'accepted', 'declined', 'archived')),
  cover_storage_path text,
  cover_mime_type text,
  content jsonb not null default '{}'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  email_subject text,
  sent_at timestamptz,
  created_by text not null,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deal_proposals_updated_idx
  on public.deal_proposals (status, updated_at desc);
create index if not exists deal_proposals_recipient_idx
  on public.deal_proposals (lower(recipient_email), updated_at desc)
  where nullif(btrim(recipient_email), '') is not null;

alter table public.deal_prospects enable row level security;
alter table public.deal_brand_audits enable row level security;
alter table public.deal_proposals enable row level security;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'deals-assets',
      'deals-assets',
      false,
      10485760,
      array['image/jpeg', 'image/png', 'image/webp']::text[]
    )
    on conflict (id) do update
      set public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types,
          updated_at = now();
  end if;
end $$;

comment on table public.deal_prospects is
  'Admin-managed prospect follow-up checklist for potential clients, investors, influencers, and industry leaders.';
comment on table public.deal_brand_audits is
  'Source-backed automated brand assessments generated from publicly accessible evidence.';
comment on table public.deal_proposals is
  'Editable, source-backed CDS Space proposals with stable tokenised sharing and optional private A4 cover artwork.';
comment on column public.deal_proposals.content is
  'Editable proposal sections, metrics, deliverables, expected outcomes, timeline, and next step.';

commit;
