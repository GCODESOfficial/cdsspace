-- Align the finance_projects.status check constraint with the project-work
-- status vocabulary the app actually uses (see PROJECT_STATUSES in
-- src/app/api/team/work/route.ts). The original constraint from
-- finance_schema.sql only permitted active/completed/paused/archived, so
-- creating a project (which defaults to status 'new') violated the constraint.
-- The POST /api/team/work handler had no try/catch, so that failure surfaced as
-- an HTML 500 the client reported as: "The project workspace API returned an
-- invalid response."
alter table public.finance_projects
  drop constraint if exists finance_projects_status_check;

alter table public.finance_projects
  add constraint finance_projects_status_check
  check (status in (
    'new', 'active', 'paused', 'delayed',
    'awaiting_client', 'under_review', 'completed', 'archived'
  ));
