-- CDS Space Team Time Management System.
--
-- Adds schedule profiles, attendance entries, location/device event logs,
-- leave requests, and attendance exception tracking.
-- Re-runnable: IF NOT EXISTS and idempotent indexes/policies.

create extension if not exists "pgcrypto";

alter table public.team_members
  add column if not exists work_mode text not null default 'onsite'
    check (work_mode in ('onsite','hybrid','remote','field_assignment','approved_leave'));

create table if not exists public.team_time_profiles (
  team_member_id uuid primary key references public.team_members(id) on delete cascade,
  work_mode text not null default 'onsite'
    check (work_mode in ('onsite','hybrid','remote','field_assignment','approved_leave')),
  hybrid_office_days int[] not null default '{}',
  flexible_break_enabled boolean not null default false,
  approved_location_note text,
  manager_note text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_time_entries (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  work_date date not null,
  work_mode text not null default 'onsite'
    check (work_mode in ('onsite','hybrid','remote','field_assignment','approved_leave')),
  office_required boolean not null default false,
  attendance_status text not null default 'absent'
    check (attendance_status in ('early','on_time','late','half_day','absent','approved_leave')),
  current_status text not null default 'offline'
    check (current_status in ('available','busy','in_meeting','on_break','offline')),
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  break_start_at timestamptz,
  break_end_at timestamptz,
  clock_in_lat numeric(10,7),
  clock_in_lng numeric(10,7),
  clock_in_accuracy numeric(10,2),
  clock_in_distance_meters numeric(10,2),
  clock_in_inside_geofence boolean,
  clock_out_lat numeric(10,7),
  clock_out_lng numeric(10,7),
  clock_out_accuracy numeric(10,2),
  clock_out_distance_meters numeric(10,2),
  clock_out_inside_geofence boolean,
  last_location_lat numeric(10,7),
  last_location_lng numeric(10,7),
  last_location_accuracy numeric(10,2),
  last_location_distance_meters numeric(10,2),
  last_location_inside_geofence boolean,
  last_location_at timestamptz,
  total_work_minutes integer not null default 0,
  overtime_minutes integer not null default 0,
  early_logout boolean not null default false,
  flags text[] not null default '{}',
  scores jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_member_id, work_date)
);

create table if not exists public.team_time_events (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references public.team_time_entries(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  event_type text not null
    check (event_type in ('clock_in','clock_out','break_start','break_end','status_update','location_ping','admin_correction')),
  work_date date not null,
  from_status text,
  to_status text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  accuracy numeric(10,2),
  distance_meters numeric(10,2),
  inside_geofence boolean,
  ip_address text,
  user_agent text,
  device_label text,
  flags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.team_leave_requests (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  leave_type text not null
    check (leave_type in ('annual','sick','emergency','compassionate','public_holiday','unpaid')),
  start_date date not null,
  end_date date not null,
  reason text,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_attendance_exceptions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references public.team_time_entries(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  work_date date not null,
  exception_type text not null
    check (exception_type in ('late_approval','early_logout_approval','remote_work_approval','hybrid_day_change','overtime_approval','manual_correction')),
  reason text,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  requested_by text,
  reviewed_by text,
  reviewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_team_time_entries_member_date
  on public.team_time_entries (team_member_id, work_date desc);

create index if not exists idx_team_time_entries_date_status
  on public.team_time_entries (work_date desc, attendance_status);

create index if not exists idx_team_time_events_member_created
  on public.team_time_events (team_member_id, created_at desc);

create index if not exists idx_team_leave_requests_status_dates
  on public.team_leave_requests (status, start_date, end_date);

create or replace function public.touch_team_time_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_team_time_profiles_touch on public.team_time_profiles;
create trigger trg_team_time_profiles_touch
  before update on public.team_time_profiles
  for each row execute function public.touch_team_time_updated_at();

drop trigger if exists trg_team_time_entries_touch on public.team_time_entries;
create trigger trg_team_time_entries_touch
  before update on public.team_time_entries
  for each row execute function public.touch_team_time_updated_at();

drop trigger if exists trg_team_leave_requests_touch on public.team_leave_requests;
create trigger trg_team_leave_requests_touch
  before update on public.team_leave_requests
  for each row execute function public.touch_team_time_updated_at();

drop trigger if exists trg_team_attendance_exceptions_touch on public.team_attendance_exceptions;
create trigger trg_team_attendance_exceptions_touch
  before update on public.team_attendance_exceptions
  for each row execute function public.touch_team_time_updated_at();

do $$
declare
  t text;
  timebook_tables text[] := array[
    'team_time_profiles',
    'team_time_entries',
    'team_time_events',
    'team_leave_requests',
    'team_attendance_exceptions'
  ];
begin
  foreach t in array timebook_tables loop
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

comment on table public.team_time_entries is
  'Daily attendance/timebook records for team members, including work mode, geofence status, work minutes, and productivity score placeholders.';
