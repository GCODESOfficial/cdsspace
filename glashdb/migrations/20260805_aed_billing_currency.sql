-- Add UAE Dirham to every account and finance-adjacent currency constraint.
-- Application invoice tables store currency as text and do not require a
-- separate constraint update.

begin;

alter table if exists public.profiles
  drop constraint if exists profiles_billing_currency_check;
alter table if exists public.profiles
  add constraint profiles_billing_currency_check
  check (billing_currency is null or billing_currency in ('NGN', 'USD', 'GBP', 'EUR', 'RWF', 'CNY', 'AED'));

alter table if exists public.brand_marketers
  drop constraint if exists brand_marketers_currency_check;
alter table if exists public.brand_marketers
  add constraint brand_marketers_currency_check
  check (billing_currency is null or billing_currency in ('NGN', 'USD', 'GBP', 'EUR', 'RWF', 'CNY', 'AED'));

alter table if exists public.brand_marketer_payout_accounts
  drop constraint if exists brand_marketer_payout_currency_check;
alter table if exists public.brand_marketer_payout_accounts
  add constraint brand_marketer_payout_currency_check
  check (currency in ('NGN', 'USD', 'GBP', 'EUR', 'RWF', 'CNY', 'AED'));

alter table if exists public.brand_marketer_commissions
  drop constraint if exists brand_marketer_commission_currency;
alter table if exists public.brand_marketer_commissions
  add constraint brand_marketer_commission_currency
  check (currency in ('NGN', 'USD', 'GBP', 'EUR', 'RWF', 'CNY', 'AED'));

comment on column public.profiles.billing_currency is
  'Account billing currency selected during onboarding: NGN, USD, GBP, EUR, RWF, CNY or AED.';

commit;
