-- Sales Hub approval workflow for client-facing creative deliverables.
-- Work remains private until an authorised admin approves and publishes it.

create extension if not exists "pgcrypto";

create table if not exists public.client_deliveries (
  id uuid primary key default gen_random_uuid(),
  delivery_type text not null check (delivery_type in ('brand_identity', 'design')),
  title text not null,
  description text,
  status text not null default 'draft'
    check (status in ('draft', 'assigned', 'submitted', 'revision_requested', 'published', 'rejected')),
  project_id uuid references public.finance_projects(id) on delete set null,
  client_user_id uuid references public.profiles(id) on delete set null,
  assigned_team_lead_id uuid references public.team_members(id) on delete set null,
  submitted_by_team_member_id uuid references public.team_members(id) on delete set null,
  submitted_by_admin text,
  created_by text not null,
  assigned_by text,
  approved_by text,
  approval_note text,
  revision_note text,
  external_url text,
  brand_identity_delivery_id uuid references public.brand_identity_deliveries(id) on delete set null,
  submitted_at timestamptz,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_delivery_files (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.client_deliveries(id) on delete cascade,
  file_name text not null,
  storage_bucket text not null check (storage_bucket in ('client-deliverables', 'brand-identity-deliveries')),
  storage_path text not null,
  mime_type text,
  file_size bigint not null default 0,
  file_kind text not null default 'document'
    check (file_kind in ('image', 'pdf', 'office', 'archive', 'document')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint client_delivery_files_storage_object unique (storage_bucket, storage_path)
);

create index if not exists idx_client_deliveries_status_created
  on public.client_deliveries(status, created_at desc);
create index if not exists idx_client_deliveries_team_lead
  on public.client_deliveries(assigned_team_lead_id, status, updated_at desc);
create index if not exists idx_client_deliveries_client_published
  on public.client_deliveries(client_user_id, published_at desc)
  where status = 'published';
create index if not exists idx_client_delivery_files_delivery
  on public.client_delivery_files(delivery_id, position, created_at);

alter table public.client_deliveries enable row level security;
drop policy if exists "Clients can read their published deliverables" on public.client_deliveries;
create policy "Clients can read their published deliverables"
  on public.client_deliveries for select to authenticated
  using (client_user_id = auth.uid() and status = 'published' and published_at is not null);

alter table public.client_delivery_files enable row level security;
drop policy if exists "Clients can read files in their published deliverables" on public.client_delivery_files;
create policy "Clients can read files in their published deliverables"
  on public.client_delivery_files for select to authenticated
  using (
    exists (
      select 1
      from public.client_deliveries delivery
      where delivery.id = delivery_id
        and delivery.client_user_id = auth.uid()
        and delivery.status = 'published'
        and delivery.published_at is not null
    )
  );

grant select on public.client_deliveries, public.client_delivery_files to authenticated;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('client-deliverables', 'client-deliverables', false, 52428800, null)
    on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        updated_at = now();
  end if;
end $$;

-- Keep existing notification values valid while making the new events
-- explicit for the client bell and future email/push fan-out.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'order_update', 'new_message', 'status_change', 'new_order',
    'new_delivery', 'brand_identity', 'announcement'
  ));
