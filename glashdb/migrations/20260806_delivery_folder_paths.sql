-- Preserve the original relative path of every asset uploaded as a folder.
-- Existing flat uploads continue to use their filename as the fallback path.

alter table public.client_delivery_files
  add column if not exists relative_path text;

update public.client_delivery_files
   set relative_path = file_name
 where relative_path is null or btrim(relative_path) = '';

alter table public.client_delivery_files
  alter column relative_path set default '',
  alter column relative_path set not null;

create index if not exists idx_client_delivery_files_relative_path
  on public.client_delivery_files(delivery_id, relative_path);

