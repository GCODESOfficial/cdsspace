-- Persist the admin-defined topic used by scheduled consultation meetings.
-- The same topic is written to the cMeet room, its title-aware invite URL and
-- the generated Open Graph preview image.

begin;

alter table public.consultation_requests
  add column if not exists meeting_topic text;

comment on column public.consultation_requests.meeting_topic is
  'Topic shown in the consultation invite and copied to its cMeet room title.';

commit;
