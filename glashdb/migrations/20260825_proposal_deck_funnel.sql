begin;

-- Landscape proposal deck content plus a complete proposal sales funnel.

alter table public.deal_proposals
  add column if not exists deck jsonb not null default '{}'::jsonb,
  add column if not exists stage text not null default 'draft',
  add column if not exists deal_value numeric(14,2),
  add column if not exists currency text not null default 'USD',
  add column if not exists expected_close_on date,
  add column if not exists owner_email text,
  add column if not exists client_note text,
  add column if not exists lost_reason text,
  add column if not exists first_viewed_at timestamptz,
  add column if not exists last_viewed_at timestamptz,
  add column if not exists view_count integer not null default 0,
  add column if not exists send_count integer not null default 0,
  add column if not exists last_sent_at timestamptz;

alter table public.deal_proposals drop constraint if exists deal_proposals_status_check;
alter table public.deal_proposals
  add constraint deal_proposals_status_check
  check (status in ('draft', 'ready', 'sent', 'viewed', 'negotiation', 'accepted', 'declined', 'archived'));

alter table public.deal_proposals drop constraint if exists deal_proposals_stage_check;
alter table public.deal_proposals
  add constraint deal_proposals_stage_check
  check (stage in ('draft', 'ready', 'sent', 'viewed', 'negotiation', 'won', 'lost', 'archived'));

update public.deal_proposals
   set stage = case
     when status = 'accepted' then 'won'
     when status = 'declined' then 'lost'
     when status = 'archived' then 'archived'
     when status = 'sent' then 'sent'
     when status = 'ready' then 'ready'
     else 'draft'
   end
 where stage = 'draft';

create index if not exists deal_proposals_stage_idx
  on public.deal_proposals (stage, updated_at desc);

create table if not exists public.deal_proposal_events (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.deal_proposals(id) on delete cascade,
  event_type text not null
    check (event_type in ('created', 'edited', 'sent', 'viewed', 'downloaded', 'stage_changed', 'note')),
  actor text,
  detail text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists deal_proposal_events_proposal_idx
  on public.deal_proposal_events (proposal_id, created_at desc);
create index if not exists deal_proposal_events_type_idx
  on public.deal_proposal_events (event_type, created_at desc);

alter table public.deal_proposal_events enable row level security;

comment on column public.deal_proposals.deck is
  'Landscape proposal deck sections: cover, who we are, big picture, rewind, opportunities, process note, payoff, kickoff, and call to action.';
comment on column public.deal_proposals.stage is
  'Sales funnel stage for the proposal: draft, ready, sent, viewed, negotiation, won, lost, or archived.';
comment on table public.deal_proposal_events is
  'Immutable proposal funnel timeline: creation, edits, sends, client views, downloads, and stage changes.';

commit;
