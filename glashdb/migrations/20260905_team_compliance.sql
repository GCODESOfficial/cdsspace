create extension if not exists pgcrypto;

create or replace function public.team_compliance_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.team_compliance_sops (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  summary text not null default '',
  content text not null default '',
  scope_type text not null default 'general'
    check (scope_type in ('general', 'department', 'task')),
  department text,
  task_name text,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  author_member_id uuid references public.team_members(id) on delete set null,
  created_by text not null,
  updated_by text not null,
  version integer not null default 1 check (version > 0),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_compliance_sops_department_scope_check
    check (status = 'draft' or scope_type <> 'department' or nullif(btrim(department), '') is not null),
  constraint team_compliance_sops_task_scope_check
    check (status = 'draft' or scope_type <> 'task' or nullif(btrim(task_name), '') is not null)
);

create table if not exists public.team_compliance_sop_collaborators (
  sop_id uuid not null references public.team_compliance_sops(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  can_edit boolean not null default true,
  can_publish boolean not null default false,
  invited_by text not null,
  created_at timestamptz not null default now(),
  primary key (sop_id, team_member_id)
);

create table if not exists public.team_compliance_sop_assignments (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid not null references public.team_compliance_sops(id) on delete cascade,
  audience_type text not null check (audience_type in ('all', 'department', 'member')),
  department text,
  team_member_id uuid references public.team_members(id) on delete cascade,
  assigned_by text not null,
  created_at timestamptz not null default now(),
  check (
    (audience_type = 'all' and department is null and team_member_id is null)
    or (audience_type = 'department' and nullif(btrim(department), '') is not null and team_member_id is null)
    or (audience_type = 'member' and department is null and team_member_id is not null)
  )
);

create unique index if not exists team_compliance_sop_assignment_all_uq
  on public.team_compliance_sop_assignments (sop_id, audience_type)
  where audience_type = 'all';
create unique index if not exists team_compliance_sop_assignment_department_uq
  on public.team_compliance_sop_assignments (sop_id, lower(department))
  where audience_type = 'department';
create unique index if not exists team_compliance_sop_assignment_member_uq
  on public.team_compliance_sop_assignments (sop_id, team_member_id)
  where audience_type = 'member';

create table if not exists public.team_compliance_sop_media (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid not null references public.team_compliance_sops(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 78643200),
  media_type text not null check (media_type in ('image', 'video')),
  uploaded_by text not null,
  uploaded_by_member_id uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.team_compliance_sop_acknowledgements (
  sop_id uuid not null references public.team_compliance_sops(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (sop_id, team_member_id)
);

create sequence if not exists public.team_compliance_book_number_seq;

create or replace function public.next_team_compliance_book_number()
returns text
language sql
as $$
  select 'CDS-LIB-' || lpad(nextval('public.team_compliance_book_number_seq')::text, 6, '0');
$$;

create table if not exists public.team_compliance_library_books (
  id uuid primary key default gen_random_uuid(),
  inventory_number text not null unique default public.next_team_compliance_book_number(),
  title text not null default '',
  author text not null default '',
  isbn text,
  category text,
  description text not null default '',
  acquisition_type text not null default 'purchased'
    check (acquisition_type in ('purchased', 'donated')),
  donor_member_id uuid references public.team_members(id) on delete set null,
  donor_name text,
  book_condition text not null default 'good'
    check (book_condition in ('new', 'good', 'fair', 'repair')),
  status text not null default 'draft'
    check (status in ('draft', 'available', 'borrowed', 'maintenance', 'retired')),
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_compliance_books_donor_check
    check (status = 'draft' or acquisition_type <> 'donated' or donor_member_id is not null or nullif(btrim(donor_name), '') is not null)
);

create table if not exists public.team_compliance_library_loans (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.team_compliance_library_books(id) on delete cascade,
  team_member_id uuid references public.team_members(id) on delete set null,
  member_name text not null,
  member_email text not null,
  requested_days integer not null default 21 check (requested_days between 1 and 21),
  request_note text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'requested', 'borrowed', 'returned', 'rejected', 'cancelled', 'overdue')),
  requested_at timestamptz,
  reviewed_by text,
  reviewed_at timestamptz,
  borrowed_at timestamptz,
  due_at timestamptz,
  returned_at timestamptz,
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists team_compliance_library_active_book_loan_uq
  on public.team_compliance_library_loans (book_id)
  where status in ('borrowed', 'overdue');
create unique index if not exists team_compliance_library_member_book_request_uq
  on public.team_compliance_library_loans (book_id, team_member_id)
  where status in ('draft', 'requested');

create table if not exists public.team_compliance_overnight_requests (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid references public.team_members(id) on delete set null,
  member_name text not null,
  member_email text not null,
  requested_date date,
  planned_start time,
  planned_end time,
  purpose text not null default '',
  emergency_contact text not null default '',
  terms_version text not null default '2026-09-05',
  terms_text_snapshot text not null default '',
  signature_name text not null default '',
  signed_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by text,
  reviewed_at timestamptz,
  reviewer_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists team_compliance_overnight_member_date_uq
  on public.team_compliance_overnight_requests (team_member_id, requested_date)
  where status in ('pending', 'approved');
create unique index if not exists team_compliance_overnight_member_draft_uq
  on public.team_compliance_overnight_requests (team_member_id)
  where status = 'draft';

create index if not exists team_compliance_sops_status_idx
  on public.team_compliance_sops (status, updated_at desc);
create index if not exists team_compliance_sop_media_sop_idx
  on public.team_compliance_sop_media (sop_id, created_at);
create index if not exists team_compliance_books_status_idx
  on public.team_compliance_library_books (status, title);
create index if not exists team_compliance_loans_member_idx
  on public.team_compliance_library_loans (team_member_id, created_at desc);
create index if not exists team_compliance_overnight_status_idx
  on public.team_compliance_overnight_requests (status, requested_date desc);

drop trigger if exists team_compliance_sops_touch_updated_at on public.team_compliance_sops;
create trigger team_compliance_sops_touch_updated_at
before update on public.team_compliance_sops
for each row execute function public.team_compliance_touch_updated_at();

drop trigger if exists team_compliance_books_touch_updated_at on public.team_compliance_library_books;
create trigger team_compliance_books_touch_updated_at
before update on public.team_compliance_library_books
for each row execute function public.team_compliance_touch_updated_at();

drop trigger if exists team_compliance_loans_touch_updated_at on public.team_compliance_library_loans;
create trigger team_compliance_loans_touch_updated_at
before update on public.team_compliance_library_loans
for each row execute function public.team_compliance_touch_updated_at();

drop trigger if exists team_compliance_overnight_touch_updated_at on public.team_compliance_overnight_requests;
create trigger team_compliance_overnight_touch_updated_at
before update on public.team_compliance_overnight_requests
for each row execute function public.team_compliance_touch_updated_at();

alter table public.team_compliance_sops enable row level security;
alter table public.team_compliance_sop_collaborators enable row level security;
alter table public.team_compliance_sop_assignments enable row level security;
alter table public.team_compliance_sop_media enable row level security;
alter table public.team_compliance_sop_acknowledgements enable row level security;
alter table public.team_compliance_library_books enable row level security;
alter table public.team_compliance_library_loans enable row level security;
alter table public.team_compliance_overnight_requests enable row level security;

-- Older iterations used PostgreSQL-generated names for these constraints.
-- Replace them idempotently so incomplete server-side drafts remain valid.
alter table public.team_compliance_sops drop constraint if exists team_compliance_sops_check;
alter table public.team_compliance_sops drop constraint if exists team_compliance_sops_check1;
alter table public.team_compliance_sops drop constraint if exists team_compliance_sops_department_scope_check;
alter table public.team_compliance_sops drop constraint if exists team_compliance_sops_task_scope_check;
alter table public.team_compliance_sops
  add constraint team_compliance_sops_department_scope_check
  check (status = 'draft' or scope_type <> 'department' or nullif(btrim(department), '') is not null);
alter table public.team_compliance_sops
  add constraint team_compliance_sops_task_scope_check
  check (status = 'draft' or scope_type <> 'task' or nullif(btrim(task_name), '') is not null);

alter table public.team_compliance_library_books drop constraint if exists team_compliance_library_books_check;
alter table public.team_compliance_library_books drop constraint if exists team_compliance_books_donor_check;
alter table public.team_compliance_library_books
  add constraint team_compliance_books_donor_check
  check (status = 'draft' or acquisition_type <> 'donated' or donor_member_id is not null or nullif(btrim(donor_name), '') is not null);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'team-compliance',
  'team-compliance',
  false,
  78643200,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
