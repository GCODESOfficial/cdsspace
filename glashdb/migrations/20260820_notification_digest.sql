-- Email digest queue: compound similar notification emails instead of sending
-- one per event. Repetitive notifications (task updates, chat, etc.) are queued
-- here and flushed by the notification-digest cron, which groups them per
-- recipient + category into a single compounded email.
create table if not exists public.notification_email_queue (
  id              uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  category        text not null,            -- 'tasks' | 'chat' | 'deliveries' | ...
  subject         text not null,
  title           text not null,
  body            text,
  link            text,
  html            text,
  text_body       text,
  from_name       text default 'CDS Space',
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);

create index if not exists notification_email_queue_pending_idx
  on public.notification_email_queue (recipient_email, category, created_at)
  where sent_at is null;
