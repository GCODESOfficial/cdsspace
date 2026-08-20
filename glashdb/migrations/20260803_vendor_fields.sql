-- 20260803_vendor_fields.sql
-- Extend finance_contractors so it doubles as the CRM Vendors registry:
-- sub-contractors, vendors under agreement, suppliers, and partners.

alter table public.finance_contractors
  add column if not exists vendor_type text not null default 'subcontractor',
  add column if not exists agreement_status text not null default 'none',
  add column if not exists agreement_notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'finance_contractors_vendor_type_check'
       and conrelid = 'public.finance_contractors'::regclass
  ) then
    alter table public.finance_contractors
      add constraint finance_contractors_vendor_type_check
      check (vendor_type in ('subcontractor', 'vendor', 'supplier', 'partner'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'finance_contractors_agreement_status_check'
       and conrelid = 'public.finance_contractors'::regclass
  ) then
    alter table public.finance_contractors
      add constraint finance_contractors_agreement_status_check
      check (agreement_status in ('none', 'pending', 'active', 'expired'));
  end if;
end $$;

create index if not exists idx_finance_contractors_vendor_type
  on public.finance_contractors (vendor_type);
