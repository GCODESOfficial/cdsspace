-- Currency-specific corporate payment accounts shared by every Sales Hub order.
-- Access is server-side only; public invoice responses expose only the active
-- accounts that match the invoice currency.

create table if not exists public.sales_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  currency text not null check (currency in ('NGN', 'RWF', 'USD', 'GBP', 'EUR', 'CNY', 'AED')),
  country_code text,
  bank_name text not null,
  account_name text not null,
  account_number text,
  iban text,
  swift_bic text,
  routing_number text,
  bank_address text,
  instructions text,
  logo_url text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_bank_accounts_payment_identifier_check check (
    nullif(btrim(coalesce(account_number, '')), '') is not null
    or nullif(btrim(coalesce(iban, '')), '') is not null
  )
);

create index if not exists sales_bank_accounts_currency_active_idx
  on public.sales_bank_accounts (currency, active, sort_order);

alter table public.sales_bank_accounts enable row level security;

comment on table public.sales_bank_accounts is
  'Corporate payment accounts selected by invoice currency. Server-side finance APIs control all access.';

insert into public.sales_bank_accounts (
  currency, country_code, bank_name, account_name, account_number, logo_url, sort_order
)
select seed.currency, seed.country_code, seed.bank_name, seed.account_name, seed.account_number, seed.logo_url, seed.sort_order
from (values
  ('NGN', 'NG', 'Kuda Bank', 'CDS Space Branding Agency Ltd', '3002258183', '/kuda.png', 10),
  ('NGN', 'NG', 'Wema Bank', 'CDS Space Branding Agency Ltd', '0126148969', '/wemabank.png', 20)
) as seed(currency, country_code, bank_name, account_name, account_number, logo_url, sort_order)
where not exists (
  select 1
  from public.sales_bank_accounts existing
  where existing.currency = seed.currency
    and existing.bank_name = seed.bank_name
    and existing.account_number = seed.account_number
);

notify pgrst, 'reload schema';
