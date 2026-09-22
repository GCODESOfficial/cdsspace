-- Proposals generated from a checklist prospect already had a prospect_id
-- column but nothing indexed it, and the chat tag looks a client up by email
-- across both tables on every conversation list. Both lookups get an index.

create index if not exists deal_proposals_prospect_idx
  on public.deal_proposals (prospect_id, updated_at desc)
  where prospect_id is not null;

create index if not exists deal_prospects_email_idx
  on public.deal_prospects (lower(email))
  where nullif(btrim(email), '') is not null;

comment on column public.deal_proposals.prospect_id is
  'The checklist prospect this proposal was raised for, set when a proposal is created from the picker. Drives the admin-only deal tag on that client''s chat.';
