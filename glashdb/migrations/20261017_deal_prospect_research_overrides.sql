-- Corrections the team makes to a checklist entry's research.
--
-- The research itself lives on prospect_companies and is replaced whenever it
-- is rechecked. An edit made on the checklist (a misleading finding removed, a
-- pain point reworded) is kept here per field instead, so a recheck never
-- undoes it. A field present here is shown in place of the research.

alter table public.deal_prospects
  add column if not exists research_overrides jsonb not null default '{}'::jsonb;
