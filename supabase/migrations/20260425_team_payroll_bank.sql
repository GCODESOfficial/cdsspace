-- ============================================
-- CDS Space: Team payroll - bank details + change-request flow
-- Idempotent. Run in Supabase SQL editor.
-- ============================================

-- 1. Bank + salary columns on team_members.
alter table public.team_members
  add column if not exists bank_name text,
  add column if not exists bank_code text,
  add column if not exists account_number text,
  add column if not exists account_name text,
  add column if not exists base_salary numeric(14,2),
  add column if not exists salary_currency text not null default 'NGN',
  add column if not exists pay_cycle text not null default 'monthly'
    check (pay_cycle in ('monthly','weekly','bi_weekly','one_off'));

-- 2. Change-request table: team member submits proposed bank updates; admin
--    approves (applies to team_members) or rejects. Keeps an audit trail.
create table if not exists public.team_bank_change_requests (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,

  -- Proposed new values
  bank_name text,
  bank_code text,
  account_number text,
  account_name text,

  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  admin_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_bank_change_member on public.team_bank_change_requests(team_member_id);
create index if not exists idx_bank_change_status on public.team_bank_change_requests(status);

alter table public.team_bank_change_requests enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'team_bank_change_requests' and policyname = 'bank_change_all') then
    create policy bank_change_all on public.team_bank_change_requests for all using (true) with check (true);
  end if;
end $$;

-- 3. team_payroll_entries enrichments so the admin view can surface everything
--    from the employee's current bank details at the moment of the entry.
alter table public.team_payroll_entries
  add column if not exists bank_name text,
  add column if not exists bank_code text,
  add column if not exists account_number text,
  add column if not exists account_name text;
