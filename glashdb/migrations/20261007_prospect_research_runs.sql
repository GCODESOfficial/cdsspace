-- Research that keeps going when the page is closed.
--
-- Research ran as a chain of requests from the open admin page, so closing the
-- tab stopped it part way through a directory of millions. The run is now a
-- record the server owns: it keeps being advanced until someone stops it or
-- the admin who started it signs out.

begin;

create table if not exists public.prospect_research_runs (
  id uuid primary key default gen_random_uuid(),
  -- Who started it, so signing out can stop their run.
  started_by text not null,
  started_by_name text,
  status text not null default 'running' check (status in ('running', 'stopped', 'finished')),
  started_at timestamptz not null default now(),
  last_pass_at timestamptz,
  stopped_at timestamptz,
  stopped_reason text,
  processed_total integer not null default 0,
  last_error text
);

comment on table public.prospect_research_runs is
  'A background prospect research run. At most one is running at a time.';

-- The worker asks one question constantly: is anything running?
create unique index if not exists prospect_research_runs_one_active
  on public.prospect_research_runs ((status))
  where status = 'running';
create index if not exists prospect_research_runs_owner_idx
  on public.prospect_research_runs (started_by, started_at desc);

alter table public.prospect_research_runs enable row level security;
revoke all on public.prospect_research_runs from anon, authenticated;

commit;
