-- Marks which client notifications have been carried outside the app.
--
-- Client notices are written straight into public.notifications from dozens of
-- routes, so there was no single place to also send a device push or an email.
-- A dispatcher now sweeps the new rows; this column is what stops it sending
-- the same notice twice.

begin;

alter table public.notifications
  add column if not exists dispatched_at timestamptz;

comment on column public.notifications.dispatched_at is
  'When this notice was pushed to the recipient devices and emailed. Null means still to send.';

-- The dispatcher only ever looks for recent, undispatched rows.
create index if not exists notifications_pending_dispatch_idx
  on public.notifications (created_at)
  where dispatched_at is null;

commit;
