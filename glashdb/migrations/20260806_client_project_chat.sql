-- Client access to project group chat.
-- Clients are explicit participants: owning a project alone does not expose its
-- chat history until an admin adds the client to that project conversation.

create extension if not exists "pgcrypto";

create table if not exists public.team_chat_client_participants (
  thread_id uuid not null references public.team_chat_threads(id) on delete cascade,
  client_user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  added_by text,
  primary key (thread_id, client_user_id)
);

create index if not exists idx_team_chat_client_participants_client
  on public.team_chat_client_participants(client_user_id, joined_at desc);

alter table public.team_chat_messages
  add column if not exists client_user_id uuid references public.profiles(id) on delete set null;

create index if not exists idx_team_chat_messages_client_sender
  on public.team_chat_messages(client_user_id, created_at desc)
  where client_user_id is not null;

alter table public.team_chat_client_participants enable row level security;

drop policy if exists allow_all_team_chat_client_participants
  on public.team_chat_client_participants
;
drop policy if exists "Clients can read own project chat membership"
  on public.team_chat_client_participants;
create policy "Clients can read own project chat membership"
  on public.team_chat_client_participants for select
  using (client_user_id = auth.uid());

revoke insert, update, delete on public.team_chat_client_participants from authenticated;
grant select on public.team_chat_client_participants to authenticated;
