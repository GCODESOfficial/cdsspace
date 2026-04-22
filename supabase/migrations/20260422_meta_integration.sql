-- Meta (Facebook Messenger + Instagram) integration.
-- Uses the Graph API; no dual-mode, only official Cloud/Graph path.

create table if not exists meta_integrations (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('facebook','instagram')),
  is_active boolean not null default false,

  page_id text,                    -- FB Page ID (also the container for IG)
  page_name text,
  page_access_token text,          -- long-lived Page Access Token
  ig_business_id text,             -- Instagram Business Account ID (linked to page)
  ig_username text,
  verify_token text,               -- for Meta webhook handshake
  app_secret text,                 -- for X-Hub-Signature verification
  scopes text,

  -- Backfill job state
  backfill_status text not null default 'idle'
    check (backfill_status in ('idle','running','done','error')),
  backfill_cursor text,            -- Graph API `after` cursor for the conversations list
  backfill_since timestamptz,
  backfill_until timestamptz,
  backfill_messages_ingested int not null default 0,
  backfill_conversations_seen int not null default 0,
  backfill_last_error text,
  backfill_started_at timestamptz,
  backfill_finished_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uniq_meta_integration_platform
  on meta_integrations (platform);

-- Per-platform PSID/IGSID → optional linked client.
create table if not exists meta_contacts (
  platform text not null check (platform in ('facebook','instagram')),
  external_user_id text not null,       -- PSID for FB, IGSID for IG
  client_id uuid references profiles(id) on delete set null,
  display_name text,
  username text,
  profile_pic_url text,
  last_inbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (platform, external_user_id)
);

insert into meta_integrations (platform, is_active)
values ('facebook', false), ('instagram', false)
on conflict (platform) do nothing;
