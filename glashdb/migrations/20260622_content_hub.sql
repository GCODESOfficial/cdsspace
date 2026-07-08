-- CDS Space Content Hub - AI-powered content planning, creation & scheduling.
--
-- A centralized content command center. Content is created (manually, by AI,
-- from an uploaded image, or from a video), enhanced, given a CTA + media,
-- scheduled to an internal calendar, and routed to the CRP / Social Media
-- Manager for posting. Content Hub never publishes to social platforms itself -
-- it prepares, approves, schedules, and packages content for a human publisher.
--
-- Idempotent: safe to rerun (create ... if not exists throughout).

create extension if not exists "pgcrypto";

-- ─────────────── Content items ───────────────
-- One row per content piece. `status` drives the lifecycle:
--   draft → pending → approved → scheduled → published → archived/deleted.
create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  -- how the content was originated, for analytics + the wizard's Step 1.
  source text not null default 'manual'
    check (source in ('manual','ai','image','video','bsd')),
  category text,
  content_type text,                       -- Marketing, BSD, Hiring, Case Study, ...
  platforms text[] not null default '{}',  -- instagram, linkedin, facebook, x, whatsapp, website
  -- Call to action
  cta_label text,
  cta_url text,
  cta_type text,                           -- lead_gen, bsd, hiring, internship, custom
  hashtags text[] not null default '{}',
  -- Lifecycle
  status text not null default 'draft'
    check (status in ('draft','pending','approved','scheduled','published','archived','deleted')),
  -- Scheduling
  scheduled_at timestamptz,
  scheduled_platform text,
  assigned_publisher_id uuid references public.team_members(id) on delete set null,
  assigned_publisher_name text,
  -- Organisation
  campaign text,
  series text,
  tags text[] not null default '{}',
  ai_meta jsonb not null default '{}'::jsonb,  -- generation params + variations
  -- Performance (recorded by the publisher after posting)
  posted_url text,
  performance_notes text,
  reach integer,
  engagement integer,
  leads integer,
  published_at timestamptz,
  -- Audit
  created_by text,
  created_by_id text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_items_status_idx on public.content_items(status);
create index if not exists content_items_scheduled_idx on public.content_items(scheduled_at);
create index if not exists content_items_type_idx on public.content_items(content_type);
create index if not exists content_items_publisher_idx on public.content_items(assigned_publisher_id);
create index if not exists content_items_created_idx on public.content_items(created_at desc);

-- ─────────────── Media attachments ───────────────
-- Images / videos / PDFs / docs and AI-produced clips, in display order.
create table if not exists public.content_media (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_items(id) on delete cascade,
  url text not null,
  kind text not null default 'image'
    check (kind in ('image','video','pdf','document','clip')),
  file_name text,
  mime_type text,
  size_bytes bigint,
  thumbnail_url text,
  position integer not null default 0,
  meta jsonb not null default '{}'::jsonb,  -- clip type / start / end / duration
  created_at timestamptz not null default now()
);

create index if not exists content_media_content_idx on public.content_media(content_id, position);

-- ─────────────── Posting reminders ───────────────
-- For each scheduled item we fan out reminders (24h / 1h / 15m / due). A cron
-- worker fires anything where sent_at is null and fire_at has passed, then
-- stamps sent_at so it never double-fires.
create table if not exists public.content_reminders (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_items(id) on delete cascade,
  offset_label text not null,              -- '24h','1h','15m','due'
  fire_at timestamptz not null,
  sent_at timestamptz,
  channels text[] not null default '{dashboard}',  -- dashboard,email,whatsapp,push
  created_at timestamptz not null default now()
);

create index if not exists content_reminders_pending_idx
  on public.content_reminders(fire_at) where sent_at is null;
create index if not exists content_reminders_content_idx on public.content_reminders(content_id);

-- ─────────────── Hub settings (singleton) ───────────────
-- Branding presets used by BSD Studio + default reminder behaviour.
create table if not exists public.content_settings (
  id integer primary key default 1 check (id = 1),
  branding jsonb not null default '{}'::jsonb,  -- logo, watermark, intro, outro, fonts, colors
  reminder_offsets text[] not null default '{24h,1h,15m,due}',
  reminder_channels text[] not null default '{dashboard,email}',
  default_publisher_id uuid references public.team_members(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.content_settings (id) values (1)
on conflict (id) do nothing;

-- ─────────────── BSD AI clip jobs ───────────────
-- Records an AI video-repurposing request (cut 1 long video into 5/10/20 short
-- branded clips). The rendering pipeline runs out-of-band; this row is the
-- job's source of truth and tracks its status + produced clip metadata.
create table if not exists public.content_clip_jobs (
  id uuid primary key default gen_random_uuid(),
  content_id uuid references public.content_items(id) on delete set null,
  source_url text not null,
  requested_clips integer not null default 5,
  clip_types text[] not null default '{}',  -- highlight, quote, key_lesson, cta, founder_insight, bsd_insight
  branding jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued','processing','done','failed')),
  result jsonb not null default '{}'::jsonb, -- produced clips (url, type, start, end)
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_clip_jobs_status_idx on public.content_clip_jobs(status);
create index if not exists content_clip_jobs_content_idx on public.content_clip_jobs(content_id);
