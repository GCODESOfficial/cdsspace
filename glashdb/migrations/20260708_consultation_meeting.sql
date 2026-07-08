-- 20260708_consultation_meeting.sql
-- Run manually in the SQL editor.
--
-- Lets admins schedule a meeting for a consultation request: pick a date/time
-- (scheduled_at already exists) and attach a meeting link — either a pre-set
-- cMeet room or an external Zoom / Google Meet URL.

alter table public.consultation_requests
  add column if not exists meeting_type text not null default 'none'
    check (meeting_type in ('none', 'cmeet', 'zoom', 'google_meet', 'other')),
  add column if not exists meeting_link text,
  add column if not exists meeting_room_code text;
