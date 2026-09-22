-- Bank-statement reconciliation and invoice part-payment ledger.
-- Additive, idempotent, and compatible with historical paid invoices.

create extension if not exists "pgcrypto";

alter table public.finance_invoices
  add column if not exists amount_paid numeric(14,2) not null default 0,
  add column if not exists balance_due numeric(14,2) not null default 0,
  add column if not exists payment_percentage numeric(7,2) not null default 0,
  add column if not exists last_payment_at timestamptz;

alter table public.finance_invoices
  drop constraint if exists finance_invoices_status_check;
alter table public.finance_invoices
  add constraint finance_invoices_status_check
  check (status in ('draft','sent','partially_paid','paid','overdue','cancelled'));

create table if not exists public.finance_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.finance_invoices(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null,
  paid_on date not null default current_date,
  payment_method text not null default 'bank_transfer',
  payment_reference text,
  source_type text not null default 'manual',
  source_id text,
  bank_transaction_id uuid,
  notes text,
  recorded_by text,
  created_at timestamptz not null default now()
);

create index if not exists finance_invoice_payments_invoice_idx
  on public.finance_invoice_payments(invoice_id, paid_on desc, created_at desc);
create unique index if not exists finance_invoice_payments_source_unique
  on public.finance_invoice_payments(source_type, source_id)
  where source_id is not null;

create table if not exists public.finance_bank_statements (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_path text not null,
  bank_name text,
  account_number text,
  period_start date,
  period_end date,
  total_credit numeric(14,2) not null default 0,
  total_debit numeric(14,2) not null default 0,
  uploaded_at timestamptz not null default now(),
  notes text
);

alter table public.finance_bank_statements
  add column if not exists bank_account_id uuid references public.sales_bank_accounts(id) on delete set null,
  add column if not exists currency text not null default 'NGN',
  add column if not exists file_sha256 text,
  add column if not exists processing_status text not null default 'pending',
  add column if not exists row_count integer not null default 0,
  add column if not exists matched_count integer not null default 0,
  add column if not exists unmatched_count integer not null default 0,
  add column if not exists other_inflow_count integer not null default 0,
  add column if not exists review_count integer not null default 0,
  add column if not exists duplicate_count integer not null default 0,
  add column if not exists processing_error text,
  add column if not exists processed_at timestamptz,
  add column if not exists uploaded_by text;

alter table public.finance_bank_statements
  drop constraint if exists finance_bank_statements_processing_status_check;
alter table public.finance_bank_statements
  add constraint finance_bank_statements_processing_status_check
  check (processing_status in ('pending','processing','completed','completed_with_warnings','failed'));

create unique index if not exists finance_bank_statements_file_account_unique
  on public.finance_bank_statements(coalesce(bank_account_id::text, lower(coalesce(account_number, ''))), file_sha256)
  where file_sha256 is not null;

create table if not exists public.finance_bank_transactions (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.finance_bank_statements(id) on delete cascade,
  txn_date date not null,
  description text not null,
  amount numeric(14,2) not null check (amount >= 0),
  txn_type text not null check (txn_type in ('credit', 'debit')),
  category text,
  matched_invoice_id uuid references public.finance_invoices(id) on delete set null,
  matched_expenditure_id uuid references public.finance_expenditures(id) on delete set null,
  reconciled boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.finance_bank_transactions
  add column if not exists transaction_reference text,
  add column if not exists balance numeric(14,2),
  add column if not exists currency text not null default 'NGN',
  add column if not exists dedupe_key text,
  add column if not exists match_status text not null default 'unmatched',
  add column if not exists match_confidence numeric(5,2),
  add column if not exists match_reason text,
  add column if not exists matched_inflow_id uuid references public.finance_inflows(id) on delete set null,
  add column if not exists raw_data jsonb not null default '{}'::jsonb;

alter table public.finance_bank_transactions
  drop constraint if exists finance_bank_transactions_match_status_check;
alter table public.finance_bank_transactions
  add constraint finance_bank_transactions_match_status_check
  check (match_status in ('unmatched','invoice_payment','already_recorded','inflow_recorded','expense_recorded','duplicate','needs_review'));

create index if not exists finance_bank_transactions_statement_idx
  on public.finance_bank_transactions(statement_id, txn_date, id);
create index if not exists finance_bank_transactions_invoice_idx
  on public.finance_bank_transactions(matched_invoice_id) where matched_invoice_id is not null;
create unique index if not exists finance_bank_transactions_dedupe_unique
  on public.finance_bank_transactions(dedupe_key) where dedupe_key is not null;

alter table public.finance_invoice_payments
  drop constraint if exists finance_invoice_payments_bank_transaction_id_fkey;
alter table public.finance_invoice_payments
  add constraint finance_invoice_payments_bank_transaction_id_fkey
  foreign key (bank_transaction_id) references public.finance_bank_transactions(id) on delete set null;
create unique index if not exists finance_invoice_payments_bank_transaction_unique
  on public.finance_invoice_payments(bank_transaction_id) where bank_transaction_id is not null;

alter table public.finance_inflows
  add column if not exists bank_transaction_id uuid references public.finance_bank_transactions(id) on delete set null;
create unique index if not exists finance_inflows_bank_transaction_unique
  on public.finance_inflows(bank_transaction_id) where bank_transaction_id is not null;

alter table public.finance_expenditures
  add column if not exists bank_transaction_id uuid references public.finance_bank_transactions(id) on delete set null;
create unique index if not exists finance_expenditures_bank_transaction_unique
  on public.finance_expenditures(bank_transaction_id) where bank_transaction_id is not null;

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
  if new.status not in ('cancelled', 'draft') then
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

drop trigger if exists finance_invoice_normalize_payment_summary on public.finance_invoices;
create trigger finance_invoice_normalize_payment_summary
before insert or update of total, amount_paid, status on public.finance_invoices
for each row execute function public.normalize_finance_invoice_payment_summary();

create or replace function public.record_finance_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_currency text,
  p_paid_on date default current_date,
  p_payment_method text default 'bank_transfer',
  p_payment_reference text default null,
  p_source_type text default 'manual',
  p_source_id text default null,
  p_bank_transaction_id uuid default null,
  p_notes text default null,
  p_recorded_by text default null
)
returns public.finance_invoice_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.finance_invoices%rowtype;
  existing public.finance_invoice_payments%rowtype;
  payment public.finance_invoice_payments%rowtype;
  outstanding numeric(14,2);
  next_paid numeric(14,2);
begin
  if p_source_id is not null then
    select * into existing
      from public.finance_invoice_payments
     where source_type = p_source_type and source_id = p_source_id
     limit 1;
    if existing.id is not null then return existing; end if;
  end if;

  select * into target from public.finance_invoices where id = p_invoice_id for update;
  if target.id is null then raise exception 'Invoice not found.'; end if;
  if target.status = 'cancelled' then raise exception 'A cancelled invoice cannot receive payments.'; end if;
  if upper(coalesce(p_currency, '')) <> upper(target.currency) then
    raise exception 'Payment currency does not match the invoice currency.';
  end if;
  outstanding := greatest(target.total - target.amount_paid, 0);
  if outstanding <= 0 then raise exception 'This invoice is already fully paid.'; end if;
  if p_amount <= 0 then raise exception 'Payment amount must be greater than zero.'; end if;
  if p_amount > outstanding then raise exception 'Payment amount cannot exceed the outstanding balance.'; end if;

  insert into public.finance_invoice_payments (
    invoice_id, amount, currency, paid_on, payment_method, payment_reference,
    source_type, source_id, bank_transaction_id, notes, recorded_by
  ) values (
    p_invoice_id, p_amount, upper(p_currency), coalesce(p_paid_on, current_date),
    coalesce(nullif(p_payment_method, ''), 'bank_transfer'), nullif(p_payment_reference, ''),
    coalesce(nullif(p_source_type, ''), 'manual'), p_source_id, p_bank_transaction_id,
    nullif(p_notes, ''), p_recorded_by
  ) returning * into payment;

  select coalesce(sum(amount), 0) into next_paid
    from public.finance_invoice_payments where invoice_id = p_invoice_id;
  next_paid := least(next_paid, target.total);

  update public.finance_invoices
     set amount_paid = next_paid,
         status = case when next_paid >= target.total then 'paid' else 'partially_paid' end,
         last_payment_at = now()
   where id = p_invoice_id;

  return payment;
end;
$$;

-- Keep direct legacy status transitions internally consistent. New application
-- writes use record_finance_invoice_payment and therefore retain full detail.
create or replace function public.capture_legacy_paid_invoice_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and not exists (select 1 from public.finance_invoice_payments p where p.invoice_id = new.id) then
    insert into public.finance_invoice_payments (
      invoice_id, amount, currency, paid_on, payment_method, source_type, source_id, notes, recorded_by
    ) values (
      new.id, new.total, new.currency, coalesce(new.issue_date, current_date), 'bank_transfer',
      'status_transition', new.id::text, 'Captured from a direct paid-status transition', 'System'
    ) on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists finance_invoice_capture_legacy_payment on public.finance_invoices;
create trigger finance_invoice_capture_legacy_payment
after insert or update of status on public.finance_invoices
for each row execute function public.capture_legacy_paid_invoice_payment();

update public.finance_invoices
   set amount_paid = total,
       balance_due = 0,
       payment_percentage = case when total > 0 then 100 else 0 end,
       last_payment_at = coalesce(last_payment_at, created_at)
 where status = 'paid' and amount_paid < total;

insert into public.finance_invoice_payments (
  invoice_id, amount, currency, paid_on, payment_method, source_type, source_id, notes, recorded_by
)
select id, total, currency, coalesce(issue_date, current_date), 'bank_transfer',
       'legacy', id::text, 'Historical paid invoice balance', 'Migration'
  from public.finance_invoices invoice
 where invoice.status = 'paid'
   and invoice.total > 0
   and not exists (select 1 from public.finance_invoice_payments payment where payment.invoice_id = invoice.id)
on conflict do nothing;

-- Columns added with defaults need an explicit legacy backfill. Open invoices
-- without payment records owe their full total; cancelled invoices carry no
-- collectible balance.
update public.finance_invoices invoice
   set amount_paid = 0,
       status = case when invoice.status = 'partially_paid' then 'sent' else invoice.status end
 where invoice.status not in ('paid', 'cancelled')
   and not exists (select 1 from public.finance_invoice_payments payment where payment.invoice_id = invoice.id);

update public.finance_invoices invoice
   set amount_paid = 0,
       balance_due = 0,
       payment_percentage = 0
 where invoice.status = 'cancelled'
   and not exists (select 1 from public.finance_invoice_payments payment where payment.invoice_id = invoice.id);

update public.finance_invoices invoice
   set amount_paid = totals.paid,
       balance_due = greatest(invoice.total - totals.paid, 0),
       payment_percentage = case when invoice.total > 0 then round(least(100, totals.paid / invoice.total * 100), 2) else 0 end
  from (
    select invoice_id, least(sum(amount), max(invoice.total)) as paid
      from public.finance_invoice_payments payment
      join public.finance_invoices invoice on invoice.id = payment.invoice_id
     group by invoice_id
  ) totals
 where invoice.id = totals.invoice_id;

alter table public.finance_invoice_payments enable row level security;
alter table public.finance_bank_statements enable row level security;
alter table public.finance_bank_transactions enable row level security;

-- Earlier bootstrap SQL exposed these sensitive finance tables and statement
-- objects through policies granted to every API role. Reconciliation now runs
-- only through permission-checked server routes using the service role.
drop policy if exists "Allow read on bank_statements" on public.finance_bank_statements;
drop policy if exists "Allow write on bank_statements" on public.finance_bank_statements;
drop policy if exists "Allow read on bank_transactions" on public.finance_bank_transactions;
drop policy if exists "Allow write on bank_transactions" on public.finance_bank_transactions;
drop policy if exists finance_bank_statements_all_anon on public.finance_bank_statements;
drop policy if exists finance_bank_statements_all_authenticated on public.finance_bank_statements;
drop policy if exists finance_bank_transactions_all_anon on public.finance_bank_transactions;
drop policy if exists finance_bank_transactions_all_authenticated on public.finance_bank_transactions;
revoke all on public.finance_invoice_payments from anon, authenticated;
revoke all on public.finance_bank_statements from anon, authenticated;
revoke all on public.finance_bank_transactions from anon, authenticated;
revoke execute on function public.record_finance_invoice_payment(uuid,numeric,text,date,text,text,text,text,uuid,text,text) from public, anon, authenticated;

grant select, insert, update, delete on public.finance_invoice_payments to service_role;
grant select, insert, update, delete on public.finance_bank_statements to service_role;
grant select, insert, update, delete on public.finance_bank_transactions to service_role;
grant execute on function public.record_finance_invoice_payment(uuid,numeric,text,date,text,text,text,text,uuid,text,text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bank-statements', 'bank-statements', false, 15728640,
  array['application/pdf','text/csv','application/csv','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Allow authenticated upload to bank-statements" on storage.objects;
drop policy if exists "Allow authenticated read on bank-statements" on storage.objects;

notify pgrst, 'reload schema';
