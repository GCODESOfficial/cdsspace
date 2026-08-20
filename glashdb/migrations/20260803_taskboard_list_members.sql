-- 20260803_taskboard_list_members.sql
-- List-level membership: a person added to a list can see that whole list and
-- every task inside it (unlike task assignment, which only reveals one task).

create table if not exists public.task_board_list_members (
  list_id uuid not null references public.task_board_lists(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  added_by_id text,
  created_at timestamptz not null default now(),
  primary key (list_id, team_member_id)
);

create index if not exists idx_task_board_list_members_member
  on public.task_board_list_members (team_member_id);

create index if not exists idx_task_board_list_members_list
  on public.task_board_list_members (list_id);
