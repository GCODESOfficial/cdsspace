-- CDS Space Intelligence platform
-- Expands the original publishing tables without discarding existing articles.

create extension if not exists "pgcrypto";

-- ─────────────── Publication model ───────────────
alter table if exists public.blog_authors
  add column if not exists role text,
  add column if not exists expertise text[] not null default '{}',
  add column if not exists contributor_type text not null default 'author',
  add column if not exists is_active boolean not null default true;

alter table if exists public.blog_posts
  add column if not exists publication_type text not null default 'Executive Insight',
  add column if not exists executive_summary text,
  add column if not exists country text,
  add column if not exists city text,
  add column if not exists industry text,
  add column if not exists company_analysed text,
  add column if not exists social_image_url text,
  add column if not exists social_title text,
  add column if not exists social_description text,
  add column if not exists canonical_url text,
  add column if not exists focus_keywords text[] not null default '{}',
  add column if not exists cta_type text not null default 'none',
  add column if not exists cta_text text,
  add column if not exists cta_url text,
  add column if not exists cta_supporting_line text,
  add column if not exists pdf_storage_path text,
  add column if not exists pdf_display_name text,
  add column if not exists pdf_page_count integer,
  add column if not exists pdf_access_mode text not null default 'view',
  add column if not exists executive_summary_storage_path text,
  add column if not exists video_url text,
  add column if not exists supporting_media jsonb not null default '[]'::jsonb,
  add column if not exists comments_enabled boolean not null default true,
  add column if not exists replies_enabled boolean not null default true,
  add column if not exists downloads_enabled boolean not null default false,
  add column if not exists printing_enabled boolean not null default false,
  add column if not exists view_count_enabled boolean not null default true,
  add column if not exists loves_count integer not null default 0,
  add column if not exists comments_count integer not null default 0,
  add column if not exists shares_count integer not null default 0,
  add column if not exists downloads_count integer not null default 0,
  add column if not exists cta_clicks integer not null default 0,
  add column if not exists unique_views integer not null default 0,
  add column if not exists featured boolean not null default false,
  add column if not exists access_level text not null default 'public',
  add column if not exists assigned_client_id uuid,
  add column if not exists access_expires_at timestamptz,
  add column if not exists private_token uuid not null default gen_random_uuid(),
  add column if not exists internal_notes text,
  add column if not exists report_status text not null default 'not_acknowledged',
  add column if not exists ai_assisted boolean not null default false,
  add column if not exists approval_status text not null default 'not_requested',
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text;

do $$
declare constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.blog_posts'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%'
    and pg_get_constraintdef(oid) ilike '%scheduled%'
  limit 1;
  if constraint_name is not null then
    execute format('alter table public.blog_posts drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.blog_posts
  add constraint blog_posts_status_intelligence_check
  check (status in ('draft','in_review','approved','scheduled','published','hidden','private','archived','deleted'));

do $$
declare constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.blog_post_reactions'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%value%'
  limit 1;
  if constraint_name is not null then
    execute format('alter table public.blog_post_reactions drop constraint %I', constraint_name);
  end if;
end $$;

update public.blog_post_reactions set value = 2 where value = -1;
update public.blog_posts set loves_count = greatest(loves_count, dislikes_count);
alter table public.blog_post_reactions
  add constraint blog_post_reactions_value_intelligence_check check (value in (1, 2));

alter table public.blog_posts drop constraint if exists blog_posts_pdf_access_mode_check;
alter table public.blog_posts add constraint blog_posts_pdf_access_mode_check
  check (pdf_access_mode in ('view','download','download_print'));
alter table public.blog_posts drop constraint if exists blog_posts_access_level_check;
alter table public.blog_posts add constraint blog_posts_access_level_check
  check (access_level in ('public','account','private_client','hidden'));

create index if not exists blog_posts_publication_type_idx on public.blog_posts (publication_type);
create index if not exists blog_posts_featured_idx on public.blog_posts (featured) where featured = true;
create index if not exists blog_posts_access_idx on public.blog_posts (access_level, assigned_client_id);
create index if not exists blog_posts_deleted_idx on public.blog_posts (deleted_at);
create index if not exists blog_posts_search_idx on public.blog_posts using gin
  (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(subtitle,'') || ' ' || coalesce(excerpt,'') || ' ' || coalesce(content,'')));

-- ─────────────── Editorial taxonomy and collections ───────────────
create table if not exists public.intelligence_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intelligence_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.intelligence_series (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  cover_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.intelligence_categories (name, slug, sort_order) values
  ('Brand Research', 'brand-research', 10),
  ('Brand Audits', 'brand-audits', 20),
  ('Industry Benchmarks', 'industry-benchmarks', 30),
  ('Market Intelligence', 'market-intelligence', 40),
  ('Customer Experience', 'customer-experience', 50),
  ('Digital Readiness', 'digital-readiness', 60),
  ('Executive Insights', 'executive-insights', 70),
  ('Case Studies', 'case-studies', 80)
on conflict (slug) do nothing;

-- ─────────────── Versioned private documents ───────────────
create table if not exists public.intelligence_document_versions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  version_number integer not null,
  storage_path text not null,
  display_name text not null,
  mime_type text not null default 'application/pdf',
  file_size bigint not null default 0,
  page_count integer,
  uploaded_by text,
  malware_scan_status text not null default 'local_scan_passed',
  created_at timestamptz not null default now(),
  unique(post_id, version_number)
);

create table if not exists public.intelligence_versions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  version_number integer not null,
  snapshot jsonb not null,
  change_summary text,
  created_by text,
  ai_assisted boolean not null default false,
  created_at timestamptz not null default now(),
  unique(post_id, version_number)
);

-- ─────────────── Discussion and moderation ───────────────
create table if not exists public.intelligence_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  user_id uuid not null,
  parent_id uuid references public.intelligence_comments(id) on delete cascade,
  body text not null,
  status text not null default 'approved' check (status in ('pending','approved','hidden','deleted')),
  likes_count integer not null default 0,
  reports_count integer not null default 0,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists intelligence_comments_post_idx on public.intelligence_comments (post_id, created_at);
create index if not exists intelligence_comments_status_idx on public.intelligence_comments (status, reports_count desc);

create table if not exists public.intelligence_comment_likes (
  comment_id uuid not null references public.intelligence_comments(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create table if not exists public.intelligence_comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.intelligence_comments(id) on delete cascade,
  user_id uuid not null,
  reason text,
  created_at timestamptz not null default now(),
  unique(comment_id, user_id)
);

create table if not exists public.intelligence_moderation_log (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid references public.intelligence_comments(id) on delete set null,
  action text not null,
  previous_status text,
  next_status text,
  reason text,
  actor_email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ─────────────── Analytics ───────────────
create table if not exists public.intelligence_events (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  user_id uuid,
  visitor_key text not null,
  session_key text,
  event_type text not null,
  event_value numeric,
  source text,
  country text,
  device text,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text,
  occurred_at timestamptz not null default now()
);
create unique index if not exists intelligence_events_dedupe_idx
  on public.intelligence_events (dedupe_key) where dedupe_key is not null;
create index if not exists intelligence_events_post_idx on public.intelligence_events (post_id, occurred_at desc);
create index if not exists intelligence_events_type_idx on public.intelligence_events (event_type, occurred_at desc);

-- ─────────────── Private assessment workflow ───────────────
create table if not exists public.intelligence_private_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  user_id uuid not null,
  acknowledged_at timestamptz not null default now(),
  ip_hash text,
  unique(post_id, user_id)
);

create table if not exists public.intelligence_assessment_requests (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.blog_posts(id) on delete set null,
  user_id uuid,
  name text not null,
  email text not null,
  company text,
  message text,
  request_type text not null default 'consultation',
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intelligence_settings (
  key text primary key,
  value jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);

insert into public.intelligence_settings (key, value) values
  ('comments', '{"defaultEnabled":true,"requireApproval":false,"maxLinks":2}'::jsonb),
  ('downloads', '{"defaultMode":"view","maxPdfBytes":78643200}'::jsonb),
  ('analytics', '{"dedupeMinutes":30,"retentionDays":730}'::jsonb),
  ('notifications', '{"newComment":true,"reportedComment":true,"privateReportOpened":true}'::jsonb)
on conflict (key) do nothing;

-- Documents stay private. Application routes issue short-lived signed URLs only
-- after access and publication policy checks.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('intelligence-documents', 'intelligence-documents', false, 78643200, array['application/pdf'])
    on conflict (id) do update
      set public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;
