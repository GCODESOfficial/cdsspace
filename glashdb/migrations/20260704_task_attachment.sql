-- CDS Space: attachment on a directly-assigned task.
-- ---------------------------------------------------------------------------
-- When a lead/admin assigns a task they can attach a reference: an uploaded
-- photo/file (stored in the media bucket) OR a pasted link to an image/file
-- online. Stored inline on project_tasks so direct tasks (no project) work.
--
-- Migrations here are MANUAL (no runner) — apply this SQL by hand against
-- GlashDB. Idempotent (IF NOT EXISTS).
-- ---------------------------------------------------------------------------

alter table public.project_tasks
  add column if not exists attachment_url  text,
  add column if not exists attachment_name text;
