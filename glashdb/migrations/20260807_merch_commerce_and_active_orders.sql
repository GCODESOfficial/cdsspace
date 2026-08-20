-- Shared paid-order lifecycle, admin-managed commerce visuals, and Merch Studio.

create extension if not exists "pgcrypto";

alter table public.banner_products
  add column if not exists presentation_image_path text,
  add column if not exists presentation_image_name text;

create table if not exists public.merch_products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  unit_label text not null default 'items',
  prices jsonb not null default '{}'::jsonb,
  design_prices jsonb not null default '{}'::jsonb,
  variants jsonb not null default '{}'::jsonb,
  is_custom boolean not null default false,
  presentation_image_path text,
  presentation_image_name text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merch_products_prices_object check (jsonb_typeof(prices) = 'object'),
  constraint merch_products_design_prices_object check (jsonb_typeof(design_prices) = 'object'),
  constraint merch_products_variants_object check (jsonb_typeof(variants) = 'object')
);

insert into public.merch_products
  (code, name, description, unit_label, is_custom, active, sort_order)
values
  ('t-shirts', 'T-shirts', 'Branded T-shirts for teams, events, campaigns and customer gifts.', 'shirts', false, true, 10),
  ('hoodies', 'Hoodies', 'Premium branded hoodies for teams, communities and campaigns.', 'hoodies', false, true, 20),
  ('cups', 'Cups', 'Branded drinkware for offices, events and customer gifts.', 'cups', false, true, 30),
  ('flash-drives', 'Flash drives', 'Custom-branded flash drives for presentations, events and handovers.', 'drives', false, true, 40),
  ('wrist-bands', 'Wrist bands', 'Branded wrist bands for events, communities and campaigns.', 'bands', false, true, 50),
  ('tote-bags', 'Tote bags', 'Reusable branded tote bags for retail, events and gift packs.', 'bags', false, true, 60),
  ('custom-gift-box', 'Custom gift box', 'A coordinated branded gift box assembled around your campaign or occasion.', 'boxes', false, true, 70),
  ('custom-item', 'Custom item', 'Upload a sample of the item and the print you need. CDS Space will review the specification and prepare a custom invoice.', 'items', true, true, 80)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    unit_label = excluded.unit_label,
    is_custom = excluded.is_custom,
    sort_order = excluded.sort_order,
    updated_at = now();

alter table public.merch_orders
  add column if not exists display_id text,
  add column if not exists product_id uuid references public.merch_products(id) on delete set null,
  add column if not exists invoice_id uuid references public.finance_invoices(id) on delete set null,
  add column if not exists quotation_id uuid references public.finance_quotations(id) on delete set null,
  add column if not exists is_custom boolean not null default false,
  add column if not exists execution_mode text not null default 'upload',
  add column if not exists design_brief text,
  add column if not exists reference_notes text,
  add column if not exists sample_file_urls jsonb not null default '[]'::jsonb,
  add column if not exists print_file_urls jsonb not null default '[]'::jsonb,
  add column if not exists product_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists pricing_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists draft_payload jsonb not null default '{}'::jsonb,
  add column if not exists draft_step smallint not null default 1,
  add column if not exists fulfillment_type text,
  add column if not exists pickup_location_id uuid references public.banner_pickup_locations(id) on delete set null,
  add column if not exists delivery_zone_id uuid references public.banner_delivery_zones(id) on delete set null,
  add column if not exists country text,
  add column if not exists state text,
  add column if not exists city text,
  add column if not exists street_address text,
  add column if not exists recipient_name text,
  add column if not exists phone_number text,
  add column if not exists instructions text,
  add column if not exists delivery_billing_mode text,
  add column if not exists unit_price numeric(14,2),
  add column if not exists design_fee numeric(14,2),
  add column if not exists delivery_fee numeric(14,2),
  add column if not exists subtotal numeric(14,2),
  add column if not exists total numeric(14,2),
  add column if not exists expected_delivery_at timestamptz,
  add column if not exists activated_at timestamptz,
  add column if not exists completed_at timestamptz;

create index if not exists idx_merch_products_active_sort
  on public.merch_products(active, sort_order, name);
create index if not exists idx_merch_orders_invoice
  on public.merch_orders(invoice_id);
create index if not exists idx_merch_orders_product
  on public.merch_orders(product_id);

alter table public.merch_products enable row level security;
drop policy if exists "Clients can read active merch products" on public.merch_products;
create policy "Clients can read active merch products"
  on public.merch_products for select to authenticated using (active = true);
grant select on public.merch_products to authenticated;

drop policy if exists allow_all_merch_orders on public.merch_orders;
drop policy if exists "Clients can read own merch orders" on public.merch_orders;
drop policy if exists "Clients can create own merch orders" on public.merch_orders;
drop policy if exists "Clients can update own merch drafts" on public.merch_orders;
create policy "Clients can read own merch orders"
  on public.merch_orders for select to authenticated using (user_id = auth.uid());
create policy "Clients can create own merch orders"
  on public.merch_orders for insert to authenticated with check (user_id = auth.uid());
create policy "Clients can update own merch drafts"
  on public.merch_orders for update to authenticated
  using (user_id = auth.uid() and upper(status) = 'DRAFT')
  with check (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sales-commerce', 'sales-commerce', false, 20971520, null)
on conflict (id) do update
set file_size_limit = greatest(coalesce(storage.buckets.file_size_limit, 0), excluded.file_size_limit),
    public = false;

create or replace function public.activate_paid_client_orders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status::text = 'paid' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update public.banner_requests
       set status = 'ACTIVE',
           updated_at = now()
     where invoice_id = new.id
       and status::text in ('AWAITING_PAYMENT', 'PENDING');

    update public.merch_orders
       set status = 'ACTIVE',
           activated_at = coalesce(activated_at, now()),
           updated_at = now()
     where invoice_id = new.id
       and upper(status) in ('AWAITING_PAYMENT', 'PENDING');
  end if;
  return new;
end;
$$;

drop trigger if exists finance_invoice_queue_paid_banner on public.finance_invoices;
drop trigger if exists finance_invoice_activate_client_orders on public.finance_invoices;
create trigger finance_invoice_activate_client_orders
after insert or update of status on public.finance_invoices
for each row execute function public.activate_paid_client_orders();

-- Repair orders that were already paid before the active lifecycle was added.
update public.banner_requests br
   set status = 'ACTIVE', updated_at = now()
  from public.finance_invoices fi
 where fi.id = br.invoice_id
   and fi.status = 'paid'
   and br.status::text in ('AWAITING_PAYMENT', 'PENDING');

update public.merch_orders mo
   set status = 'ACTIVE', activated_at = coalesce(mo.activated_at, now()), updated_at = now()
  from public.finance_invoices fi
 where fi.id = mo.invoice_id
   and fi.status = 'paid'
   and upper(mo.status) in ('AWAITING_PAYMENT', 'PENDING');

-- Merch orders share the immutable activity stream used by design and banner work.
alter table public.status_updates
  drop constraint if exists status_updates_entity_type_check;
alter table public.status_updates
  add constraint status_updates_entity_type_check
  check (entity_type = any (array['design_request'::text, 'banner_request'::text, 'merch_order'::text]));

comment on function public.activate_paid_client_orders() is
  'Moves paid banner and merch orders directly into active production for every invoice confirmation path.';
