-- 20260708_hrm_interactive.sql
-- Run manually in the SQL editor (same as the other glashdb migrations).
--
-- Supports the HRM interactivity pass:
--   1. Check-in / geofence / work-tracking notifications to the super admin
--      need new `type` values on the legacy notifications table.
--   2. Duplicate project assignments were possible via double-click races —
--      dedupe existing rows and add unique indexes so the DB enforces it.

-- ---------------------------------------------------------------------------
-- 1. Extend notifications.type check constraint
-- ---------------------------------------------------------------------------
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'order_update', 'new_message', 'status_change', 'new_order',
    'team_checkin', 'team_checkout', 'team_alert', 'work_tracking'
  ));

-- ---------------------------------------------------------------------------
-- 2. Deduplicate + uniquify project_assignments
-- ---------------------------------------------------------------------------
-- Remove duplicate member assignments (keep the earliest row).
delete from public.project_assignments a
using public.project_assignments b
where a.team_member_id is not null
  and b.team_member_id is not null
  and a.project_id = b.project_id
  and a.team_member_id = b.team_member_id
  and a.created_at > b.created_at;

-- Remove duplicate department assignments (case-insensitive, keep earliest).
delete from public.project_assignments a
using public.project_assignments b
where a.department is not null
  and b.department is not null
  and a.project_id = b.project_id
  and lower(a.department) = lower(b.department)
  and a.created_at > b.created_at;

create unique index if not exists uq_project_assignments_member
  on public.project_assignments (project_id, team_member_id)
  where team_member_id is not null;

create unique index if not exists uq_project_assignments_department
  on public.project_assignments (project_id, lower(department))
  where department is not null;
