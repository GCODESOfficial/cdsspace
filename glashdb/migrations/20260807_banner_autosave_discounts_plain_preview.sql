-- Banner autosave, administrator-controlled percentage discounts, and the
-- simplified plain-artwork preview flow.

create extension if not exists "pgcrypto";

create table if not exists public.banner_discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  percentage numeric(5,2) not null,
  active boolean not null default true,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint banner_discount_code_format check (code = upper(code) and code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
  constraint banner_discount_percentage_range check (percentage > 0 and percentage <= 100),
  constraint banner_discount_date_order check (expires_at is null or starts_at is null or expires_at > starts_at)
);

create index if not exists banner_discount_codes_active_code
  on public.banner_discount_codes(active, code);

alter table public.banner_requests
  add column if not exists draft_step smallint not null default 1,
  add column if not exists draft_payload jsonb not null default '{}'::jsonb,
  add column if not exists discount_code text,
  add column if not exists discount_percentage numeric(5,2) not null default 0,
  add column if not exists discount_amount numeric(14,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'banner_requests_draft_step_range'
      and conrelid = 'public.banner_requests'::regclass
  ) then
    alter table public.banner_requests
      add constraint banner_requests_draft_step_range check (draft_step between 1 and 3);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'banner_requests_discount_percentage_range'
      and conrelid = 'public.banner_requests'::regclass
  ) then
    alter table public.banner_requests
      add constraint banner_requests_discount_percentage_range check (discount_percentage between 0 and 100);
  end if;
end $$;

-- The client now previews the original artwork directly. Clear obsolete task
-- placeholders so legacy drafts cannot fail checkout or show stale mockups.
update public.banner_requests
set mockup_url = null,
    mockup_urls = '[]'::jsonb,
    mockup_task_ids = '[]'::jsonb
where mockup_url is not null
   or mockup_urls <> '[]'::jsonb
   or mockup_task_ids <> '[]'::jsonb;

alter table public.banner_discount_codes enable row level security;
revoke all on public.banner_discount_codes from anon, authenticated;

comment on table public.banner_discount_codes is
  'Admin-configured percentage discount codes validated server-side during banner checkout.';
comment on column public.banner_requests.draft_step is
  'Last completed Banner Studio step used to resume an autosaved draft.';
comment on column public.banner_requests.draft_payload is
  'Serializable Banner Studio state used by the authenticated autosave endpoint.';
