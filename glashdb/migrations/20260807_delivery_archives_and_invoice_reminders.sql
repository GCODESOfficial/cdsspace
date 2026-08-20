-- Preserve completed client handovers while allowing authorised admins to
-- archive them, and retain an auditable record of invoice payment reminders.

alter table public.client_deliveries
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text,
  add column if not exists archived_from_status text;

alter table public.client_deliveries
  drop constraint if exists client_deliveries_status_check;

alter table public.client_deliveries
  add constraint client_deliveries_status_check
  check (status in (
    'draft', 'assigned', 'submitted', 'revision_requested',
    'awaiting_account', 'published', 'rejected', 'archived'
  ));

create index if not exists idx_client_deliveries_archived
  on public.client_deliveries(archived_at desc)
  where status = 'archived';

comment on column public.client_deliveries.archived_from_status is
  'The client-delivery state restored when an archived handover is made available again.';

create table if not exists public.invoice_payment_reminders (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.finance_invoices(id) on delete cascade,
  client_user_id uuid references public.profiles(id) on delete set null,
  sent_by text not null,
  message text not null,
  chat_message_id uuid references public.chat_messages(id) on delete set null,
  chat_sent_at timestamptz,
  email_to text,
  email_sent_at timestamptz,
  email_error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_invoice_payment_reminders_invoice
  on public.invoice_payment_reminders(invoice_id, created_at desc);

alter table public.invoice_payment_reminders enable row level security;

comment on table public.invoice_payment_reminders is
  'Auditable client-chat and email reminders for invoices that are still awaiting payment.';
