-- Invoices now expire.
--
-- An unpaid invoice stayed open forever, so the outstanding figure carried
-- quotes nobody ever intended to pay and the finance team had to cancel them
-- by hand. A new invoice is valid for 28 days: the date is stamped on it when
-- it is raised, shown to the client, and enforced by a daily sweep.
--
-- Deliberately not backfilled. Invoices raised before this migration have no
-- expiry date and are never auto-cancelled, because their clients were never
-- told of a deadline.

begin;

alter table public.finance_invoices
  add column if not exists auto_cancel_at timestamptz;

comment on column public.finance_invoices.auto_cancel_at is
  'When an unpaid invoice expires and is cancelled automatically. Null means it never expires (raised before this rule existed).';

create index if not exists finance_invoices_auto_cancel_idx
  on public.finance_invoices (auto_cancel_at)
  where auto_cancel_at is not null;

commit;
