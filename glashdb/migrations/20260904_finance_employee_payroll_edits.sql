-- Approved payroll employee edits and recoverable edit drafts.
--
-- Employee changes are applied through one database function so the employee
-- update and its immutable approval record either both succeed or both fail.

create table if not exists public.finance_employee_payroll_edits (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.finance_employees(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 1 and 1000),
  approved_on date not null,
  approved_by_id text,
  approved_by_name text not null,
  changed_fields text[] not null default '{}',
  before_values jsonb not null,
  after_values jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_finance_employee_payroll_edits_employee_created
  on public.finance_employee_payroll_edits(employee_id, created_at desc);

create table if not exists public.finance_employee_edit_drafts (
  employee_id uuid not null references public.finance_employees(id) on delete cascade,
  actor_id text not null,
  actor_name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (employee_id, actor_id)
);

alter table public.finance_employee_payroll_edits enable row level security;
alter table public.finance_employee_edit_drafts enable row level security;

grant select, insert, update, delete on table public.finance_employee_payroll_edits to service_role;
grant select, insert, update, delete on table public.finance_employee_edit_drafts to service_role;

create or replace function public.update_finance_employee_with_approval(
  p_employee_id uuid,
  p_patch jsonb,
  p_reason text,
  p_approved_on date,
  p_actor_id text,
  p_actor_name text,
  p_changed_fields text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_edit_id uuid;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'A valid employee patch is required.' using errcode = '22023';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'A reason for the edit is required.' using errcode = '22023';
  end if;

  if char_length(btrim(p_reason)) > 1000 then
    raise exception 'The edit reason must be 1000 characters or fewer.' using errcode = '22023';
  end if;

  if p_approved_on is null then
    raise exception 'The approval date is required.' using errcode = '22023';
  end if;

  select to_jsonb(employee)
    into v_before
    from public.finance_employees as employee
   where employee.id = p_employee_id
   for update;

  if v_before is null then
    raise exception 'Employee not found.' using errcode = 'P0002';
  end if;

  update public.finance_employees as employee
     set name = case when p_patch ? 'name' then p_patch->>'name' else employee.name end,
         role = case when p_patch ? 'role' then nullif(p_patch->>'role', '') else employee.role end,
         email = case when p_patch ? 'email' then nullif(p_patch->>'email', '') else employee.email end,
         phone = case when p_patch ? 'phone' then nullif(p_patch->>'phone', '') else employee.phone end,
         bank_name = case when p_patch ? 'bank_name' then nullif(p_patch->>'bank_name', '') else employee.bank_name end,
         bank_code = case when p_patch ? 'bank_code' then nullif(p_patch->>'bank_code', '') else employee.bank_code end,
         account_number = case when p_patch ? 'account_number' then nullif(p_patch->>'account_number', '') else employee.account_number end,
         account_name = case when p_patch ? 'account_name' then nullif(p_patch->>'account_name', '') else employee.account_name end,
         base_salary = case
           when p_patch ? 'base_salary' and jsonb_typeof(p_patch->'base_salary') = 'null' then null
           when p_patch ? 'base_salary' then (p_patch->>'base_salary')::numeric
           else employee.base_salary
         end,
         currency = case when p_patch ? 'currency' then p_patch->>'currency' else employee.currency end,
         active = case when p_patch ? 'active' then (p_patch->>'active')::boolean else employee.active end
   where employee.id = p_employee_id
   returning to_jsonb(employee) into v_after;

  insert into public.finance_employee_payroll_edits (
    employee_id,
    reason,
    approved_on,
    approved_by_id,
    approved_by_name,
    changed_fields,
    before_values,
    after_values
  ) values (
    p_employee_id,
    btrim(p_reason),
    p_approved_on,
    nullif(btrim(coalesce(p_actor_id, '')), ''),
    coalesce(nullif(btrim(p_actor_name), ''), 'Administrator'),
    coalesce(p_changed_fields, '{}'),
    v_before,
    v_after
  ) returning id into v_edit_id;

  delete from public.finance_employee_edit_drafts
   where employee_id = p_employee_id
     and actor_id = p_actor_id;

  return jsonb_build_object('employee', v_after, 'edit_id', v_edit_id);
end;
$$;

revoke all on function public.update_finance_employee_with_approval(uuid, jsonb, text, date, text, text, text[]) from public;
revoke all on function public.update_finance_employee_with_approval(uuid, jsonb, text, date, text, text, text[]) from anon;
revoke all on function public.update_finance_employee_with_approval(uuid, jsonb, text, date, text, text, text[]) from authenticated;
grant execute on function public.update_finance_employee_with_approval(uuid, jsonb, text, date, text, text, text[]) to service_role;

comment on table public.finance_employee_payroll_edits is
  'Immutable approval history for changes to Finance payroll employee details and salary.';

comment on table public.finance_employee_edit_drafts is
  'One recoverable, server-side payroll employee edit draft per administrator and employee.';

notify pgrst, 'reload schema';
