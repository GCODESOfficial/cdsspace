-- Client subscription checkout, invoice linkage, and Supreme per-design pricing.

begin;

alter table public.plan_pricing
  add column if not exists price_gbp numeric(12,2) not null default 0,
  add column if not exists price_eur numeric(12,2) not null default 0,
  add column if not exists price_cny numeric(12,2) not null default 0,
  add column if not exists price_aed numeric(12,2) not null default 0;

-- Pricing changes are made through the permission-checked admin API. Public
-- reads remain available for the existing plan comparison experience.
drop policy if exists "Allow authenticated write on plan_pricing" on public.plan_pricing;

alter table public.subscriptions
  add column if not exists design_quantity integer not null default 1,
  add column if not exists unit_price numeric(14,2),
  add column if not exists amount numeric(14,2),
  add column if not exists currency text,
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists invoice_id uuid references public.finance_invoices(id) on delete set null,
  add column if not exists activated_at timestamptz;

update public.subscriptions
   set design_quantity = case
     when lower(plan) = 'startup' then 5
     when lower(plan) = 'scaleup' then 10
     else design_quantity
   end
 where invoice_id is null
   and design_quantity = 1;

alter table public.subscriptions
  drop constraint if exists subscriptions_design_quantity_check,
  add constraint subscriptions_design_quantity_check check (design_quantity between 1 and 1000),
  drop constraint if exists subscriptions_payment_status_check,
  add constraint subscriptions_payment_status_check
    check (payment_status in ('unpaid', 'pending', 'paid', 'cancelled', 'failed')),
  drop constraint if exists subscriptions_currency_check,
  add constraint subscriptions_currency_check
    check (currency is null or currency in ('NGN', 'USD', 'GBP', 'EUR', 'RWF', 'CNY', 'AED'));

create unique index if not exists subscriptions_invoice_id_unique
  on public.subscriptions(invoice_id)
  where invoice_id is not null;

create index if not exists subscriptions_user_checkout_idx
  on public.subscriptions(user_id, status, created_at desc);

create or replace function public.activate_subscription_from_paid_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update public.subscriptions
       set status = 'replaced',
           updated_at = now()
     where user_id = new.user_id
       and status = 'active'
       and invoice_id is distinct from new.id;

    update public.subscriptions
       set status = 'active',
           payment_status = 'paid',
           activated_at = coalesce(activated_at, now()),
           updated_at = now()
     where invoice_id = new.id
       and status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists finance_invoice_activate_subscription on public.finance_invoices;
create trigger finance_invoice_activate_subscription
after insert or update of status on public.finance_invoices
for each row execute function public.activate_subscription_from_paid_invoice();

comment on column public.plan_pricing.price_usd is 'Monthly plan price, or per-design unit price for Supreme.';
comment on column public.subscriptions.design_quantity is 'Purchased design quantity; Supreme is billed as unit price multiplied by this value.';
comment on column public.subscriptions.invoice_id is 'Invoice whose paid transition activates this subscription.';

commit;
