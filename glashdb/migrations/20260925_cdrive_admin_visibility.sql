alter table public.client_drives
  add column if not exists shared_with_admin boolean not null default false;

update public.client_drives
   set shared_with_admin = true
 where created_by_kind = 'admin'
   and shared_with_admin = false;

create index if not exists idx_client_drives_admin_visibility
  on public.client_drives (updated_at desc)
  where status = 'active'
    and (created_by_kind = 'admin' or shared_with_admin = true);

comment on column public.client_drives.shared_with_admin is
  'Client-controlled permission for CDS Admin visibility. Admin-created drives are always visible to CDS Admin.';
