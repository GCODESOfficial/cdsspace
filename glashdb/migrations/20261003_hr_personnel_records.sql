-- Confidential HR personnel records, birthday reminders, and payroll links.
-- All document bytes live in a private bucket and are streamed through an
-- authenticated admin endpoint. This migration is intentionally re-runnable.

create extension if not exists pgcrypto;

alter table public.team_members
  add column if not exists date_of_birth date,
  add column if not exists birthday_reminder_enabled boolean not null default true,
  add column if not exists birthday_reminder_days smallint not null default 14,
  add column if not exists birthday_last_celebrated_year integer,
  add column if not exists birthday_last_celebrated_at timestamptz;

alter table public.team_members
  drop constraint if exists team_members_birthday_reminder_days_check;
alter table public.team_members
  add constraint team_members_birthday_reminder_days_check
  check (birthday_reminder_days between 1 and 90);

alter table public.finance_employees
  add column if not exists team_member_id uuid references public.team_members(id) on delete set null;

create unique index if not exists finance_employees_team_member_uq
  on public.finance_employees(team_member_id)
  where team_member_id is not null;

-- Link existing payroll profiles only where the normalised email identifies
-- exactly one member and exactly one payroll employee.
with unique_members as (
  select lower(btrim(email)) as email_key, min(id::text)::uuid as member_id
    from public.team_members
   where nullif(btrim(email), '') is not null
   group by lower(btrim(email))
  having count(*) = 1
), unique_employees as (
  select lower(btrim(email)) as email_key, min(id::text)::uuid as employee_id
    from public.finance_employees
   where nullif(btrim(email), '') is not null
   group by lower(btrim(email))
  having count(*) = 1
)
update public.finance_employees employee
   set team_member_id = member.member_id
  from unique_members member
  join unique_employees payroll on payroll.email_key = member.email_key
 where employee.id = payroll.employee_id
   and employee.team_member_id is null
   and not exists (
     select 1 from public.finance_employees linked
      where linked.team_member_id = member.member_id
   );

create sequence if not exists public.hr_personnel_record_number_seq;

create or replace function public.next_hr_personnel_record_number()
returns text
language sql
as $$
  select 'CDS-HR-' || lpad(nextval('public.hr_personnel_record_number_seq')::text, 7, '0');
$$;

create table if not exists public.hr_personnel_records (
  id uuid primary key default gen_random_uuid(),
  record_number text not null unique default public.next_hr_personnel_record_number(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  record_type text not null check (record_type in (
    'employment_contract', 'ip_protection', 'nda', 'bank_statement',
    'query', 'query_response', 'appreciation', 'promotion', 'demotion',
    'leave_approval', 'disciplinary_action', 'performance_review', 'other'
  )),
  title text not null check (char_length(btrim(title)) between 1 and 220),
  summary text not null default '',
  status text not null default 'issued'
    check (status in ('draft', 'issued', 'acknowledged', 'resolved', 'archived')),
  event_date date not null default current_date,
  effective_date date,
  due_at timestamptz,
  signed_at timestamptz,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  is_confidential boolean not null default true,
  storage_path text unique,
  file_name text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or (size_bytes > 0 and size_bytes <= 26214400)),
  created_by text not null,
  updated_by text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (storage_path is null and file_name is null and mime_type is null and size_bytes is null)
    or (storage_path is not null and file_name is not null and mime_type is not null and size_bytes is not null)
  )
);

create table if not exists public.hr_personnel_record_events (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.hr_personnel_records(id) on delete cascade,
  action text not null check (action in ('created', 'updated', 'acknowledged', 'resolved', 'archived', 'restored')),
  from_status text,
  to_status text,
  note text not null default '',
  actor text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.hr_personnel_record_drafts (
  actor_key text primary key,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hr_personnel_records_member_date_idx
  on public.hr_personnel_records(team_member_id, event_date desc, created_at desc);
create index if not exists hr_personnel_records_type_status_idx
  on public.hr_personnel_records(record_type, status, created_at desc);
create index if not exists hr_personnel_records_due_idx
  on public.hr_personnel_records(due_at)
  where due_at is not null and status not in ('resolved', 'archived');
create index if not exists hr_personnel_record_events_record_idx
  on public.hr_personnel_record_events(record_id, created_at desc);
create index if not exists team_members_birthday_idx
  on public.team_members(
    extract(month from date_of_birth),
    extract(day from date_of_birth)
  ) where date_of_birth is not null and birthday_reminder_enabled = true;

create or replace function public.hr_personnel_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists hr_personnel_records_touch on public.hr_personnel_records;
create trigger hr_personnel_records_touch
before update on public.hr_personnel_records
for each row execute function public.hr_personnel_touch_updated_at();

alter table public.hr_personnel_records enable row level security;
alter table public.hr_personnel_record_events enable row level security;
alter table public.hr_personnel_record_drafts enable row level security;

grant select, insert, update, delete on table public.hr_personnel_records to service_role;
grant select, insert, update, delete on table public.hr_personnel_record_events to service_role;
grant select, insert, update, delete on table public.hr_personnel_record_drafts to service_role;
grant usage, select on sequence public.hr_personnel_record_number_seq to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hr-personnel',
  'hr-personnel',
  false,
  26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on table public.hr_personnel_records is
  'Confidential, auditable personnel documents, letters, queries, decisions, and acknowledgements.';
comment on column public.hr_personnel_records.storage_path is
  'Private object path. Never expose this value as a public or permanent URL.';

notify pgrst, 'reload schema';
