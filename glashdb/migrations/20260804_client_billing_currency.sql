-- One-time billing-currency onboarding for authenticated client accounts.
-- Supports local and international account billing preferences.

alter table public.profiles
  add column if not exists billing_currency text,
  add column if not exists billing_currency_selected_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_billing_currency_check;

alter table public.profiles
  add constraint profiles_billing_currency_check
  check (billing_currency is null or billing_currency in ('NGN', 'USD', 'GBP', 'EUR', 'RWF', 'CNY'));

comment on column public.profiles.billing_currency is
  'Account billing currency selected during onboarding: NGN, USD, GBP, EUR, RWF or CNY.';

comment on column public.profiles.billing_currency_selected_at is
  'Time the client confirmed or changed their account billing currency.';
