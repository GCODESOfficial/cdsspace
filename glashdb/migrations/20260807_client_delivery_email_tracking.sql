-- Track finished-work email delivery and safely suppress duplicate sends.

alter table public.client_deliveries
  add column if not exists delivery_email_attempted_at timestamptz,
  add column if not exists delivery_email_sent_at timestamptz,
  add column if not exists delivery_email_error text;

create index if not exists idx_client_deliveries_pending_email
  on public.client_deliveries(published_at desc)
  where status in ('published', 'awaiting_account')
    and delivery_email_sent_at is null;

comment on column public.client_deliveries.delivery_email_sent_at is
  'When the finished-work notification email was accepted by the configured mail transport.';
