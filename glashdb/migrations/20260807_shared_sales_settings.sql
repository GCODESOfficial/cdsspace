-- Promote banner-originated commerce controls into shared Sales Hub settings.
-- Physical names remain unchanged so the currently deployed application keeps
-- working while the shared Sales Settings API is released without downtime.

alter table public.banner_discount_codes
  add column if not exists applies_to text[] not null default array['all']::text[];

comment on table public.banner_countries is
  'Shared Sales Hub countries available for fulfilment across client orders and service deliveries.';
comment on table public.banner_delivery_zones is
  'Shared Sales Hub regional delivery pricing overrides for client orders and service deliveries.';
comment on table public.banner_pickup_locations is
  'Shared Sales Hub pickup locations for client orders and service deliveries.';
comment on table public.banner_discount_codes is
  'Shared Sales Hub percentage-based Special Offer Codes for eligible client orders.';
comment on column public.banner_discount_codes.applies_to is
  'Order families eligible for this Special Offer Code. The all value makes it available across services.';
comment on column public.banner_requests.delivery_zone_id is
  'Shared Sales Hub delivery zone selected for this banner order.';
comment on column public.banner_requests.pickup_location_id is
  'Shared Sales Hub pickup location selected for this banner order.';

notify pgrst, 'reload schema';
