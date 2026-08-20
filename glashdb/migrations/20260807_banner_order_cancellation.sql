-- Preserve cancelled client banner orders for audit while preventing unpaid
-- work from entering production.

alter type public.banner_status add value if not exists 'CANCELLED';

