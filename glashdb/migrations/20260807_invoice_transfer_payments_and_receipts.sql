-- Public invoice bank-transfer submissions, admin confirmation, and branded
-- receipts. A transfer submission is evidence only: it never marks an invoice
-- paid until an authorised finance admin confirms it.

create extension if not exists "pgcrypto";

create table if not exists public.invoice_payment_submissions (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.finance_invoices(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  method text not null default 'bank_transfer' check (method in ('bank_transfer', 'paystack')),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected', 'cancelled')),
  amount numeric(14,2) not null,
  currency text not null,
  payer_name text,
  payer_email text,
  transfer_reference text,
  proof_storage_path text,
  proof_file_name text,
  proof_mime_type text,
  proof_size_bytes bigint,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_invoice_payment_submissions_invoice
  on public.invoice_payment_submissions(invoice_id, submitted_at desc);
create index if not exists idx_invoice_payment_submissions_pending
  on public.invoice_payment_submissions(status, submitted_at desc);
create unique index if not exists idx_invoice_payment_one_pending
  on public.invoice_payment_submissions(invoice_id)
  where status = 'pending';

create table if not exists public.finance_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  invoice_id uuid not null unique references public.finance_invoices(id) on delete restrict,
  payment_submission_id uuid references public.invoice_payment_submissions(id) on delete set null,
  public_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  client_name text not null,
  client_email text,
  amount numeric(14,2) not null,
  currency text not null,
  payment_method text not null default 'bank_transfer',
  payment_reference text,
  paid_at timestamptz not null default now(),
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_finance_receipts_paid_at
  on public.finance_receipts(paid_at desc);

create or replace function public.issue_invoice_receipt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_payment public.invoice_payment_submissions%rowtype;
  generated_receipt_number text;
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select * into pending_payment
      from public.invoice_payment_submissions
     where invoice_id = new.id
       and status = 'pending'
     order by submitted_at desc
     limit 1;

    if pending_payment.id is not null then
      update public.invoice_payment_submissions
         set status = 'confirmed',
             reviewed_at = coalesce(reviewed_at, now()),
             updated_at = now()
       where id = pending_payment.id;
    end if;

    generated_receipt_number := 'RCT-' || to_char(now(), 'YYYYMM') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

    insert into public.finance_receipts (
      receipt_number,
      invoice_id,
      payment_submission_id,
      client_name,
      client_email,
      amount,
      currency,
      payment_method,
      payment_reference,
      paid_at
    ) values (
      generated_receipt_number,
      new.id,
      pending_payment.id,
      coalesce(nullif(new.client_name, ''), 'CDS Space Client'),
      new.client_email,
      new.total,
      new.currency,
      coalesce(pending_payment.method, 'bank_transfer'),
      pending_payment.transfer_reference,
      now()
    ) on conflict (invoice_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists finance_invoice_issue_receipt on public.finance_invoices;
create trigger finance_invoice_issue_receipt
after insert or update of status on public.finance_invoices
for each row execute function public.issue_invoice_receipt();

-- Give historical paid invoices the same downloadable receipt experience.
insert into public.finance_receipts (
  receipt_number,
  invoice_id,
  client_name,
  client_email,
  amount,
  currency,
  payment_method,
  paid_at
)
select
  'RCT-' || to_char(coalesce(invoice.issue_date::timestamptz, invoice.created_at, now()), 'YYYYMM') || '-' || upper(substr(replace(invoice.id::text, '-', ''), 1, 8)),
  invoice.id,
  coalesce(nullif(invoice.client_name, ''), 'CDS Space Client'),
  invoice.client_email,
  invoice.total,
  invoice.currency,
  'bank_transfer',
  coalesce(invoice.created_at, now())
from public.finance_invoices invoice
where invoice.status = 'paid'
on conflict (invoice_id) do nothing;

alter table public.invoice_payment_submissions enable row level security;
alter table public.finance_receipts enable row level security;

drop policy if exists "Clients can read own invoice payment submissions" on public.invoice_payment_submissions;
create policy "Clients can read own invoice payment submissions"
  on public.invoice_payment_submissions for select to authenticated
  using (
    exists (
      select 1 from public.finance_invoices invoice
      where invoice.id = invoice_payment_submissions.invoice_id
        and invoice.user_id = auth.uid()
    )
  );

drop policy if exists "Clients can read own finance receipts" on public.finance_receipts;
create policy "Clients can read own finance receipts"
  on public.finance_receipts for select to authenticated
  using (
    exists (
      select 1 from public.finance_invoices invoice
      where invoice.id = finance_receipts.invoice_id
        and invoice.user_id = auth.uid()
    )
  );

grant select on public.invoice_payment_submissions, public.finance_receipts to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

comment on table public.invoice_payment_submissions is
  'Client-declared payment evidence awaiting independent finance-admin confirmation.';
comment on table public.finance_receipts is
  'Immutable public-token receipts issued only after an invoice enters paid status.';
