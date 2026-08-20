-- Allow every banner size to carry Standard and Premium material prices at
-- the same time. Existing single-tier prices are preserved in their original
-- material tier; no new customer-facing amount is invented during migration.

alter table public.banner_products
  add column if not exists standard_prices jsonb not null default '{}'::jsonb,
  add column if not exists premium_prices jsonb not null default '{}'::jsonb;

update public.banner_products
set standard_prices = prices
where lower(coalesce(quality, 'standard')) <> 'premium'
  and standard_prices = '{}'::jsonb
  and prices <> '{}'::jsonb;

update public.banner_products
set premium_prices = prices
where lower(coalesce(quality, 'standard')) = 'premium'
  and premium_prices = '{}'::jsonb
  and prices <> '{}'::jsonb;

alter table public.banner_products
  drop constraint if exists banner_products_standard_prices_object,
  drop constraint if exists banner_products_premium_prices_object;

alter table public.banner_products
  add constraint banner_products_standard_prices_object
    check (jsonb_typeof(standard_prices) = 'object'),
  add constraint banner_products_premium_prices_object
    check (jsonb_typeof(premium_prices) = 'object');

comment on column public.banner_products.standard_prices is
  'Admin-approved per-currency production prices for Standard banner material.';
comment on column public.banner_products.premium_prices is
  'Admin-approved per-currency production prices for Premium banner material.';
