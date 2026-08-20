-- 20260729_taskboard_private_assignments.sql
-- Taskboard follow-up for private task assignment and completed brand briefs.
--
-- Task and list visibility is enforced by the authenticated Taskboard API:
-- selected assignees see their tasks and the lists containing those tasks,
-- while the board creator and super-admin retain full visibility.

alter table public.task_board_attachments
  drop constraint if exists task_board_attachments_kind_check;

alter table public.task_board_attachments
  add constraint task_board_attachments_kind_check
  check (kind in ('upload', 'external', 'cdoc', 'brand_brief'));

create index if not exists idx_task_board_tasks_creator
  on public.task_board_tasks (board_id, created_by_kind, created_by_id);

create index if not exists idx_task_boards_creator
  on public.task_boards (created_by_kind, created_by_id)
  where archived_at is null;
