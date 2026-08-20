-- Multi-recipient client deliveries.
-- When the same finished work is handed to more than one client, each client
-- still gets its own client_deliveries row (so each account sees its own copy),
-- but the rows are linked by a shared delivery_group_id for a clean audit trail.
alter table public.client_deliveries
  add column if not exists delivery_group_id uuid;

create index if not exists client_deliveries_group_idx
  on public.client_deliveries (delivery_group_id)
  where delivery_group_id is not null;
