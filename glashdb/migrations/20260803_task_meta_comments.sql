-- 20260803_task_meta_comments.sql
-- Task provenance (creator name, who completed it) + per-task comments.

alter table public.task_board_tasks
  add column if not exists created_by_name text,
  add column if not exists completed_by_kind text,
  add column if not exists completed_by_id text,
  add column if not exists completed_by_name text;

create table if not exists public.task_board_task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.task_board_tasks(id) on delete cascade,
  author_kind text not null,
  author_id text not null,
  author_name text,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_task_comments_task
  on public.task_board_task_comments (task_id, created_at);
