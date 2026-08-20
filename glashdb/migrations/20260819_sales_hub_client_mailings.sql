-- Sales Hub client mailings: resumable drafts, audited individual recipients,
-- secure inline campaign imagery, and delivery history.

create extension if not exists "pgcrypto";

create table if not exists public.client_email_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null default '',
  body_text text not null default '',
  recipient_selection jsonb not null default '{"all_clients":false,"selected_client_ids":[],"custom_emails":[]}'::jsonb,
  cover_storage_path text,
  cover_file_name text,
  cover_mime_type text,
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'partial_failed', 'failed')),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  last_error text,
  created_by text not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_email_campaigns_creator
  on public.client_email_campaigns(created_by, status, updated_at desc);

create table if not exists public.client_email_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.client_email_campaigns(id) on delete cascade,
  client_key text,
  recipient_name text,
  email text not null,
  source text not null default 'client' check (source in ('client', 'custom')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  delivery_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_client_email_campaign_recipient_unique
  on public.client_email_campaign_recipients(campaign_id, lower(email));
create index if not exists idx_client_email_campaign_recipient_status
  on public.client_email_campaign_recipients(campaign_id, status);

alter table public.client_email_campaigns enable row level security;
alter table public.client_email_campaign_recipients enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sales-mailing-images',
  'sales-mailing-images',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into public.admin_roles (name, description, permissions)
values (
  'Sales Hub Mailing Manager',
  'Create, rewrite, prepare, and send branded client mailing campaigns from Sales Hub.',
  array['clients.view', 'clients.mailings.view', 'clients.mailings.create', 'clients.mailings.send']::text[]
)
on conflict (name) do update set
  description = excluded.description,
  permissions = (
    select array(
      select distinct permission
        from unnest(public.admin_roles.permissions || excluded.permissions) permission
       order by permission
    )
  ),
  updated_at = now();

comment on table public.client_email_campaigns is
  'Autosaved Sales Hub client-email drafts and their aggregate delivery state.';
comment on table public.client_email_campaign_recipients is
  'Per-recipient delivery history; every bulk mailing is sent as an individual email.';
