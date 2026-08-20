-- Standalone CDS Space Brand Marketer portal.
--
-- Marketers authenticate through the same identity provider as clients, but
-- their profile, agreements, payout details and commission ledger live in
-- dedicated tables. Client invoices only gain an attribution reference.
--
-- Safe to re-run. Intentionally avoids gen_random_bytes(), because some
-- hosted Postgres configurations expose pgcrypto UUIDs but not that function.

create extension if not exists "pgcrypto";

create or replace function public.generate_marketer_public_id()
returns text language plpgsql as $$
declare
  candidate text;
begin
  loop
    candidate := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (
      select 1 from public.brand_marketers where public_id = candidate
    );
  end loop;
  return candidate;
end;
$$;

create table if not exists public.brand_marketers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  public_id text not null unique default public.generate_marketer_public_id(),
  email text not null,
  full_name text,
  display_name text,
  phone_number text,
  profile_photo_url text,
  marketer_code text unique,
  country text,
  address text,
  city text,
  billing_currency text,
  billing_currency_selected_at timestamptz,
  status text not null default 'onboarding',
  profile_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_marketers_public_id_format check (public_id ~ '^[A-Z0-9]{8}$'),
  constraint brand_marketers_code_format check (
    marketer_code is null or marketer_code ~ '^[A-Z][A-Z0-9]{3,23}$'
  ),
  constraint brand_marketers_currency_check check (
    billing_currency is null or billing_currency in ('NGN','USD','GBP','EUR','RWF','CNY')
  ),
  constraint brand_marketers_status_check check (
    status in ('onboarding','active','suspended','closed')
  )
);

create unique index if not exists brand_marketers_email_unique
  on public.brand_marketers(lower(email));
create unique index if not exists brand_marketers_code_unique
  on public.brand_marketers(lower(marketer_code)) where marketer_code is not null;

create table if not exists public.brand_marketer_agreements (
  id uuid primary key default gen_random_uuid(),
  marketer_user_id uuid not null references public.brand_marketers(user_id) on delete cascade,
  signer_name text not null,
  signer_email text not null,
  terms_version integer not null default 0,
  terms_effective_date date,
  privacy_version integer not null default 0,
  privacy_effective_date date,
  marketer_agreement_version integer not null default 0,
  marketer_agreement_effective_date date,
  agreement_text text not null,
  signed_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint brand_marketer_agreements_one_time unique (marketer_user_id)
);

create index if not exists brand_marketer_agreements_signed_at
  on public.brand_marketer_agreements(signed_at desc);

create table if not exists public.brand_marketer_payout_accounts (
  id uuid primary key default gen_random_uuid(),
  marketer_user_id uuid not null unique references public.brand_marketers(user_id) on delete cascade,
  account_type text not null default 'bank',
  account_name text not null,
  bank_name text not null,
  account_number text not null,
  bank_code text,
  country text,
  currency text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_marketer_payout_type_check check (account_type in ('bank','mobile_money')),
  constraint brand_marketer_payout_currency_check check (currency in ('NGN','USD','GBP','EUR','RWF','CNY'))
);

alter table public.finance_invoices
  add column if not exists marketer_code text,
  add column if not exists marketer_user_id uuid references public.brand_marketers(user_id) on delete set null,
  add column if not exists marketer_attributed_at timestamptz;

create index if not exists finance_invoices_marketer_user
  on public.finance_invoices(marketer_user_id, issue_date desc);

create table if not exists public.brand_marketer_commissions (
  id uuid primary key default gen_random_uuid(),
  marketer_user_id uuid not null references public.brand_marketers(user_id) on delete restrict,
  invoice_id uuid not null unique references public.finance_invoices(id) on delete restrict,
  marketer_code text not null,
  client_user_id uuid references public.profiles(id) on delete set null,
  client_name text,
  client_email text,
  invoice_number text not null,
  invoice_total numeric(14,2) not null,
  currency text not null,
  commission_rate numeric(6,5) not null default 0.05,
  commission_amount numeric(14,2) not null,
  status text not null default 'earned',
  earned_at timestamptz not null default now(),
  paid_at timestamptz,
  payout_reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_marketer_commission_rate check (commission_rate = 0.05),
  constraint brand_marketer_commission_status check (status in ('earned','approved','paid','reversed')),
  constraint brand_marketer_commission_currency check (currency in ('NGN','USD','GBP','EUR','RWF','CNY'))
);

create index if not exists brand_marketer_commissions_owner
  on public.brand_marketer_commissions(marketer_user_id, earned_at desc);

create or replace function public.resolve_invoice_marketer()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  resolved_user_id uuid;
  resolved_code text;
begin
  if new.marketer_code is null or btrim(new.marketer_code) = '' then
    new.marketer_code := null;
    new.marketer_user_id := null;
    new.marketer_attributed_at := null;
    return new;
  end if;

  resolved_code := upper(regexp_replace(btrim(new.marketer_code), '[^A-Za-z0-9]', '', 'g'));
  select user_id into resolved_user_id
    from public.brand_marketers
   where marketer_code = resolved_code
     and status = 'active'
   limit 1;

  if resolved_user_id is null then
    raise exception 'Unknown or inactive marketer code';
  end if;

  new.marketer_code := resolved_code;
  new.marketer_user_id := resolved_user_id;
  if new.marketer_attributed_at is null then new.marketer_attributed_at := now(); end if;
  return new;
end;
$$;

drop trigger if exists finance_invoices_resolve_marketer on public.finance_invoices;
create trigger finance_invoices_resolve_marketer
  before insert or update of marketer_code
  on public.finance_invoices
  for each row execute function public.resolve_invoice_marketer();

create or replace function public.credit_invoice_marketer_commission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid'
     and old.status is distinct from 'paid'
     and new.marketer_user_id is not null then
    insert into public.brand_marketer_commissions (
      marketer_user_id, invoice_id, marketer_code, client_user_id,
      client_name, client_email, invoice_number, invoice_total, currency,
      commission_rate, commission_amount, status, earned_at
    ) values (
      new.marketer_user_id, new.id, new.marketer_code, new.user_id,
      new.client_name, new.client_email, new.invoice_number, new.total, new.currency,
      0.05, round(new.total * 0.05, 2), 'earned', now()
    ) on conflict (invoice_id) do nothing;
  elsif new.status <> 'paid' and old.status = 'paid' then
    update public.brand_marketer_commissions
       set status = 'reversed', updated_at = now(), notes = coalesce(notes, 'Invoice moved out of paid status.')
     where invoice_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists finance_invoices_credit_marketer on public.finance_invoices;
create trigger finance_invoices_credit_marketer
  after update of status on public.finance_invoices
  for each row execute function public.credit_invoice_marketer_commission();

alter table public.brand_marketers enable row level security;
alter table public.brand_marketer_agreements enable row level security;
alter table public.brand_marketer_payout_accounts enable row level security;
alter table public.brand_marketer_commissions enable row level security;

drop policy if exists "Marketers manage own profile" on public.brand_marketers;
create policy "Marketers manage own profile" on public.brand_marketers
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Marketers read own agreements" on public.brand_marketer_agreements;
create policy "Marketers read own agreements" on public.brand_marketer_agreements
  for select using (marketer_user_id = auth.uid());
drop policy if exists "Marketers sign own agreement" on public.brand_marketer_agreements;
create policy "Marketers sign own agreement" on public.brand_marketer_agreements
  for insert with check (marketer_user_id = auth.uid());

drop policy if exists "Marketers manage own payout account" on public.brand_marketer_payout_accounts;
create policy "Marketers manage own payout account" on public.brand_marketer_payout_accounts
  for all using (marketer_user_id = auth.uid()) with check (marketer_user_id = auth.uid());

drop policy if exists "Marketers read own commissions" on public.brand_marketer_commissions;
create policy "Marketers read own commissions" on public.brand_marketer_commissions
  for select using (marketer_user_id = auth.uid());

grant select, insert, update on public.brand_marketers to authenticated;
grant select, insert on public.brand_marketer_agreements to authenticated;
grant select, insert, update on public.brand_marketer_payout_accounts to authenticated;
grant select on public.brand_marketer_commissions to authenticated;

comment on column public.finance_invoices.marketer_code is
  'Optional marketer code supplied by the client before payment. Locked into a 5% commission when the invoice becomes paid.';
