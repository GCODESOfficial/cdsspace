-- Kickoff scheduling from a proposal.
--
-- A client who books a consultation from the "Kickoff Meet" button on their
-- proposal link now leaves a trace on both sides: a 'scheduled' entry on the
-- proposal funnel timeline, and a link back to the proposal on the consultation
-- request itself.

begin;

alter table public.deal_proposal_events
  drop constraint if exists deal_proposal_events_event_type_check;

alter table public.deal_proposal_events
  add constraint deal_proposal_events_event_type_check
  check (event_type in (
    'created', 'edited', 'sent', 'viewed', 'downloaded', 'stage_changed', 'note', 'scheduled'
  ));

alter table public.consultation_requests
  add column if not exists proposal_id uuid references public.deal_proposals(id) on delete set null;

create index if not exists consultation_requests_proposal_idx
  on public.consultation_requests (proposal_id);

comment on column public.consultation_requests.proposal_id is
  'Set when the request came from the Kickoff Meet button on a proposal link.';

commit;
