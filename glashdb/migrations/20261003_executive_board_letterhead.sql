-- Letterhead documents for the Executive Board.
--
-- The CREATE studio lets each workspace upload its own letterhead per
-- document, which is right for client work. Official CDS Space correspondence
-- is the opposite: one company letterhead, applied to every document, so a
-- letter cannot go out on the wrong paper. These documents therefore live in
-- their own scope, and the design comes from a single company template rather
-- than an upload on each document.

begin;

alter table public.create_letterheads
  add column if not exists scope text not null default 'create'
  check (scope in ('create', 'executive_board'));

comment on column public.create_letterheads.scope is
  'Which studio owns this document: the CREATE letterhead tool, or the Executive Board company letterhead section.';

create index if not exists create_letterheads_scope_idx
  on public.create_letterheads (owner_kind, owner_id, scope, updated_at desc)
  where deleted_at is null;

-- The one CDS Space letterhead. A single row, kept simple on purpose: it is
-- company stationery, not a per-person setting.
create table if not exists public.company_letterhead (
  id boolean primary key default true check (id),
  first_page_path text,
  first_page_name text,
  second_page_path text,
  second_page_name text,
  updated_by text,
  updated_at timestamptz not null default now()
);

comment on table public.company_letterhead is
  'The single CDS Space letterhead design applied to every Executive Board letterhead document.';

alter table public.company_letterhead enable row level security;
revoke all on public.company_letterhead from anon, authenticated;

commit;
