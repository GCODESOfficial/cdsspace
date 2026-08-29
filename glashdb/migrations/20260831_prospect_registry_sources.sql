-- Registry imports run in resumable slices. A batch now remembers which registry
-- it came from and where the last slice stopped, so a national register of
-- millions can be walked across many sessions without repeating work.

begin;

alter table public.prospect_import_batches
  add column if not exists registry_key text,
  add column if not exists cursor jsonb,
  add column if not exists rendered boolean not null default false,
  add column if not exists last_run_at timestamptz,
  add column if not exists exhausted boolean not null default false;

alter table public.prospect_import_batches
  drop constraint if exists prospect_import_batches_source_kind_check;
alter table public.prospect_import_batches
  add constraint prospect_import_batches_source_kind_check
  check (source_kind in ('url', 'text', 'registry'));

create index if not exists prospect_import_batches_registry_idx
  on public.prospect_import_batches (registry_key, exhausted, last_run_at desc);

-- Registry rows carry facts the crawler cannot infer, so they are recorded on
-- the company directly rather than waiting for the research pass.
alter table public.prospect_companies
  add column if not exists registry_status text,
  add column if not exists registry_source text;

comment on column public.prospect_import_batches.cursor is
  'Where the last registry slice stopped, so the next run resumes instead of restarting.';
comment on column public.prospect_companies.registry_status is
  'Trading status as published by the official register, which outranks crawled guesses.';

commit;
