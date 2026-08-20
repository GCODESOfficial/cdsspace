-- CREATE Engine async job queue.
-- Compute-heavy tools (background removal, restore, video, illustration, logo
-- animation, figma conversion) record a `processing` creation and enqueue a job
-- here; a CPU/GPU worker claims it, runs the model, and reports back, flipping
-- the creation to `ready` (or `failed`, which refunds the reserved credits).

create table if not exists public.create_jobs (
  id             uuid primary key default gen_random_uuid(),
  creation_id    uuid not null references public.create_creations(id) on delete cascade,
  tool_slug      text not null,
  owner_kind     text not null,
  owner_id       text not null,
  actor_email    text,
  credit_cost    integer not null default 0,
  input          jsonb  not null default '{}'::jsonb,
  status         text   not null default 'pending', -- pending | claimed | done | failed
  attempts       integer not null default 0,
  worker_id      text,
  error          text,
  result         jsonb,
  created_at     timestamptz not null default now(),
  claimed_at     timestamptz,
  finished_at    timestamptz
);

-- Fast claim of the next pending (or stale-claimed) job.
create index if not exists create_jobs_queue_idx
  on public.create_jobs (status, created_at);

create index if not exists create_jobs_creation_idx
  on public.create_jobs (creation_id);
