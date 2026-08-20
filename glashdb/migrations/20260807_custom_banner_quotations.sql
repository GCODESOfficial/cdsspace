-- Custom banner dimensions and client-linked quotation workflow.
-- Custom requests remain outside the financial books at zero value until an
-- authorised finance admin supplies real prices and converts the quotation.

alter table public.finance_quotations
  add column if not exists user_id uuid references public.profiles(id) on delete set null;

create index if not exists idx_finance_quotations_user_created
  on public.finance_quotations(user_id, created_at desc);

alter table public.banner_requests
  add column if not exists quotation_id uuid references public.finance_quotations(id) on delete set null,
  add column if not exists is_custom boolean not null default false,
  add column if not exists custom_width numeric(14,4),
  add column if not exists custom_height numeric(14,4),
  add column if not exists dimension_unit text;

create index if not exists idx_banner_requests_quotation
  on public.banner_requests(quotation_id);

alter table public.banner_requests
  drop constraint if exists banner_requests_custom_dimensions_check;

alter table public.banner_requests
  add constraint banner_requests_custom_dimensions_check
  check (
    not is_custom
    or (
      custom_width > 0
      and custom_height > 0
      and dimension_unit in ('mm', 'cm', 'm', 'in', 'ft', 'yd')
    )
  );

comment on column public.finance_quotations.user_id is
  'Client account that owns a custom quotation and will receive the converted invoice.';
comment on column public.banner_requests.quotation_id is
  'Internal unpriced quotation created for a custom banner request.';
comment on column public.banner_requests.is_custom is
  'True when the client supplied exact dimensions instead of selecting a catalogue product.';
comment on column public.banner_requests.dimension_unit is
  'Unit chosen by the client for custom dimensions: mm, cm, m, in, ft or yd.';
