-- An invoice whose recorded payments cover its total is paid, whatever status
-- the last writer sent. The payment summary trigger previously left drafts
-- alone, so an editor autosave that re-sent status 'draft' could pull a fully
-- paid invoice back to draft (INV-202609-5999). Only cancellation now opts an
-- invoice out of payment-derived status; a draft with no payments stays draft.

create or replace function public.normalize_finance_invoice_payment_summary()
returns trigger
language plpgsql
as $$
begin
  new.amount_paid := greatest(0, least(coalesce(new.amount_paid, 0), greatest(coalesce(new.total, 0), 0)));
  if new.status = 'paid'
     and (tg_op = 'INSERT' or old.status is distinct from 'paid')
     and new.amount_paid < coalesce(new.total, 0) then
    new.amount_paid := greatest(coalesce(new.total, 0), 0);
  end if;
  new.balance_due := case
    when new.status = 'cancelled' then 0
    else greatest(coalesce(new.total, 0) - new.amount_paid, 0)
  end;
  new.payment_percentage := case
    when coalesce(new.total, 0) <= 0 then 0
    else round(least(100, (new.amount_paid / new.total) * 100), 2)
  end;
  if new.status <> 'cancelled' then
    if new.amount_paid > 0 and new.balance_due <= 0 and coalesce(new.total, 0) > 0 then
      new.status := 'paid';
    elsif new.amount_paid > 0 and new.balance_due > 0 then
      new.status := 'partially_paid';
    elsif new.status in ('paid', 'partially_paid') then
      new.status := 'sent';
    end if;
  end if;
  return new;
end;
$$;

-- A commission reversed when an invoice left paid status is earned again when
-- the invoice returns to paid; the insert alone hit the unique invoice_id row
-- and silently kept it reversed.
create or replace function public.credit_invoice_marketer_commission()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'paid'
     and old.status is distinct from 'paid'
     and new.marketer_user_id is not null then
    insert into public.brand_marketer_commissions (
      marketer_user_id, invoice_id, marketer_code, client_user_id,
      client_name, client_email, invoice_number, invoice_total, currency,
      commission_rate, commission_amount, status, earned_at
    ) values (
      new.marketer_user_id, new.id, new.marketer_code, new.user_id,
      new.client_name, new.client_email, new.invoice_number, new.total, new.currency,
      0.05, round(new.total * 0.05, 2), 'earned', now()
    ) on conflict (invoice_id) do update
      set status = 'earned', updated_at = now()
      where public.brand_marketer_commissions.status = 'reversed';
  elsif new.status <> 'paid' and old.status = 'paid' then
    update public.brand_marketer_commissions
       set status = 'reversed', updated_at = now(), notes = coalesce(notes, 'Invoice moved out of paid status.')
     where invoice_id = new.id;
  end if;
  return new;
end;
$$;

-- Re-derive status for live drafts that already carry payments.
update public.finance_invoices
   set status = status
 where status = 'draft'
   and amount_paid > 0
   and deleted_at is null;
