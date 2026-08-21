-- Make notification-thread delivery retryable and auditable.
--
-- `sent_at` remains the latest successful delivery time. `first_sent_at`
-- preserves the original success when an administrator explicitly resends a
-- notification. Bumping `delivery_version` gives an explicit resend a fresh
-- Message-ID so Gmail does not discard it as a duplicate.
alter table public.notification_email_queue
  add column if not exists first_sent_at timestamptz,
  add column if not exists delivery_version integer not null default 1,
  add column if not exists resend_count integer not null default 0,
  add column if not exists claimed_at timestamptz,
  add column if not exists last_attempted_at timestamptz,
  add column if not exists last_error text;

update public.notification_email_queue
   set first_sent_at = sent_at
 where first_sent_at is null
   and sent_at is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.notification_email_queue'::regclass
       and conname = 'notification_email_queue_delivery_version_positive'
  ) then
    alter table public.notification_email_queue
      add constraint notification_email_queue_delivery_version_positive
        check (delivery_version > 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.notification_email_queue'::regclass
       and conname = 'notification_email_queue_resend_count_nonnegative'
  ) then
    alter table public.notification_email_queue
      add constraint notification_email_queue_resend_count_nonnegative
        check (resend_count >= 0) not valid;
  end if;
end
$$;

alter table public.notification_email_queue
  validate constraint notification_email_queue_delivery_version_positive;

alter table public.notification_email_queue
  validate constraint notification_email_queue_resend_count_nonnegative;
