begin;

-- A consultation booked from a proposal's kickoff button records which proposal
-- it came from. Without this column the public consultation form fails outright
-- with `column "proposal_id" of relation "consultation_requests" does not exist`,
-- which breaks every booking, not only the ones started from a proposal.

alter table public.consultation_requests
  add column if not exists proposal_id uuid;

do $$
begin
  -- Set null rather than cascade: a deleted proposal must never take a client's
  -- consultation request with it.
  if to_regclass('public.deal_proposals') is not null
     and not exists (
       select 1 from pg_constraint
        where conname = 'consultation_requests_proposal_id_fkey'
          and conrelid = 'public.consultation_requests'::regclass
     ) then
    alter table public.consultation_requests
      add constraint consultation_requests_proposal_id_fkey
      foreign key (proposal_id) references public.deal_proposals(id) on delete set null;
  end if;
end $$;

create index if not exists consultation_requests_proposal_idx
  on public.consultation_requests (proposal_id, created_at desc)
  where proposal_id is not null;

-- The same flow writes a 'scheduled' entry onto the proposal funnel timeline,
-- which the original check constraint did not allow. That insert is deliberately
-- failure-tolerant, so the rejection was silent and kickoff bookings simply never
-- appeared on the proposal.
alter table public.deal_proposal_events drop constraint if exists deal_proposal_events_event_type_check;
alter table public.deal_proposal_events
  add constraint deal_proposal_events_event_type_check
  check (event_type in ('created', 'edited', 'sent', 'viewed', 'downloaded', 'stage_changed', 'scheduled', 'note'));

comment on column public.consultation_requests.proposal_id is
  'Set when the request was booked from a proposal kickoff link. Null for consultations started from the public form.';

commit;
