-- Quantity-bound banner artwork and Magnific-generated presentation mockups.
-- Singular columns remain populated for backwards compatibility with existing
-- admin/client banner cards while the arrays preserve every printed design.

alter table public.banner_requests
  add column if not exists ready_file_urls jsonb not null default '[]'::jsonb,
  add column if not exists mockup_url text,
  add column if not exists mockup_urls jsonb not null default '[]'::jsonb,
  add column if not exists mockup_task_ids jsonb not null default '[]'::jsonb;

update public.banner_requests
set ready_file_urls = jsonb_build_array(ready_file_url)
where ready_file_url is not null
  and jsonb_array_length(ready_file_urls) = 0;

update public.banner_requests
set mockup_urls = jsonb_build_array(mockup_url)
where mockup_url is not null
  and jsonb_array_length(mockup_urls) = 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'banner_requests_ready_file_urls_array'
      and conrelid = 'public.banner_requests'::regclass
  ) then
    alter table public.banner_requests
      add constraint banner_requests_ready_file_urls_array
      check (jsonb_typeof(ready_file_urls) = 'array');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'banner_requests_mockup_urls_array'
      and conrelid = 'public.banner_requests'::regclass
  ) then
    alter table public.banner_requests
      add constraint banner_requests_mockup_urls_array
      check (jsonb_typeof(mockup_urls) = 'array');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'banner_requests_mockup_task_ids_array'
      and conrelid = 'public.banner_requests'::regclass
  ) then
    alter table public.banner_requests
      add constraint banner_requests_mockup_task_ids_array
      check (jsonb_typeof(mockup_task_ids) = 'array');
  end if;
end $$;

comment on column public.banner_requests.ready_file_urls is
  'Ordered storage paths for the quantity-bound print-ready banner artworks.';
comment on column public.banner_requests.mockup_urls is
  'Ordered Magnific presentation mockup URLs corresponding to ready_file_urls.';
comment on column public.banner_requests.mockup_task_ids is
  'Magnific asynchronous task IDs retained for background status recovery.';
