-- Retried companies go to the front of the research queue.
--
-- The queue is worked oldest first, and a company put back after a failure
-- kept its place by age, so with a million companies queued a retry could wait
-- days behind new imports. A retry is now stamped and claimed ahead of the
-- rest, so "Retry failed" takes effect on the next pass even while a research
-- run is already going.

alter table public.prospect_companies
  add column if not exists retry_requested_at timestamptz;

create index if not exists prospect_companies_retry_queue_idx
  on public.prospect_companies (retry_requested_at)
  where enrichment_status = 'queued' and retry_requested_at is not null;

-- Companies that already failed and were put back before this existed carry
-- no marker, but a queued company changed after it was added and never
-- researched is one: they go to the front as well.
update public.prospect_companies
   set retry_requested_at = updated_at
 where enrichment_status = 'queued'
   and enriched_at is null
   and retry_requested_at is null
   and updated_at > created_at + interval '2 minutes';
