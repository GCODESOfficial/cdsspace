-- ============================================
-- CDS Space: UNDO workspace row caps
-- ============================================
-- Reverses supabase-workspace-row-caps.sql. Drops every trimming
-- trigger + function so these log tables grow without being
-- auto-truncated to 200 rows.
--
-- Run in Supabase SQL Editor.
-- ============================================

-- Drop the per-table triggers
DROP TRIGGER IF EXISTS trim_team_protected_document_opens_trigger ON public.team_protected_document_opens;
DROP TRIGGER IF EXISTS trim_team_cdocs_views_trigger                ON public.team_cdocs_views;
DROP TRIGGER IF EXISTS trim_team_resume_views_trigger               ON public.team_resume_views;
DROP TRIGGER IF EXISTS trim_team_signature_audit_log_trigger        ON public.team_signature_audit_log;
DROP TRIGGER IF EXISTS trim_team_notifications_trigger              ON public.team_notifications;

-- Drop the per-table trim functions
DROP FUNCTION IF EXISTS public.trim_team_protected_document_opens();
DROP FUNCTION IF EXISTS public.trim_team_cdocs_views();
DROP FUNCTION IF EXISTS public.trim_team_resume_views();
DROP FUNCTION IF EXISTS public.trim_team_signature_audit_log();
DROP FUNCTION IF EXISTS public.trim_team_notifications();

-- Drop the generic helper
DROP FUNCTION IF EXISTS public.cap_table_rows(regclass, int);

-- Also drop the AI usage log cap introduced in supabase-ai-system.sql
DROP TRIGGER IF EXISTS trim_ai_usage_log_trigger ON public.ai_usage_log;
DROP FUNCTION IF EXISTS public.trim_ai_usage_log();
