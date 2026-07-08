-- CDS Space: archive support for career role applications.
-- The admin Applicants page (now backed by role_applications) supports an
-- Active / Archived / All view; these columns store that state.

alter table public.role_applications
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz;

create index if not exists role_applications_archived_idx
  on public.role_applications (is_archived);
