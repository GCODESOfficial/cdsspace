-- Social auto-publishing for the Content Hub.
--
-- CDS Space connects its own brand accounts (LinkedIn first; Facebook,
-- Instagram, TikTok, X to follow) once via OAuth, and the Content Hub then
-- publishes approved/scheduled content_items to those channels automatically.

-- One stored connection per platform (the CDS Space brand account/page).
create table if not exists public.social_connections (
  id            uuid primary key default gen_random_uuid(),
  platform      text not null unique
                  check (platform in ('linkedin','facebook','instagram','tiktok','x')),
  status        text not null default 'connected'
                  check (status in ('connected','expired','revoked')),
  account_name  text,                 -- display name of the connected account/page
  account_urn   text,                 -- provider author id/URN used when posting
  scope         text,                 -- granted OAuth scopes
  access_token  text,                 -- stored server-side only, never sent to the browser
  refresh_token text,
  token_expires_at timestamptz,
  metadata      jsonb not null default '{}'::jsonb,
  connected_by  text,
  connected_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One row per publish attempt of a content item to a platform (audit + status).
create table if not exists public.content_publications (
  id            uuid primary key default gen_random_uuid(),
  content_id    uuid not null references public.content_items(id) on delete cascade,
  platform      text not null
                  check (platform in ('linkedin','facebook','instagram','tiktok','x')),
  status        text not null default 'pending'
                  check (status in ('pending','published','failed','skipped')),
  external_post_id text,
  external_url  text,
  error         text,
  trigger       text not null default 'manual'   -- 'manual' | 'scheduled'
                  check (trigger in ('manual','scheduled')),
  requested_by  text,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Only one successful publication of a given item to a given platform.
create unique index if not exists content_publications_unique_success
  on public.content_publications (content_id, platform)
  where status = 'published';

create index if not exists content_publications_content_idx
  on public.content_publications (content_id);
