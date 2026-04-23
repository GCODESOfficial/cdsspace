-- ============================================
-- CDS Space: Project collaboration surfaces
--   1. project_assignments — assign a team member OR department to a project
--   2. project_documents   — link normal cDocs or Protect Docs to a project
--   3. Annotate team_chat_threads + team_meetings with project_id so a
--      project-scoped chat / call can live alongside the existing systems.
--
-- Idempotent. Run in the Supabase SQL editor.
-- ============================================

create extension if not exists "pgcrypto";

-- 1. Assignments ------------------------------------------------------------
-- Exactly one of (team_member_id, department) should be populated. The check
-- below enforces that so an assignment row can never be ambiguous.
create table if not exists public.project_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.finance_projects(id) on delete cascade,
  team_member_id uuid references public.team_members(id) on delete cascade,
  department text,
  role text,
  created_at timestamptz not null default now(),
  constraint project_assignments_target_check check (
    (team_member_id is not null and department is null) or
    (team_member_id is null and department is not null)
  )
);
create index if not exists idx_project_assignments_project on public.project_assignments(project_id);
create index if not exists idx_project_assignments_member  on public.project_assignments(team_member_id);
create index if not exists idx_project_assignments_dept    on public.project_assignments(lower(department));

alter table public.project_assignments enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'project_assignments' and policyname = 'project_assignments_all') then
    create policy project_assignments_all on public.project_assignments for all using (true) with check (true);
  end if;
end $$;

-- 2. Documents --------------------------------------------------------------
-- `kind` tells us whether this row links to a cDoc, a Protect Doc, or a raw
-- external file URL. Only one of the FK columns will be populated per row.
create table if not exists public.project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.finance_projects(id) on delete cascade,
  kind text not null check (kind in ('cdoc','protected','link')),
  title text not null,
  cdoc_id uuid,
  protected_doc_id uuid,
  file_url text,
  added_by text,
  created_at timestamptz not null default now(),
  constraint project_documents_ref_check check (
    (kind = 'cdoc'      and cdoc_id is not null) or
    (kind = 'protected' and protected_doc_id is not null) or
    (kind = 'link'      and file_url is not null)
  )
);
create index if not exists idx_project_documents_project on public.project_documents(project_id);

alter table public.project_documents enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'project_documents' and policyname = 'project_documents_all') then
    create policy project_documents_all on public.project_documents for all using (true) with check (true);
  end if;
end $$;

-- 3. Chat + meeting linkage ------------------------------------------------
alter table public.team_chat_threads
  add column if not exists project_id uuid references public.finance_projects(id) on delete set null;
create index if not exists idx_team_chat_threads_project on public.team_chat_threads(project_id);

alter table public.team_meetings
  add column if not exists project_id uuid references public.finance_projects(id) on delete set null;
create index if not exists idx_team_meetings_project on public.team_meetings(project_id);
