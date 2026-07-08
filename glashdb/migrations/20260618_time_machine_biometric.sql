-- CDS Space Time Machine Portal - ZKTeco fingerprint attendance.
--
-- A standalone biometric attendance stack, intentionally separate from the
-- geofence/face `team_time_entries` timebook. A USB ZKTeco reader at an admin
-- kiosk enrolls fingerprints and drives 1:N check-in / check-out scans.
--
-- We store ZKTeco *templates* (compact minutiae blobs, base64) - never raw
-- fingerprint images. Templates are matched on the local bridge agent, which
-- owns the ZKFinger SDK; this database is the source of truth for templates,
-- daily attendance, and the immutable scan audit trail used for performance.

create extension if not exists "pgcrypto";

-- ─────────────── Enrolled fingerprints ───────────────
-- One row per (member, finger). A member may enrol several fingers so a cut
-- or bandaged thumb doesn't lock them out. `template` is the ZKTeco blob the
-- bridge matches against; it is admin-only and never exposed to team members.
create table if not exists public.team_fingerprints (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  finger_label text not null default 'right_thumb' check (finger_label in (
    'right_thumb','right_index','right_middle','right_ring','right_little',
    'left_thumb','left_index','left_middle','left_ring','left_little'
  )),
  template text not null,
  template_format text not null default 'zk',
  quality integer,
  device_label text,
  enrolled_by text,
  enrolled_by_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_fingerprints_member_finger_unique unique (team_member_id, finger_label)
);

create index if not exists team_fingerprints_member_idx on public.team_fingerprints(team_member_id);
create index if not exists team_fingerprints_active_idx on public.team_fingerprints(is_active) where is_active;

-- ─────────────── Daily biometric attendance ───────────────
-- One row per member per Lagos work-date. Mirrors the scoring shape of
-- team_time_entries (attendance_status + scores jsonb) so the performance
-- numbers read consistently, but is fed exclusively by fingerprint scans.
create table if not exists public.biometric_attendance (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  work_date date not null,
  check_in_at timestamptz,
  check_out_at timestamptz,
  attendance_status text not null default 'absent' check (attendance_status in (
    'early','on_time','late','half_day','absent','approved_leave'
  )),
  total_work_minutes integer not null default 0,
  overtime_minutes integer not null default 0,
  early_logout boolean not null default false,
  check_in_finger text,
  check_out_finger text,
  check_in_quality integer,
  check_out_quality integer,
  check_in_match_score numeric(6,2),
  check_out_match_score numeric(6,2),
  check_in_device text,
  check_out_device text,
  check_in_by text,        -- operator (admin) who ran the station at check-in
  check_out_by text,
  scores jsonb not null default '{}'::jsonb,
  flags text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint biometric_attendance_member_date_unique unique (team_member_id, work_date)
);

create index if not exists biometric_attendance_member_idx on public.biometric_attendance(team_member_id);
create index if not exists biometric_attendance_date_idx on public.biometric_attendance(work_date);

-- ─────────────── Scan audit trail ───────────────
-- Append-only log of every scan the station processes - successful in/out,
-- enrollment captures, and failed 1:N identifications. This is the raw record
-- that backs dispute resolution and the "who scanned when" booklet history.
create table if not exists public.biometric_attendance_events (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid references public.team_members(id) on delete set null,
  event_type text not null check (event_type in (
    'enroll','unenroll','check_in','check_out','identify_failed','duplicate_scan','correction'
  )),
  work_date date not null,
  finger_label text,
  match_score numeric(6,2),
  quality integer,
  device_label text,
  operator_email text,
  operator_name text,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists biometric_events_member_idx on public.biometric_attendance_events(team_member_id);
create index if not exists biometric_events_date_idx on public.biometric_attendance_events(work_date);
create index if not exists biometric_events_type_idx on public.biometric_attendance_events(event_type);
