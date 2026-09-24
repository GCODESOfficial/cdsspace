-- Browser push subscriptions, so a notification reaches someone whose browser
-- is closed.
--
-- Until now a notification only existed inside the app: the bell was polled
-- while a dashboard tab was open, so anyone who had closed the site learned
-- nothing until they came back. A push subscription is the browser's own
-- delivery address, held by the push service (Apple, Google, Mozilla), which
-- wakes the service worker and shows the notice on the device.

begin;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  -- Who this device belongs to. Actor ids live in different tables per portal,
  -- so the pair is the identity, not a foreign key.
  actor_kind text not null check (actor_kind in ('team', 'client', 'admin')),
  actor_id text not null,
  -- The push service URL for this browser. Unique: re-subscribing the same
  -- browser must update its row, never add a second one.
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- Consecutive delivery failures. A subscription the push service rejects as
  -- gone is deleted outright; this covers the softer failures.
  failure_count integer not null default 0
);

comment on table public.push_subscriptions is
  'Browser push endpoints, one per device, used to deliver notifications when the site is closed.';

create index if not exists push_subscriptions_actor_idx
  on public.push_subscriptions (actor_kind, actor_id);

-- Server-side only: the service role reads and writes it.
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

commit;
