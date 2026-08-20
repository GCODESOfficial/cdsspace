-- Durable weekly-report drafts and private supporting-document attachments.

alter table public.team_work_tracking_self_reports
  add column if not exists is_draft boolean not null default false;

create table if not exists public.team_work_tracking_self_report_attachments (
  id uuid primary key default gen_random_uuid(),
  self_report_id uuid not null references public.team_work_tracking_self_reports(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  source_kind text not null check (source_kind in ('cdoc','protected','external','upload')),
  source_id uuid,
  title text not null,
  external_url text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  constraint team_self_report_attachment_size check (size_bytes is null or (size_bytes >= 0 and size_bytes <= 5242880)),
  constraint team_self_report_attachment_source check (
    (source_kind in ('cdoc','protected') and source_id is not null and external_url is null and storage_path is null)
    or (source_kind = 'external' and source_id is null and external_url is not null and storage_path is null)
    or (source_kind = 'upload' and source_id is null and external_url is null and storage_path is not null and mime_type = 'application/pdf')
  )
);

create index if not exists idx_team_self_report_attachments_report
  on public.team_work_tracking_self_report_attachments (self_report_id, created_at);

create index if not exists idx_team_self_report_attachments_member
  on public.team_work_tracking_self_report_attachments (team_member_id, created_at desc);

alter table public.team_work_tracking_self_report_attachments enable row level security;
revoke all on public.team_work_tracking_self_report_attachments from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-report-attachments', 'team-report-attachments', false, 5242880, array['application/pdf']::text[])
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['application/pdf']::text[];
