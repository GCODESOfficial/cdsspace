-- CDS Space GlashDB: advanced team + client chat primitives.
-- Idempotent; safe to rerun on GlashDB.

create extension if not exists "pgcrypto";

-- Thread governance --------------------------------------------------------
alter table public.team_chat_threads
  add column if not exists visibility text not null default 'private',
  add column if not exists description text,
  add column if not exists rules text,
  add column if not exists permissions jsonb not null default '{}'::jsonb,
  add column if not exists settings jsonb not null default '{}'::jsonb,
  add column if not exists invite_code text,
  add column if not exists is_announcement_only boolean not null default false,
  add column if not exists is_voice_room boolean not null default false,
  add column if not exists is_voice_channel boolean not null default false,
  add column if not exists pinned_message_id uuid references public.team_chat_messages(id) on delete set null,
  add column if not exists last_message_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'team_chat_threads_visibility_check'
      and conrelid = 'public.team_chat_threads'::regclass
  ) then
    alter table public.team_chat_threads
      add constraint team_chat_threads_visibility_check
      check (visibility in ('public', 'private', 'invite_only'));
  end if;
end $$;

update public.team_chat_threads
set invite_code = lower(substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 10))
where invite_code is null;

create unique index if not exists idx_team_chat_threads_invite_code
  on public.team_chat_threads(invite_code)
  where invite_code is not null;
create index if not exists idx_team_chat_threads_visibility on public.team_chat_threads(visibility);
create index if not exists idx_team_chat_threads_last_message on public.team_chat_threads(last_message_at desc);

-- Participant presence, roles, permissions --------------------------------
alter table public.team_chat_participants
  add column if not exists role text not null default 'member',
  add column if not exists permissions jsonb not null default '{}'::jsonb,
  add column if not exists muted_until timestamptz,
  add column if not exists notification_level text not null default 'all',
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_typing_at timestamptz,
  add column if not exists joined_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'team_chat_participants_role_check'
      and conrelid = 'public.team_chat_participants'::regclass
  ) then
    alter table public.team_chat_participants
      add constraint team_chat_participants_role_check
      check (role in ('owner', 'admin', 'moderator', 'member', 'viewer'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'team_chat_participants_notification_check'
      and conrelid = 'public.team_chat_participants'::regclass
  ) then
    alter table public.team_chat_participants
      add constraint team_chat_participants_notification_check
      check (notification_level in ('all', 'mentions', 'silent'));
  end if;
end $$;

create index if not exists idx_team_chat_participants_role on public.team_chat_participants(role);
create index if not exists idx_team_chat_participants_typing on public.team_chat_participants(thread_id, last_typing_at desc);

-- Message controls ---------------------------------------------------------
alter table public.team_chat_messages
  add column if not exists message_type text not null default 'text',
  add column if not exists delivery_status text not null default 'sent',
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by text,
  add column if not exists starred_by jsonb not null default '[]'::jsonb,
  add column if not exists bookmarked_by jsonb not null default '[]'::jsonb,
  add column if not exists scheduled_for timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists thread_root_id uuid references public.team_chat_messages(id) on delete set null,
  add column if not exists translated jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists audio_url text,
  add column if not exists audio_duration_seconds integer,
  add column if not exists voice_transcript text,
  add column if not exists file_name text,
  add column if not exists file_size_bytes bigint,
  add column if not exists mime_type text;

alter table public.chat_messages
  add column if not exists message_type text not null default 'text',
  add column if not exists delivery_status text not null default 'sent',
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by text,
  add column if not exists starred_by jsonb not null default '[]'::jsonb,
  add column if not exists bookmarked_by jsonb not null default '[]'::jsonb,
  add column if not exists scheduled_for timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists reply_to_message_id uuid references public.chat_messages(id) on delete set null,
  add column if not exists thread_root_id uuid references public.chat_messages(id) on delete set null,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists translated jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists audio_url text,
  add column if not exists audio_duration_seconds integer,
  add column if not exists voice_transcript text,
  add column if not exists file_name text,
  add column if not exists file_size_bytes bigint,
  add column if not exists mime_type text;

update public.team_chat_messages set sent_at = created_at where sent_at is null;
update public.chat_messages set sent_at = created_at where sent_at is null;

create index if not exists idx_team_chat_messages_pinned on public.team_chat_messages(thread_id, pinned_at desc) where pinned_at is not null;
create index if not exists idx_team_chat_messages_starred on public.team_chat_messages using gin (starred_by);
create index if not exists idx_team_chat_messages_bookmarked on public.team_chat_messages using gin (bookmarked_by);
create index if not exists idx_team_chat_messages_scheduled on public.team_chat_messages(scheduled_for) where scheduled_for is not null;
create index if not exists idx_team_chat_messages_thread_root on public.team_chat_messages(thread_root_id);
create index if not exists idx_chat_messages_pinned on public.chat_messages(room_id, pinned_at desc) where pinned_at is not null;
create index if not exists idx_chat_messages_starred on public.chat_messages using gin (starred_by);
create index if not exists idx_chat_messages_bookmarked on public.chat_messages using gin (bookmarked_by);
create index if not exists idx_chat_messages_reply_to on public.chat_messages(reply_to_message_id);

-- Receipts, bookmarks, pins ------------------------------------------------
create table if not exists public.team_chat_message_receipts (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.team_chat_messages(id) on delete cascade,
  thread_id uuid not null references public.team_chat_threads(id) on delete cascade,
  viewer_key text not null,
  viewer_kind text not null default 'team',
  team_member_id uuid references public.team_members(id) on delete cascade,
  delivered_at timestamptz,
  read_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (message_id, viewer_key)
);

create table if not exists public.chat_message_receipts (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  room_id text not null,
  viewer_key text not null,
  viewer_kind text not null default 'client',
  delivered_at timestamptz,
  read_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (message_id, viewer_key)
);

create table if not exists public.team_chat_message_bookmarks (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.team_chat_messages(id) on delete cascade,
  thread_id uuid not null references public.team_chat_threads(id) on delete cascade,
  viewer_key text not null,
  note text,
  created_at timestamptz not null default now(),
  unique (message_id, viewer_key)
);

create table if not exists public.chat_message_bookmarks (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  room_id text not null,
  viewer_key text not null,
  note text,
  created_at timestamptz not null default now(),
  unique (message_id, viewer_key)
);

create table if not exists public.team_chat_pins (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.team_chat_threads(id) on delete cascade,
  message_id uuid not null references public.team_chat_messages(id) on delete cascade,
  pinned_by text not null,
  pinned_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (thread_id, message_id)
);

create table if not exists public.chat_message_pins (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  pinned_by text not null,
  pinned_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (room_id, message_id)
);

create index if not exists idx_team_chat_receipts_thread on public.team_chat_message_receipts(thread_id, viewer_key);
create index if not exists idx_chat_receipts_room on public.chat_message_receipts(room_id, viewer_key);
create index if not exists idx_team_chat_bookmarks_viewer on public.team_chat_message_bookmarks(viewer_key, created_at desc);
create index if not exists idx_chat_bookmarks_viewer on public.chat_message_bookmarks(viewer_key, created_at desc);

-- Group collaboration ------------------------------------------------------
create table if not exists public.team_chat_join_requests (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.team_chat_threads(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  unique (thread_id, team_member_id)
);

create table if not exists public.team_chat_polls (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.team_chat_threads(id) on delete cascade,
  message_id uuid references public.team_chat_messages(id) on delete set null,
  question text not null,
  options jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  closes_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.team_chat_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.team_chat_polls(id) on delete cascade,
  option_key text not null,
  voter_key text not null,
  created_at timestamptz not null default now(),
  unique (poll_id, voter_key, option_key)
);

create table if not exists public.team_chat_events (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.team_chat_threads(id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  meeting_url text,
  created_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.team_chat_files (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.team_chat_threads(id) on delete cascade,
  message_id uuid references public.team_chat_messages(id) on delete set null,
  project_id uuid references public.finance_projects(id) on delete set null,
  invoice_id uuid references public.finance_invoices(id) on delete set null,
  file_url text not null,
  file_name text,
  mime_type text,
  file_size_bytes bigint,
  folder text,
  version integer not null default 1,
  approval_status text not null default 'draft',
  permissions jsonb not null default '{}'::jsonb,
  uploaded_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.team_chat_call_sessions (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.team_chat_threads(id) on delete set null,
  cmeet_room_code text,
  call_type text not null default 'video',
  title text,
  status text not null default 'scheduled',
  started_by text,
  started_at timestamptz,
  ended_at timestamptz,
  recording_url text,
  transcript text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.team_chat_call_participants (
  id uuid primary key default gen_random_uuid(),
  call_session_id uuid not null references public.team_chat_call_sessions(id) on delete cascade,
  participant_key text not null,
  joined_at timestamptz,
  left_at timestamptz,
  role text,
  unique (call_session_id, participant_key)
);

create table if not exists public.team_chat_tasks (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.team_chat_threads(id) on delete set null,
  project_id uuid references public.finance_projects(id) on delete cascade,
  source_message_id uuid references public.team_chat_messages(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'not_started',
  priority text not null default 'medium',
  assignee_id uuid references public.team_members(id) on delete set null,
  due_date date,
  recurrence_rule text,
  dependency_task_id uuid references public.team_chat_tasks(id) on delete set null,
  progress integer not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_chat_ai_artifacts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.team_chat_threads(id) on delete cascade,
  room_id text,
  artifact_type text not null,
  title text,
  summary text,
  payload jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.team_chat_knowledge_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  category text not null default 'wiki',
  visibility text not null default 'team',
  tags text[] not null default '{}',
  version integer not null default 1,
  published_at timestamptz,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_chat_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_key text,
  actor_kind text,
  action text not null,
  resource_type text,
  resource_id text,
  thread_id uuid,
  room_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_team_chat_join_requests_thread on public.team_chat_join_requests(thread_id, status);
create index if not exists idx_team_chat_polls_thread on public.team_chat_polls(thread_id, created_at desc);
create index if not exists idx_team_chat_events_thread on public.team_chat_events(thread_id, starts_at);
create index if not exists idx_team_chat_files_thread on public.team_chat_files(thread_id, created_at desc);
create index if not exists idx_team_chat_files_project on public.team_chat_files(project_id, created_at desc);
create index if not exists idx_team_chat_calls_thread on public.team_chat_call_sessions(thread_id, created_at desc);
create index if not exists idx_team_chat_tasks_thread on public.team_chat_tasks(thread_id, status, due_date);
create index if not exists idx_team_chat_tasks_project on public.team_chat_tasks(project_id, status, due_date);
create index if not exists idx_team_chat_ai_thread on public.team_chat_ai_artifacts(thread_id, created_at desc);
create index if not exists idx_team_chat_knowledge_search
  on public.team_chat_knowledge_items using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, '')));
create index if not exists idx_team_chat_audit_resource on public.team_chat_audit_logs(resource_type, resource_id, created_at desc);

-- Lightweight notification preferences / device-security hooks -------------
create table if not exists public.team_chat_notification_rules (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  target_kind text not null default 'thread',
  target_id text not null,
  channel text not null default 'in_app',
  rule text not null default 'all',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_key, target_kind, target_id, channel)
);

create table if not exists public.team_chat_security_events (
  id uuid primary key default gen_random_uuid(),
  actor_key text,
  event_type text not null,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_team_chat_notification_owner on public.team_chat_notification_rules(owner_key, enabled);
create index if not exists idx_team_chat_security_actor on public.team_chat_security_events(actor_key, created_at desc);
