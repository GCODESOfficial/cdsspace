-- Scheduled client mailings retain their draft content until delivery and are
-- claimed atomically by the protected cron worker.

alter table public.client_email_campaigns
  add column if not exists scheduled_for timestamptz,
  add column if not exists scheduled_by text,
  add column if not exists claimed_at timestamptz;

alter table public.client_email_campaigns
  drop constraint if exists client_email_campaigns_status_check;

alter table public.client_email_campaigns
  add constraint client_email_campaigns_status_check
  check (status in ('draft', 'scheduled', 'sending', 'sent', 'partial_failed', 'failed'));

create index if not exists idx_client_email_campaigns_scheduled_due
  on public.client_email_campaigns(scheduled_for asc)
  where status = 'scheduled';

comment on column public.client_email_campaigns.scheduled_for is
  'UTC delivery time for a campaign whose status is scheduled.';
comment on column public.client_email_campaigns.scheduled_by is
  'Administrator who most recently scheduled or rescheduled the campaign.';
comment on column public.client_email_campaigns.claimed_at is
  'Time the delivery worker atomically claimed the campaign for sending.';
