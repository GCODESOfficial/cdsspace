-- 20260803_consultation_smart_fields.sql
-- Richer consultation intake: WhatsApp, country, discussion topics, preferred
-- meeting windows, plus columns the admin scheduling/email flow relies on.

alter table public.consultation_requests
  add column if not exists whatsapp text,
  add column if not exists location text,
  add column if not exists topics text[] not null default '{}',
  add column if not exists preferred_days text[] not null default '{}',
  add column if not exists preferred_times text[] not null default '{}',
  add column if not exists email_sent_at timestamptz,
  -- These back the existing cMeet scheduling path in the admin [id] route.
  add column if not exists meeting_type text,
  add column if not exists meeting_link text,
  add column if not exists meeting_room_code text;
