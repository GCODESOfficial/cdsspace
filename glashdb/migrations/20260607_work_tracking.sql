-- CDS Space Work Tracking System.
--
-- GlashDB-backed productivity intelligence, screenshot metadata,
-- AI summaries, weekly employee-report comparison, retention metadata,
-- and management access audit logs.

create extension if not exists "pgcrypto";

create table if not exists public.team_work_tracking_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default true,
  capture_interval_seconds integer not null default 300 check (capture_interval_seconds between 60 and 1800),
  screenshot_retention_days integer not null default 7 check (screenshot_retention_days between 1 and 30),
  idle_threshold_seconds integer not null default 180 check (idle_threshold_seconds between 30 and 1800),
  admin_only boolean not null default true,
  approved_sub_admin_permissions text[] not null default array['work_tracking.view'],
  privacy_notice text not null default 'Screen tracking requires team member consent and browser screen-sharing permission. Raw screenshots are retained for 7 days; summaries, metadata, and audit logs are retained for management reporting.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.team_work_tracking_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.team_work_tracking_sessions (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  time_entry_id uuid references public.team_time_entries(id) on delete set null,
  work_date date not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'active' check (status in ('active','paused','stopped')),
  pause_reason text,
  capture_interval_seconds integer not null default 300,
  idle_seconds integer not null default 0,
  active_seconds integer not null default 0,
  screenshot_count integer not null default 0,
  last_capture_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_work_tracking_snapshots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.team_work_tracking_sessions(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  time_entry_id uuid references public.team_time_entries(id) on delete set null,
  work_date date not null,
  captured_at timestamptz not null default now(),
  local_captured_at timestamptz,
  active_app text,
  page_title text,
  page_url text,
  project_hint text,
  activity_state text not null default 'active' check (activity_state in ('active','idle','break')),
  idle_seconds integer not null default 0,
  screenshot_storage_path text,
  thumbnail_storage_path text,
  screenshot_sha256 text,
  expires_at timestamptz not null default (now() + interval '7 days'),
  ai_status text not null default 'pending' check (ai_status in ('pending','analyzed','failed')),
  ai_summary text,
  ai_categories text[] not null default '{}',
  detected_apps text[] not null default '{}',
  detected_websites text[] not null default '{}',
  detected_projects text[] not null default '{}',
  detected_deliverables text[] not null default '{}',
  productivity_score numeric(5,2),
  focus_score numeric(5,2),
  confidence numeric(5,2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.team_work_tracking_daily_reports (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  work_date date not null,
  active_minutes integer not null default 0,
  idle_minutes integer not null default 0,
  meeting_minutes integer not null default 0,
  focus_score numeric(5,2) not null default 0,
  productivity_score numeric(5,2) not null default 0,
  consistency_score numeric(5,2) not null default 0,
  collaboration_score numeric(5,2) not null default 0,
  attendance_score numeric(5,2) not null default 0,
  reliability_score numeric(5,2) not null default 0,
  overall_score numeric(5,2) not null default 0,
  most_used_apps jsonb not null default '[]'::jsonb,
  time_by_category jsonb not null default '{}'::jsonb,
  time_by_project jsonb not null default '{}'::jsonb,
  deliverables text[] not null default '{}',
  summary text,
  strengths text[] not null default '{}',
  concerns text[] not null default '{}',
  manager_recommendations text[] not null default '{}',
  hidden_achievements text[] not null default '{}',
  ai_model text,
  ai_status text not null default 'pending' check (ai_status in ('pending','generated','failed')),
  generated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_member_id, work_date)
);

create table if not exists public.team_work_tracking_weekly_reports (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  summary text,
  project_contributions jsonb not null default '{}'::jsonb,
  attendance_summary jsonb not null default '{}'::jsonb,
  application_usage jsonb not null default '{}'::jsonb,
  workload_trends jsonb not null default '{}'::jsonb,
  strengths text[] not null default '{}',
  concerns text[] not null default '{}',
  burnout_risk text not null default 'low' check (burnout_risk in ('low','medium','high')),
  underutilization_risk text not null default 'low' check (underutilization_risk in ('low','medium','high')),
  overall_score numeric(5,2) not null default 0,
  scorecard jsonb not null default '{}'::jsonb,
  ai_status text not null default 'pending' check (ai_status in ('pending','generated','failed')),
  generated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_member_id, week_start)
);

alter table public.team_work_tracking_weekly_reports
  add column if not exists overall_score numeric(5,2) not null default 0;

create table if not exists public.team_work_tracking_self_reports (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  tasks_completed text,
  challenges text,
  wins text,
  goals_next_week text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_member_id, week_start)
);

create table if not exists public.team_work_tracking_report_comparisons (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  self_report_id uuid references public.team_work_tracking_self_reports(id) on delete set null,
  weekly_report_id uuid references public.team_work_tracking_weekly_reports(id) on delete set null,
  matches text[] not null default '{}',
  omissions text[] not null default '{}',
  additional_detected_work text[] not null default '{}',
  discrepancies text[] not null default '{}',
  confidence_score numeric(5,2) not null default 0,
  ai_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_member_id, week_start)
);

create table if not exists public.team_work_tracking_report_access_log (
  id uuid primary key default gen_random_uuid(),
  actor_kind text not null default 'admin' check (actor_kind in ('admin','team','system')),
  actor_id text,
  actor_name text,
  team_member_id uuid references public.team_members(id) on delete set null,
  report_type text not null,
  report_id uuid,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_work_tracking_sessions_member_date
  on public.team_work_tracking_sessions (team_member_id, work_date desc);
create index if not exists idx_work_tracking_sessions_status
  on public.team_work_tracking_sessions (status, started_at desc);
create index if not exists idx_work_tracking_snapshots_member_date
  on public.team_work_tracking_snapshots (team_member_id, work_date desc, captured_at desc);
create index if not exists idx_work_tracking_snapshots_session
  on public.team_work_tracking_snapshots (session_id, captured_at desc);
create index if not exists idx_work_tracking_snapshots_expires
  on public.team_work_tracking_snapshots (expires_at)
  where screenshot_storage_path is not null;
create index if not exists idx_work_tracking_daily_reports_date
  on public.team_work_tracking_daily_reports (work_date desc, overall_score desc);
create index if not exists idx_work_tracking_weekly_reports_week
  on public.team_work_tracking_weekly_reports (week_start desc, overall_score desc);
create index if not exists idx_work_tracking_access_log_created
  on public.team_work_tracking_report_access_log (created_at desc);

create or replace function public.touch_work_tracking_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_work_tracking_settings_touch on public.team_work_tracking_settings;
create trigger trg_work_tracking_settings_touch
  before update on public.team_work_tracking_settings
  for each row execute function public.touch_work_tracking_updated_at();

drop trigger if exists trg_work_tracking_sessions_touch on public.team_work_tracking_sessions;
create trigger trg_work_tracking_sessions_touch
  before update on public.team_work_tracking_sessions
  for each row execute function public.touch_work_tracking_updated_at();

drop trigger if exists trg_work_tracking_daily_reports_touch on public.team_work_tracking_daily_reports;
create trigger trg_work_tracking_daily_reports_touch
  before update on public.team_work_tracking_daily_reports
  for each row execute function public.touch_work_tracking_updated_at();

drop trigger if exists trg_work_tracking_weekly_reports_touch on public.team_work_tracking_weekly_reports;
create trigger trg_work_tracking_weekly_reports_touch
  before update on public.team_work_tracking_weekly_reports
  for each row execute function public.touch_work_tracking_updated_at();

drop trigger if exists trg_work_tracking_self_reports_touch on public.team_work_tracking_self_reports;
create trigger trg_work_tracking_self_reports_touch
  before update on public.team_work_tracking_self_reports
  for each row execute function public.touch_work_tracking_updated_at();

drop trigger if exists trg_work_tracking_comparisons_touch on public.team_work_tracking_report_comparisons;
create trigger trg_work_tracking_comparisons_touch
  before update on public.team_work_tracking_report_comparisons
  for each row execute function public.touch_work_tracking_updated_at();

do $$
declare
  t text;
  work_tracking_tables text[] := array[
    'team_work_tracking_settings',
    'team_work_tracking_sessions',
    'team_work_tracking_snapshots',
    'team_work_tracking_daily_reports',
    'team_work_tracking_weekly_reports',
    'team_work_tracking_self_reports',
    'team_work_tracking_report_comparisons',
    'team_work_tracking_report_access_log'
  ];
begin
  foreach t in array work_tracking_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'allow_all_' || t, t);
    execute format(
      'create policy %I on public.%I for all using (true) with check (true)',
      'allow_all_' || t,
      t
    );
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated, service_role', t);
  end loop;
end $$;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'work-tracking-screenshots',
      'work-tracking-screenshots',
      false,
      5242880,
      array['image/jpeg','image/png','image/webp']
    )
    on conflict (id) do update set
      public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

comment on table public.team_work_tracking_snapshots is
  'Screen-capture metadata and AI tags for active team work sessions. Raw screenshot paths expire after the configured retention period.';
comment on table public.team_work_tracking_daily_reports is
  'Permanent daily AI/fallback productivity summaries generated from work tracking snapshots and attendance data.';
comment on table public.team_work_tracking_report_access_log is
  'Privacy audit log for management access to work tracking reports and retained screenshot metadata.';
