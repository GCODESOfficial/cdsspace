-- Tutorial upload: per-stage progress, and a shareable public link.
--
-- The admin screen only ever showed a spinner, so a 150MB upload that then sits
-- through a virus scan, a transcription and seven translated dubs looked stuck.
-- The worker now records which stage it is on and how far through it is, and
-- the screen reads that back.
--
-- public_token gives each tutorial a stable, unguessable link that can be
-- shared or posted, with the tutorial's own title and description in the
-- preview card.

alter table public.dashboard_tutorials
  add column if not exists processing_stage text not null default 'ready',
  add column if not exists processing_progress integer not null default 0,
  add column if not exists public_token uuid not null default gen_random_uuid();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'dashboard_tutorials_processing_stage_check'
  ) then
    alter table public.dashboard_tutorials
      add constraint dashboard_tutorials_processing_stage_check
      check (processing_stage in ('queued', 'scanning', 'preparing', 'transcribing', 'translating', 'ready', 'failed'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'dashboard_tutorials_processing_progress_check'
  ) then
    alter table public.dashboard_tutorials
      add constraint dashboard_tutorials_processing_progress_check
      check (processing_progress between 0 and 100);
  end if;
end $$;

create unique index if not exists idx_dashboard_tutorials_public_token
  on public.dashboard_tutorials(public_token);

comment on column public.dashboard_tutorials.processing_stage is
  'Which step the upload is on, so the admin screen can name it: scanning, transcribing, translating, ready.';
comment on column public.dashboard_tutorials.processing_progress is
  'Percentage through the current stage. Translation counts completed languages; stages without a measurable total sit at 0.';
comment on column public.dashboard_tutorials.public_token is
  'Stable unguessable id for the shareable /tutorial/<token> link and its social preview card.';
