-- Declining an incoming call.
--
-- A call could only be answered or left to ring out: the person being called
-- had no way to say no, and the caller kept hearing a ringback tone until the
-- three minutes were up. A decline is now recorded here, beside the admin
-- outcomes, so the call stops ringing on every device of the person who
-- declined and the caller sees "Call declined" straight away.

begin;

alter table public.cmeet_call_actions drop constraint if exists cmeet_call_actions_action_check;
alter table public.cmeet_call_actions
  add constraint cmeet_call_actions_action_check
  check (action in ('redirected', 'rescheduled', 'unavailable', 'declined'));

comment on table public.cmeet_call_actions is
  'Redirects, reschedules, no-answer outcomes and declines for incoming cMeet calls.';

commit;
