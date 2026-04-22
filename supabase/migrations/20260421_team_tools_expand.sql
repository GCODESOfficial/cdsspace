-- ============================================
-- CDS Space: Team Tools (cDocs / cMeet / cSign / Protect Docs / cResume)
-- Adds the columns the ported cdslabs tooling expects on top of the
-- team_* tables already scaffolded in supabase-team-portal.sql.
-- Idempotent. Safe to re-run.
-- ============================================

-- 1. cDocs — share token + templates + tags + categories + theme
ALTER TABLE public.team_cdocs
  ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  ADD COLUMN IF NOT EXISTS last_saved_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS subcategory TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stamped BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_team_cdocs_share_token ON public.team_cdocs(share_token);
CREATE INDEX IF NOT EXISTS idx_team_cdocs_archived ON public.team_cdocs(archived);
CREATE INDEX IF NOT EXISTS idx_team_cdocs_template ON public.team_cdocs(is_template) WHERE is_template = true;

-- cDocs activity log
CREATE TABLE IF NOT EXISTS public.team_cdocs_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cdoc_id UUID NOT NULL REFERENCES public.team_cdocs(id) ON DELETE CASCADE,
  actor_member_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  actor_is_admin BOOLEAN NOT NULL DEFAULT false,
  actor_name TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_cdocs_activity_cdoc ON public.team_cdocs_activity(cdoc_id, created_at DESC);
ALTER TABLE public.team_cdocs_activity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_team_cdocs_activity" ON public.team_cdocs_activity;
CREATE POLICY "allow_all_team_cdocs_activity" ON public.team_cdocs_activity FOR ALL USING (true) WITH CHECK (true);

-- 2. cSign — expand signature_requests
ALTER TABLE public.team_signature_requests
  ADD COLUMN IF NOT EXISTS signature_x NUMERIC,
  ADD COLUMN IF NOT EXISTS signature_y NUMERIC,
  ADD COLUMN IF NOT EXISTS signature_page INT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Align `status` enum with the port (pending/opened/signed/declined/cancelled already ok)

-- 3. Protect Docs — kind + file metadata
ALTER TABLE public.team_protected_documents
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'generic' CHECK (kind IN ('generic','brief','env','contract','asset','cdocs')),
  ADD COLUMN IF NOT EXISTS body TEXT,
  ADD COLUMN IF NOT EXISTS file_mime TEXT,
  ADD COLUMN IF NOT EXISTS specific_member_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Relax visibility to add "public"
ALTER TABLE public.team_protected_documents DROP CONSTRAINT IF EXISTS team_protected_documents_visibility_check;
ALTER TABLE public.team_protected_documents
  ADD CONSTRAINT team_protected_documents_visibility_check
  CHECK (visibility IN ('all_team','department','specific_members','admin_only','public'));

DROP TRIGGER IF EXISTS trg_team_protected_docs_touch ON public.team_protected_documents;
CREATE TRIGGER trg_team_protected_docs_touch BEFORE UPDATE ON public.team_protected_documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. cResume — expand the resume profile
ALTER TABLE public.team_resumes
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS email_public TEXT,
  ADD COLUMN IF NOT EXISTS socials JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

-- 5. cMeet — bring fields the port expects
ALTER TABLE public.team_meetings
  ADD COLUMN IF NOT EXISTS audio_only BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS project_id UUID,
  ADD COLUMN IF NOT EXISTS milestone_id UUID;

-- Seed any missing share tokens on existing cDocs rows
UPDATE public.team_cdocs SET share_token = encode(gen_random_bytes(16), 'hex') WHERE share_token IS NULL;
