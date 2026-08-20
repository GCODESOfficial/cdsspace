-- Private, replaceable social-preview covers for public client deliveries.
-- Object paths remain private; public metadata uses the token-checked cover route.

alter table public.client_deliveries
  add column if not exists cover_storage_bucket text,
  add column if not exists cover_storage_path text,
  add column if not exists cover_mime_type text,
  add column if not exists cover_updated_at timestamptz;

alter table public.client_deliveries
  drop constraint if exists client_deliveries_cover_bucket_check;

alter table public.client_deliveries
  add constraint client_deliveries_cover_bucket_check
  check (
    cover_storage_bucket is null
    or cover_storage_bucket in ('client-deliverables', 'brand-identity-deliveries')
  );

alter table public.client_deliveries
  drop constraint if exists client_deliveries_cover_fields_check;

alter table public.client_deliveries
  add constraint client_deliveries_cover_fields_check
  check (
    (
      cover_storage_bucket is null
      and cover_storage_path is null
      and cover_mime_type is null
      and cover_updated_at is null
    )
    or
    (
      cover_storage_bucket is not null
      and cover_storage_path is not null
      and cover_mime_type is not null
      and cover_updated_at is not null
    )
  );

comment on column public.client_deliveries.cover_storage_bucket is
  'Private storage bucket containing the normalized delivery metadata cover.';
comment on column public.client_deliveries.cover_storage_path is
  'Private object path for the normalized 1200x630 delivery metadata cover.';
comment on column public.client_deliveries.cover_mime_type is
  'MIME type returned by token-checked delivery cover routes.';
comment on column public.client_deliveries.cover_updated_at is
  'Timestamp used to audit and cache-bust delivery cover replacements.';
