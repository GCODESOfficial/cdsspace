-- Batches rapid notification emails into one summary.
--
-- Every notification emailed the recipient the moment it was raised, so a busy
-- chat or taskboard hour filled an inbox with near-identical messages. The
-- first notice still goes out at once; anything raised in the ten minutes after
-- it collects here and is sent as a single summary, so nothing is lost and
-- nobody is flooded. Device push stays immediate either way.

begin;

create table if not exists public.notification_email_batches (
  id uuid primary key default gen_random_uuid(),
  actor_kind text not null check (actor_kind in ('team', 'client', 'admin')),
  actor_id text not null,
  recipient_email text not null,
  title text not null,
  body text,
  link text,
  kind text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

comment on table public.notification_email_batches is
  'Notification emails held back during a recipient quiet window, sent together as one summary.';

create index if not exists notification_email_batches_pending_idx
  on public.notification_email_batches (actor_kind, actor_id, created_at)
  where sent_at is null;

-- When each recipient last received a notification email. This is what opens
-- and closes the ten minute window.
create table if not exists public.notification_email_windows (
  actor_kind text not null,
  actor_id text not null,
  last_sent_at timestamptz not null default now(),
  primary key (actor_kind, actor_id)
);

alter table public.notification_email_batches enable row level security;
alter table public.notification_email_windows enable row level security;
revoke all on public.notification_email_batches from anon, authenticated;
revoke all on public.notification_email_windows from anon, authenticated;

commit;
