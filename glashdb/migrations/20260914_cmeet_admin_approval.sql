-- Admin approval gate for cMeet rooms.
-- Existing rooms remain approved; new non-admin rooms opt into `pending` in
-- the application so older creation paths are not accidentally locked.

begin;

alter table public.team_meetings
  add column if not exists approval_status text,
  add column if not exists approval_requested_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by_email text;

update public.team_meetings
set approval_status = 'approved',
    approved_at = coalesce(approved_at, started_at, created_at)
where approval_status is null;

alter table public.team_meetings
  alter column approval_status set default 'approved',
  alter column approval_status set not null;

alter table public.team_meetings
  drop constraint if exists team_meetings_approval_status_check;
alter table public.team_meetings
  add constraint team_meetings_approval_status_check
  check (approval_status in ('pending', 'approved', 'rejected'));

alter table public.team_meetings
  drop constraint if exists team_meetings_status_check;
alter table public.team_meetings
  add constraint team_meetings_status_check
  check (status in ('pending_approval', 'scheduled', 'live', 'ended', 'cancelled'));

create index if not exists team_meetings_pending_approval_idx
  on public.team_meetings (approval_status, created_at desc)
  where approval_status = 'pending';

comment on column public.team_meetings.approval_status is
  'Admin-controlled cMeet gate. Pending rooms cannot admit participants or obtain relay credentials.';

commit;
