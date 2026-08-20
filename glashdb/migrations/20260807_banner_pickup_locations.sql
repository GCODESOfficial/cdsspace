-- Country-linked pickup locations for Banner Studio fulfilment.

create extension if not exists "pgcrypto";

create table if not exists public.banner_pickup_locations (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.banner_countries(id) on delete cascade,
  name text not null,
  address_line text not null,
  region text,
  city text,
  instructions text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint banner_pickup_locations_name_not_blank check (btrim(name) <> ''),
  constraint banner_pickup_locations_address_not_blank check (btrim(address_line) <> '')
);

create index if not exists idx_banner_pickup_locations_country_active_sort
  on public.banner_pickup_locations(country_id, active, sort_order, name);

alter table public.banner_requests
  add column if not exists pickup_location_id uuid
    references public.banner_pickup_locations(id) on delete set null;

create index if not exists idx_banner_requests_pickup_location
  on public.banner_requests(pickup_location_id);

alter table public.banner_pickup_locations enable row level security;

drop policy if exists "Authenticated users can read active banner pickup locations"
  on public.banner_pickup_locations;
create policy "Authenticated users can read active banner pickup locations"
  on public.banner_pickup_locations for select to authenticated using (active = true);

grant select on public.banner_pickup_locations to authenticated;

comment on table public.banner_pickup_locations is
  'Admin-managed Banner Studio pickup locations linked to an available delivery country.';
comment on column public.banner_requests.pickup_location_id is
  'The validated pickup location selected by the client when pickup fulfilment is available.';
