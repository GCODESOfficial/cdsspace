-- Threaded clarification messages for pending team leave requests.
-- Decisions remain on team_leave_requests; this table only records the
-- auditable conversation that happens before approval or rejection.

create extension if not exists pgcrypto;

create table if not exists public.team_leave_clarification_messages (
  id uuid primary key default gen_random_uuid(),
  leave_request_id uuid not null references public.team_leave_requests(id) on delete cascade,
  sender_type text not null check (sender_type in ('admin', 'team_member')),
  sender_member_id uuid references public.team_members(id) on delete set null,
  sender_label text,
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  created_at timestamptz not null default now(),
  check (
    (sender_type = 'team_member' and sender_member_id is not null)
    or sender_type = 'admin'
  )
);

create index if not exists team_leave_clarification_leave_created_idx
  on public.team_leave_clarification_messages(leave_request_id, created_at asc);

alter table public.team_leave_clarification_messages enable row level security;

drop policy if exists allow_all_team_leave_clarification_messages
  on public.team_leave_clarification_messages;

revoke all on public.team_leave_clarification_messages from anon, authenticated;
grant select, insert, update, delete on public.team_leave_clarification_messages to service_role;

comment on table public.team_leave_clarification_messages is
  'Auditable admin and team-member clarification thread attached to a leave request.';
