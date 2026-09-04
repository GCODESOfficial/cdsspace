-- DAILY News Letter: a content item that carries an image is also emailed to
-- every registered client at the moment it publishes.
--
-- The flag defaults to true because the newsletter is on unless someone turns
-- it off. Eligibility is still decided at send time (an image must be attached,
-- and Word of the Day is never mailed), so the flag alone never sends anything.

begin;

alter table public.content_items
  add column if not exists newsletter_enabled boolean not null default true,
  -- Set the moment a send is claimed, so a retry or a second platform firing
  -- for the same item can never mail the client list twice.
  add column if not exists newsletter_sent_at timestamptz,
  add column if not exists newsletter_sent_count integer,
  add column if not exists newsletter_failed_count integer;

-- Who received which newsletter. Kept per recipient so "did this client get
-- it" is answerable without reading mail server logs.
create table if not exists public.content_newsletter_sends (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_items(id) on delete cascade,
  client_id text,
  email text not null,
  status text not null default 'sent',
  error text,
  created_at timestamptz not null default now()
);

create unique index if not exists content_newsletter_sends_unique
  on public.content_newsletter_sends (content_id, lower(email));
create index if not exists content_newsletter_sends_content_idx
  on public.content_newsletter_sends (content_id, created_at desc);

-- The worker asks for items that published but have not been mailed yet.
create index if not exists content_items_newsletter_pending_idx
  on public.content_items (published_at desc)
  where newsletter_enabled and newsletter_sent_at is null;

commit;
