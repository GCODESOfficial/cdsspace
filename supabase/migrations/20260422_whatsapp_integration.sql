-- WhatsApp integration: dual-mode (Meta Cloud API + WhatsApp Web QR).
-- Per request, only WhatsApp is multi-mode. IG/FB will only ever use the Cloud/Graph path.

-- 1. Tag every chat_messages row with a source channel + external IDs.
alter table chat_messages
  add column if not exists source text not null default 'web'
    check (source in ('web','whatsapp_cloud','whatsapp_qr','instagram','facebook')),
  add column if not exists external_id text,
  add column if not exists external_thread_id text,
  add column if not exists external_metadata jsonb;

-- Allow inbound WhatsApp rows whose sender isn't a profile (unregistered phone).
alter table chat_messages alter column sender_id drop not null;

create index if not exists idx_chat_messages_external
  on chat_messages(source, external_id);

-- 2. Integration config (one row per channel mode). Only one WhatsApp mode is active at a time.
create table if not exists whatsapp_integrations (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('cloud_api','web_qr')),
  is_active boolean not null default false,

  -- Cloud API fields
  cloud_phone_number_id text,
  cloud_waba_id text,
  cloud_access_token text,
  cloud_verify_token text,
  cloud_business_phone text,
  cloud_app_id text,

  -- Web QR fields (written by the bridge process)
  qr_session_id text,
  qr_code text,                        -- data URL of current QR (pairing)
  qr_status text not null default 'disconnected'
    check (qr_status in ('disconnected','pairing','connected','error')),
  qr_linked_phone text,
  qr_last_seen_at timestamptz,
  qr_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only one row with is_active=true across all modes.
create unique index if not exists uniq_active_whatsapp_integration
  on whatsapp_integrations ((is_active)) where is_active;

create unique index if not exists uniq_whatsapp_integration_mode
  on whatsapp_integrations (mode);

-- 3. Outbound queue for the QR bridge to poll.
create table if not exists whatsapp_outbox (
  id uuid primary key default gen_random_uuid(),
  to_phone text not null,
  body text,
  media_url text,
  chat_message_id uuid references chat_messages(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists idx_whatsapp_outbox_pending
  on whatsapp_outbox(status, created_at) where status = 'pending';

-- 4. Phone → client mapping (optional link of a WhatsApp number to an app client).
create table if not exists whatsapp_contacts (
  phone text primary key,
  client_id uuid references profiles(id) on delete set null,
  display_name text,
  wa_name text,
  last_inbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. Seed default rows for the two modes so the admin UI can toggle without a manual insert.
insert into whatsapp_integrations (mode, is_active)
values ('cloud_api', false), ('web_qr', false)
on conflict (mode) do nothing;
