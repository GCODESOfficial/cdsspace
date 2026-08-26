-- Backfill admission data onto rooms that existed before the lobby.
--
-- Run AFTER 20260826_cmeet_admission.sql.
--
-- Rooms created before that migration know nothing about the client they were
-- booked for, so their invited client would be sent to the lobby like a
-- stranger. The link between the two already exists: a consultation stores the
-- room code it generated.
--
-- Note the limit: a link already sitting in a client's inbox cannot gain a
-- token retroactively. For those, the account-email match added in step 1 is
-- what lets the client in, and it only applies when they are signed in. Step 3
-- fixes the stored link so any resend or copy from the admin carries the token.

begin;

create extension if not exists "pgcrypto";

-- 1. Record who each existing consultation room was for.
update public.team_meetings m
   set guest_email = c.email
  from public.consultation_requests c
 where c.meeting_room_code = m.room_code
   and m.guest_email is null
   and nullif(trim(c.email), '') is not null;

-- 2. Issue a token to every room that now knows its client but has none.
--    Same shape the application generates: a uuid with the hyphens stripped.
update public.team_meetings
   set guest_token = replace(gen_random_uuid()::text, '-', '')
 where guest_email is not null
   and guest_token is null;

-- 3. Carry the token into the stored link, preserving whatever form it is in
--    (some rows hold a bare path, others a full URL).
update public.consultation_requests c
   set meeting_link = c.meeting_link
     || case when position('?' in c.meeting_link) > 0 then '&g=' else '?g=' end
     || m.guest_token
  from public.team_meetings m
 where m.room_code = c.meeting_room_code
   and m.guest_token is not null
   and nullif(trim(c.meeting_link), '') is not null
   and c.meeting_link not like '%?g=%'
   and c.meeting_link not like '%&g=%';

commit;
