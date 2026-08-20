-- Banner commerce catalogue, delivery pricing, design fees, and finance links.
-- Prices are deliberately administered values. Seeded catalogue rows start
-- without prices so the application never invents a customer-facing amount.

create extension if not exists "pgcrypto";

create table if not exists public.banner_products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  width_cm numeric(10,2) not null,
  height_cm numeric(10,2) not null,
  quality text not null default 'Standard',
  environment text not null default 'Indoor',
  prices jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint banner_products_dimensions_positive check (width_cm > 0 and height_cm > 0),
  constraint banner_products_prices_object check (jsonb_typeof(prices) = 'object')
);

create table if not exists public.banner_design_services (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  prices jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint banner_design_services_prices_object check (jsonb_typeof(prices) = 'object')
);

create table if not exists public.banner_countries (
  id uuid primary key default gen_random_uuid(),
  country_code text not null unique,
  country_name text not null,
  is_domestic boolean not null default false,
  delivery_mode text not null default 'quoted' check (delivery_mode in ('fixed','quoted')),
  prices jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint banner_countries_prices_object check (jsonb_typeof(prices) = 'object')
);

create table if not exists public.banner_delivery_zones (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.banner_countries(id) on delete cascade,
  name text not null,
  region text,
  city text,
  delivery_mode text not null default 'fixed' check (delivery_mode in ('fixed','quoted')),
  prices jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint banner_delivery_zones_prices_object check (jsonb_typeof(prices) = 'object')
);

create index if not exists idx_banner_products_active_sort
  on public.banner_products(active, sort_order, name);
create index if not exists idx_banner_countries_active_sort
  on public.banner_countries(active, sort_order, country_name);
create index if not exists idx_banner_delivery_zones_match
  on public.banner_delivery_zones(country_id, active, priority desc, region, city);

alter table public.banner_requests
  add column if not exists product_id uuid references public.banner_products(id) on delete set null,
  add column if not exists delivery_zone_id uuid references public.banner_delivery_zones(id) on delete set null,
  add column if not exists invoice_id uuid references public.finance_invoices(id) on delete set null,
  add column if not exists currency text,
  add column if not exists production_unit_price numeric(14,2),
  add column if not exists design_fee numeric(14,2),
  add column if not exists delivery_fee numeric(14,2),
  add column if not exists subtotal numeric(14,2),
  add column if not exists total numeric(14,2),
  add column if not exists delivery_billing_mode text default 'quoted'
    check (delivery_billing_mode in ('included','fixed','quoted','pickup')),
  add column if not exists pricing_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists asset_urls jsonb not null default '[]'::jsonb,
  add column if not exists design_content text,
  add column if not exists reference_notes text,
  add column if not exists ready_file_url text;

create index if not exists idx_banner_requests_invoice on public.banner_requests(invoice_id);
create index if not exists idx_banner_requests_product on public.banner_requests(product_id);

insert into public.banner_products
  (code, name, description, width_cm, height_cm, quality, environment, prices, active, sort_order)
values
  ('rollup-80x200', 'Compact roll-up banner', '80cm × 200cm · compact spaces', 80, 200, 'Standard', 'Indoor', '{}'::jsonb, true, 10),
  ('rollup-85x200', 'Standard roll-up banner', '85cm × 200cm · most popular size', 85, 200, 'Standard', 'Indoor', '{}'::jsonb, true, 20),
  ('rollup-100x200', 'Wide roll-up banner', '100cm × 200cm · increased visibility', 100, 200, 'Premium', 'Indoor', '{}'::jsonb, true, 30),
  ('rollup-120x200', 'Exhibition roll-up banner', '120cm × 200cm · trade-show format', 120, 200, 'Premium', 'Indoor', '{}'::jsonb, true, 40)
on conflict (code) do nothing;

insert into public.banner_design_services (code, name, description, prices, active)
values (
  'banner-new-design',
  'Create a new banner design',
  'CDS Space creates a print-ready banner from the client brief, content, brand assets, and references.',
  '{}'::jsonb,
  true
)
on conflict (code) do nothing;

insert into public.banner_countries
  (country_code, country_name, is_domestic, delivery_mode, prices, active, sort_order)
values
  ('NG', 'Nigeria', true, 'quoted', '{}'::jsonb, true, 10),
  ('AE', 'United Arab Emirates', false, 'quoted', '{}'::jsonb, true, 20),
  ('GB', 'United Kingdom', false, 'quoted', '{}'::jsonb, true, 30),
  ('US', 'United States', false, 'quoted', '{}'::jsonb, true, 40),
  ('RW', 'Rwanda', false, 'quoted', '{}'::jsonb, true, 50),
  ('CN', 'China', false, 'quoted', '{}'::jsonb, true, 60)
on conflict (country_code) do nothing;

alter table public.banner_products enable row level security;
alter table public.banner_design_services enable row level security;
alter table public.banner_countries enable row level security;
alter table public.banner_delivery_zones enable row level security;

drop policy if exists "Authenticated users can read active banner products" on public.banner_products;
create policy "Authenticated users can read active banner products"
  on public.banner_products for select to authenticated using (active = true);
drop policy if exists "Authenticated users can read active banner design services" on public.banner_design_services;
create policy "Authenticated users can read active banner design services"
  on public.banner_design_services for select to authenticated using (active = true);
drop policy if exists "Authenticated users can read active banner countries" on public.banner_countries;
create policy "Authenticated users can read active banner countries"
  on public.banner_countries for select to authenticated using (active = true);
drop policy if exists "Authenticated users can read active banner delivery zones" on public.banner_delivery_zones;
create policy "Authenticated users can read active banner delivery zones"
  on public.banner_delivery_zones for select to authenticated using (active = true);

grant select on public.banner_products, public.banner_design_services,
  public.banner_countries, public.banner_delivery_zones to authenticated;

comment on column public.banner_requests.pricing_snapshot is
  'Immutable product, design, and delivery price snapshot used when the order invoice was created.';
comment on column public.banner_requests.delivery_billing_mode is
  'quoted means delivery is excluded from this invoice and will be billed separately.';
