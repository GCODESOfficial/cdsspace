-- One escalation record per unanswered client-message streak.
-- The worker claims records before sending so overlapping cron runs cannot
-- email the support team twice for the same unanswered conversation.

create table if not exists public.client_chat_response_escalations (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  room_id text not null,
  client_message_at timestamptz not null,
  claimed_at timestamptz,
  sent_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_chat_response_escalations_message_unique unique (message_id),
  constraint client_chat_response_escalations_attempts_check check (attempts >= 0)
);

create index if not exists idx_client_chat_response_escalations_pending
  on public.client_chat_response_escalations (sent_at, claimed_at, client_message_at)
  where sent_at is null;

create index if not exists idx_chat_messages_unanswered_client
  on public.chat_messages (room_id, created_at)
  where sender_role = 'client';

create index if not exists idx_chat_messages_admin_reply
  on public.chat_messages (room_id, created_at)
  where sender_role = 'admin';

comment on table public.client_chat_response_escalations is
  'Idempotency and delivery audit for 30-minute unanswered client-chat email alerts.';

