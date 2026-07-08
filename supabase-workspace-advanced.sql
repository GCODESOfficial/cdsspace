-- ============================================================
-- CDS Space: Workspace tools - advanced schema
-- ============================================================
-- Adds the analytics, versioning, mentions, and multi-signer
-- capabilities that put the workspace tools ahead of cdslabs.
--
-- Depends on: supabase-team-portal.sql, supabase-team-invites.sql
-- Run in Supabase SQL Editor.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================
-- PROTECT DOCS - analytics
-- =============================================================
-- team_protected_documents / team_protected_document_opens already
-- exist. We add a dedicated download log and strengthen the open
-- log with metadata so we can compute real usage stats.
-- =============================================================

ALTER TABLE public.team_protected_document_opens
  ADD COLUMN IF NOT EXISTS via TEXT NOT NULL DEFAULT 'view'
    CHECK (via IN ('view','download')),
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS ip TEXT;

CREATE INDEX IF NOT EXISTS idx_team_doc_opens_document_time
  ON public.team_protected_document_opens (document_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_doc_opens_member
  ON public.team_protected_document_opens (team_member_id);

-- Per-document rollup (views, downloads, unique viewers, last open)
CREATE OR REPLACE VIEW public.v_team_docs_stats AS
SELECT
  d.id                                                          AS document_id,
  d.title,
  d.visibility,
  d.created_at,
  COALESCE(SUM(CASE WHEN o.via = 'view' THEN 1 ELSE 0 END), 0)       AS views,
  COALESCE(SUM(CASE WHEN o.via = 'download' THEN 1 ELSE 0 END), 0)   AS downloads,
  COUNT(DISTINCT o.team_member_id)                              AS unique_viewers,
  MAX(o.opened_at)                                              AS last_opened_at
FROM public.team_protected_documents d
LEFT JOIN public.team_protected_document_opens o
  ON o.document_id = d.id
GROUP BY d.id;

-- =============================================================
-- CMEET - notes, agenda, recordings
-- =============================================================
CREATE TABLE IF NOT EXISTS public.team_meeting_agenda_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.team_meetings(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  presenter_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  duration_minutes INT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_meeting_agenda_meeting
  ON public.team_meeting_agenda_items (meeting_id, position);
ALTER TABLE public.team_meeting_agenda_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_team_meeting_agenda_items" ON public.team_meeting_agenda_items;
CREATE POLICY "allow_all_team_meeting_agenda_items" ON public.team_meeting_agenda_items
  FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.team_meeting_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.team_meetings(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  author_is_admin BOOLEAN NOT NULL DEFAULT false,
  kind TEXT NOT NULL DEFAULT 'note'
    CHECK (kind IN ('note','action_item','decision')),
  body TEXT NOT NULL,
  assignee_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_meeting_notes_meeting
  ON public.team_meeting_notes (meeting_id, created_at);
ALTER TABLE public.team_meeting_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_team_meeting_notes" ON public.team_meeting_notes;
CREATE POLICY "allow_all_team_meeting_notes" ON public.team_meeting_notes
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.team_meetings
  ADD COLUMN IF NOT EXISTS recording_url TEXT,
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS duration_minutes INT;

-- Computed duration + participation rollup per meeting
CREATE OR REPLACE VIEW public.v_team_meetings_stats AS
SELECT
  m.id                                       AS meeting_id,
  m.title,
  m.status,
  m.scheduled_for,
  m.started_at,
  m.ended_at,
  CASE
    WHEN m.started_at IS NOT NULL AND m.ended_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (m.ended_at - m.started_at))::INT / 60
    ELSE m.duration_minutes
  END                                        AS computed_minutes,
  (SELECT COUNT(*) FROM public.team_meeting_participants p WHERE p.meeting_id = m.id) AS invited_count,
  (SELECT COUNT(*) FROM public.team_meeting_participants p WHERE p.meeting_id = m.id AND p.joined_at IS NOT NULL) AS attended_count,
  (SELECT COUNT(*) FROM public.team_meeting_notes n WHERE n.meeting_id = m.id) AS notes_count,
  (SELECT COUNT(*) FROM public.team_meeting_notes n WHERE n.meeting_id = m.id AND n.kind = 'action_item') AS action_items,
  (SELECT COUNT(*) FROM public.team_meeting_notes n WHERE n.meeting_id = m.id AND n.kind = 'decision') AS decisions
FROM public.team_meetings m;

-- =============================================================
-- CDOCS - versions, comments, mentions, views
-- =============================================================
ALTER TABLE public.team_cdocs
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS cover_emoji TEXT DEFAULT '📄',
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS word_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS read_minutes INT NOT NULL DEFAULT 0;

-- Seed slugs for existing rows that have null
UPDATE public.team_cdocs
SET slug = lower(regexp_replace(title, '[^a-zA-Z0-9]+', '-', 'g')) || '-' ||
  substr(md5(id::text), 1, 6)
WHERE slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_cdocs_slug
  ON public.team_cdocs (slug);

CREATE TABLE IF NOT EXISTS public.team_cdocs_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL REFERENCES public.team_cdocs(id) ON DELETE CASCADE,
  version INT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  word_count INT NOT NULL DEFAULT 0,
  edited_by UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  edited_by_admin BOOLEAN NOT NULL DEFAULT false,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (doc_id, version)
);
CREATE INDEX IF NOT EXISTS idx_team_cdocs_versions_doc
  ON public.team_cdocs_versions (doc_id, version DESC);
ALTER TABLE public.team_cdocs_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_team_cdocs_versions" ON public.team_cdocs_versions;
CREATE POLICY "allow_all_team_cdocs_versions" ON public.team_cdocs_versions
  FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.team_cdocs_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL REFERENCES public.team_cdocs(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  author_is_admin BOOLEAN NOT NULL DEFAULT false,
  parent_comment_id UUID REFERENCES public.team_cdocs_comments(id) ON DELETE CASCADE,
  anchor TEXT,           -- e.g. "paragraph-3" or a selection snippet
  body TEXT NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_cdocs_comments_doc
  ON public.team_cdocs_comments (doc_id, created_at);
ALTER TABLE public.team_cdocs_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_team_cdocs_comments" ON public.team_cdocs_comments;
CREATE POLICY "allow_all_team_cdocs_comments" ON public.team_cdocs_comments
  FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.team_cdocs_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL REFERENCES public.team_cdocs(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.team_cdocs_comments(id) ON DELETE CASCADE,
  mentioned_member_id UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  mentioned_by UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  mentioned_by_admin BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_cdocs_mentions_member
  ON public.team_cdocs_mentions (mentioned_member_id, acknowledged_at);
ALTER TABLE public.team_cdocs_mentions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_team_cdocs_mentions" ON public.team_cdocs_mentions;
CREATE POLICY "allow_all_team_cdocs_mentions" ON public.team_cdocs_mentions
  FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.team_cdocs_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL REFERENCES public.team_cdocs(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  viewer_is_admin BOOLEAN NOT NULL DEFAULT false,
  read_seconds INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_cdocs_views_doc
  ON public.team_cdocs_views (doc_id, created_at DESC);
ALTER TABLE public.team_cdocs_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_team_cdocs_views" ON public.team_cdocs_views;
CREATE POLICY "allow_all_team_cdocs_views" ON public.team_cdocs_views
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger: when team_cdocs is updated, bump current_version, word_count,
-- read_minutes, and snapshot the previous state into team_cdocs_versions.
CREATE OR REPLACE FUNCTION public.team_cdocs_version_snapshot()
RETURNS TRIGGER AS $$
DECLARE
  new_word_count INT;
BEGIN
  new_word_count := GREATEST(1, array_length(regexp_split_to_array(COALESCE(NEW.body, ''), '\s+'), 1));
  NEW.word_count := new_word_count;
  NEW.read_minutes := GREATEST(1, (new_word_count / 200.0)::INT);

  IF TG_OP = 'UPDATE' AND (OLD.body IS DISTINCT FROM NEW.body OR OLD.title IS DISTINCT FROM NEW.title) THEN
    INSERT INTO public.team_cdocs_versions (doc_id, version, title, body, word_count, edited_by, edited_by_admin)
    VALUES (OLD.id, OLD.current_version, OLD.title, OLD.body, OLD.word_count, NEW.created_by, NEW.created_by_admin);
    NEW.current_version := OLD.current_version + 1;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_team_cdocs_version_snapshot ON public.team_cdocs;
CREATE TRIGGER trg_team_cdocs_version_snapshot
  BEFORE INSERT OR UPDATE ON public.team_cdocs
  FOR EACH ROW EXECUTE FUNCTION public.team_cdocs_version_snapshot();

-- Per-doc engagement rollup
CREATE OR REPLACE VIEW public.v_team_cdocs_stats AS
SELECT
  d.id                                                          AS doc_id,
  d.slug,
  d.title,
  d.department,
  d.current_version,
  d.word_count,
  d.read_minutes,
  (SELECT COUNT(*) FROM public.team_cdocs_views v WHERE v.doc_id = d.id)                     AS views,
  (SELECT COUNT(DISTINCT v.viewer_id) FROM public.team_cdocs_views v WHERE v.doc_id = d.id)  AS unique_viewers,
  (SELECT COUNT(*) FROM public.team_cdocs_comments c WHERE c.doc_id = d.id AND c.resolved_at IS NULL) AS open_comments,
  (SELECT COUNT(*) FROM public.team_cdocs_comments c WHERE c.doc_id = d.id) AS total_comments,
  (SELECT COUNT(*) FROM public.team_cdocs_mentions m WHERE m.doc_id = d.id) AS mention_count,
  (SELECT MAX(v.created_at) FROM public.team_cdocs_views v WHERE v.doc_id = d.id)            AS last_viewed_at,
  d.is_pinned,
  d.is_archived
FROM public.team_cdocs d;

-- =============================================================
-- CSIGN - multi-field signing + audit trail
-- =============================================================
ALTER TABLE public.team_signature_requests
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS message TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fields_total INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS fields_signed INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.team_signature_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.team_signature_requests(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('signature','initials','date','text','checkbox')),
  label TEXT,
  position INT NOT NULL DEFAULT 0,
  required BOOLEAN NOT NULL DEFAULT true,
  value_text TEXT,
  value_image_url TEXT,
  value_checked BOOLEAN,
  filled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_signature_fields_request
  ON public.team_signature_fields (request_id, position);
ALTER TABLE public.team_signature_fields ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_team_signature_fields" ON public.team_signature_fields;
CREATE POLICY "allow_all_team_signature_fields" ON public.team_signature_fields
  FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.team_signature_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.team_signature_requests(id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN ('created','viewed','field_filled','signed','reminded','cancelled','expired')),
  actor_member_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  actor_is_admin BOOLEAN NOT NULL DEFAULT false,
  actor_email TEXT,
  user_agent TEXT,
  ip TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_signature_audit_log_request
  ON public.team_signature_audit_log (request_id, created_at DESC);
ALTER TABLE public.team_signature_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_team_signature_audit_log" ON public.team_signature_audit_log;
CREATE POLICY "allow_all_team_signature_audit_log" ON public.team_signature_audit_log
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger: recompute fields_total / fields_signed and flip request to signed
-- when every required field is filled.
CREATE OR REPLACE FUNCTION public.team_signature_fields_recount()
RETURNS TRIGGER AS $$
DECLARE
  req_id UUID;
  total INT;
  signed INT;
  required_unfilled INT;
BEGIN
  req_id := COALESCE(NEW.request_id, OLD.request_id);
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE filled_at IS NOT NULL),
    COUNT(*) FILTER (WHERE required = true AND filled_at IS NULL)
  INTO total, signed, required_unfilled
  FROM public.team_signature_fields
  WHERE request_id = req_id;

  UPDATE public.team_signature_requests
  SET fields_total  = total,
      fields_signed = signed
  WHERE id = req_id;

  IF required_unfilled = 0 AND total > 0 THEN
    UPDATE public.team_signature_requests
    SET status    = 'signed',
        signed_at = COALESCE(signed_at, now())
    WHERE id = req_id AND status = 'pending';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_team_signature_fields_recount ON public.team_signature_fields;
CREATE TRIGGER trg_team_signature_fields_recount
  AFTER INSERT OR UPDATE OR DELETE ON public.team_signature_fields
  FOR EACH ROW EXECUTE FUNCTION public.team_signature_fields_recount();

CREATE OR REPLACE VIEW public.v_team_signatures_stats AS
SELECT
  date_trunc('week', created_at)::date               AS week_start,
  COUNT(*) FILTER (WHERE status = 'pending')         AS pending,
  COUNT(*) FILTER (WHERE status = 'signed')          AS signed,
  COUNT(*) FILTER (WHERE status = 'cancelled')       AS cancelled,
  COUNT(*) FILTER (WHERE status = 'expired')         AS expired,
  AVG(EXTRACT(EPOCH FROM (signed_at - created_at)) / 3600)
    FILTER (WHERE status = 'signed' AND signed_at IS NOT NULL) AS avg_turnaround_hours
FROM public.team_signature_requests
GROUP BY 1
ORDER BY 1 DESC;

-- =============================================================
-- CRESUME - view analytics + peer endorsements
-- =============================================================
CREATE TABLE IF NOT EXISTS public.team_resume_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  viewer_member_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  viewer_is_admin BOOLEAN NOT NULL DEFAULT false,
  source TEXT,                                -- 'public' | 'admin' | 'team' | 'share_token'
  referer TEXT,
  user_agent TEXT,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_resume_views_member_time
  ON public.team_resume_views (team_member_id, created_at DESC);
ALTER TABLE public.team_resume_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_team_resume_views" ON public.team_resume_views;
CREATE POLICY "allow_all_team_resume_views" ON public.team_resume_views
  FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.team_resume_endorsements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  endorser_member_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  endorser_is_admin BOOLEAN NOT NULL DEFAULT false,
  skill TEXT NOT NULL,                        -- free-form or from resume.skills
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A given endorser may only endorse a given skill once
  UNIQUE (team_member_id, endorser_member_id, skill)
);
CREATE INDEX IF NOT EXISTS idx_team_resume_endorsements_member
  ON public.team_resume_endorsements (team_member_id);
ALTER TABLE public.team_resume_endorsements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_team_resume_endorsements" ON public.team_resume_endorsements;
CREATE POLICY "allow_all_team_resume_endorsements" ON public.team_resume_endorsements
  FOR ALL USING (true) WITH CHECK (true);

-- Per-member resume rollup
CREATE OR REPLACE VIEW public.v_team_cresume_stats AS
SELECT
  tm.id                                                             AS team_member_id,
  tm.username,
  tm.full_name,
  (SELECT COUNT(*) FROM public.team_resume_views v WHERE v.team_member_id = tm.id)               AS total_views,
  (SELECT COUNT(*) FROM public.team_resume_views v
     WHERE v.team_member_id = tm.id AND v.created_at > now() - interval '30 days')              AS views_30d,
  (SELECT COUNT(*) FROM public.team_resume_views v
     WHERE v.team_member_id = tm.id AND v.source = 'public')                                    AS public_views,
  (SELECT COUNT(*) FROM public.team_resume_endorsements e WHERE e.team_member_id = tm.id)        AS endorsements,
  (SELECT MAX(v.created_at) FROM public.team_resume_views v WHERE v.team_member_id = tm.id)      AS last_viewed_at
FROM public.team_members tm
WHERE tm.is_active = true;

-- =============================================================
-- GLOBAL - per-member workspace activity
-- =============================================================
CREATE OR REPLACE VIEW public.v_team_member_activity AS
SELECT
  tm.id                                                                                    AS team_member_id,
  tm.full_name,
  tm.username,
  tm.department,
  (SELECT COUNT(*) FROM public.team_cdocs d WHERE d.created_by = tm.id)                    AS cdocs_authored,
  (SELECT COUNT(*) FROM public.team_cdocs_comments c WHERE c.author_id = tm.id)            AS cdocs_comments,
  (SELECT COUNT(*) FROM public.team_meetings m WHERE m.created_by = tm.id)                 AS meetings_created,
  (SELECT COUNT(*) FROM public.team_meeting_participants mp
     WHERE mp.team_member_id = tm.id AND mp.joined_at IS NOT NULL)                         AS meetings_attended,
  (SELECT COUNT(*) FROM public.team_signature_requests r WHERE r.requested_by = tm.id)     AS signatures_requested,
  (SELECT COUNT(*) FROM public.team_signature_requests r
     WHERE r.signer_team_member_id = tm.id AND r.status = 'signed')                        AS signatures_signed,
  (SELECT COUNT(*) FROM public.team_protected_document_opens o WHERE o.team_member_id = tm.id) AS docs_opened,
  (SELECT COUNT(*) FROM public.team_resume_endorsements e WHERE e.endorser_member_id = tm.id)  AS endorsements_given
FROM public.team_members tm
WHERE tm.is_active = true;

-- =============================================================
-- GLOBAL - workspace-wide snapshot the admin dashboard can read
-- =============================================================
CREATE OR REPLACE VIEW public.v_workspace_overview AS
SELECT
  (SELECT COUNT(*) FROM public.team_members WHERE is_active)                                          AS active_members,
  (SELECT COUNT(*) FROM public.team_protected_documents)                                              AS total_docs,
  (SELECT COUNT(*) FROM public.team_protected_document_opens WHERE opened_at > now() - interval '7 days') AS doc_opens_7d,
  (SELECT COUNT(*) FROM public.team_meetings WHERE status IN ('scheduled','live'))                    AS upcoming_meetings,
  (SELECT COUNT(*) FROM public.team_meetings WHERE status = 'ended')                                  AS completed_meetings,
  (SELECT COUNT(*) FROM public.team_cdocs WHERE is_archived = false)                                  AS active_cdocs,
  (SELECT COUNT(*) FROM public.team_cdocs_views WHERE created_at > now() - interval '7 days')         AS cdoc_views_7d,
  (SELECT COUNT(*) FROM public.team_signature_requests WHERE status = 'pending')                      AS pending_signatures,
  (SELECT COUNT(*) FROM public.team_signature_requests WHERE status = 'signed'
     AND signed_at > now() - interval '30 days')                                                      AS signatures_30d,
  (SELECT COUNT(*) FROM public.team_resume_views WHERE created_at > now() - interval '30 days')       AS resume_views_30d,
  (SELECT COUNT(*) FROM public.team_resume_endorsements)                                              AS total_endorsements;
