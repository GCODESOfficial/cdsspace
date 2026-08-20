-- 20260730_taskboard_list_ownership.sql
-- Lets every board editor create lists while keeping an empty list visible
-- only to its creator, the board creator and the super admin.

alter table public.task_board_lists
  add column if not exists created_by_kind text,
  add column if not exists created_by_id text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'task_board_lists_created_by_kind_check'
       and conrelid = 'public.task_board_lists'::regclass
  ) then
    alter table public.task_board_lists
      add constraint task_board_lists_created_by_kind_check
      check (created_by_kind in ('admin', 'team'));
  end if;
end $$;

update public.task_board_lists l
   set created_by_kind = b.created_by_kind,
       created_by_id = b.created_by_id
  from public.task_boards b
 where b.id = l.board_id
   and (l.created_by_kind is null or l.created_by_id is null);

create index if not exists idx_task_board_lists_creator
  on public.task_board_lists (board_id, created_by_kind, created_by_id);
