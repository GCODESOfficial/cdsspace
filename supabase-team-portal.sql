-- ============================================
-- CDS Space: Team Portal Schema
-- Team members, chat, documents, meetings, resumes, payroll,
-- notifications, and sub-admin linkage.
-- Run this in Supabase SQL Editor. Idempotent where possible.
-- ============================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- 1. Team members (team login + profile)
-- ============================================
CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,          -- sha256(password + password_salt)
  password_salt TEXT NOT NULL,
  avatar_url TEXT,
  role_title TEXT,                      -- e.g. "Brand Designer"
  department TEXT,                      -- e.g. "Design", "Engineering"
  phone TEXT,
  location TEXT,
  bio TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_sub_admin BOOLEAN NOT NULL DEFAULT false,
  permissions TEXT[] NOT NULL DEFAULT '{}',   -- when is_sub_admin=true, mirrors sub_admins.permissions
  session_token TEXT,                   -- random cookie value
  session_expires_at TIMESTAMPTZ,
  invite_token TEXT UNIQUE,             -- one-shot invite token (null once redeemed)
  invite_filled BOOLEAN NOT NULL DEFAULT false,
  joined_at DATE DEFAULT CURRENT_DATE,
  language TEXT DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_members_session_token ON public.team_members(session_token) WHERE session_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_team_members_department ON public.team_members(department);
CREATE INDEX IF NOT EXISTS idx_team_members_active ON public.team_members(is_active);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_team_members" ON public.team_members;
CREATE POLICY "allow_all_team_members" ON public.team_members
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 2. Work assignments (which team member is on which work)
-- ============================================
CREATE TABLE IF NOT EXISTS public.team_work_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  work_id INT,                          -- references works.id (projects table uses bigint in this project)
  role_on_work TEXT,                    -- e.g. "Lead Designer"
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','paused','removed')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (team_member_id, work_id)
);

CREATE INDEX IF NOT EXISTS idx_team_work_assignments_member ON public.team_work_assignments(team_member_id);
CREATE INDEX IF NOT EXISTS idx_team_work_assignments_work ON public.team_work_assignments(work_id);
ALTER TABLE public.team_work_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_team_work_assignments" ON public.team_work_assignments;
CREATE POLICY "allow_all_team_work_assignments" ON public.team_work_assignments
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 3. Chat (threads + messages)
-- ============================================
CREATE TABLE IF NOT EXISTS public.team_chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL DEFAULT 'direct' CHECK (kind IN ('direct','group','department','admin_broadcast')),
  name TEXT,                            -- nullable for DMs; required for groups/departments
  department TEXT,                      -- set for kind='department'
  created_by UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  includes_admin BOOLEAN NOT NULL DEFAULT false,  -- true when CEO/super_admin participates
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_chat_participants (
  thread_id UUID NOT NULL REFERENCES public.team_chat_threads(id) ON DELETE CASCADE,
  team_member_id UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ,
  PRIMARY KEY (thread_id, team_member_id)
);

CREATE TABLE IF NOT EXISTS public.team_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.team_chat_threads(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  sender_is_admin BOOLEAN NOT NULL DEFAULT false,   -- true when CEO posts (no team_member row)
  body TEXT,
  attachment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_chat_messages_thread ON public.team_chat_messages(thread_id, created_at DESC);
ALTER TABLE public.team_chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_team_chat_threads" ON public.team_chat_threads;
DROP POLICY IF EXISTS "allow_all_team_chat_participants" ON public.team_chat_participants;
DROP POLICY IF EXISTS "allow_all_team_chat_messages" ON public.team_chat_messages;
CREATE POLICY "allow_all_team_chat_threads" ON public.team_chat_threads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_team_chat_participants" ON public.team_chat_participants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_team_chat_messages" ON public.team_chat_messages FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 4. Protected documents
-- ============================================
CREATE TABLE IF NOT EXISTS public.team_protected_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  file_size_bytes BIGINT,
  password_hash TEXT,                   -- optional extra password gate
  password_salt TEXT,
  visibility TEXT NOT NULL DEFAULT 'all_team' CHECK (visibility IN ('all_team','department','specific_members','admin_only')),
  allowed_department TEXT,
  allowed_member_ids UUID[],
  uploaded_by UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  uploaded_by_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_protected_document_opens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.team_protected_documents(id) ON DELETE CASCADE,
  team_member_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.team_protected_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_protected_document_opens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_team_protected_documents" ON public.team_protected_documents;
DROP POLICY IF EXISTS "allow_all_team_protected_document_opens" ON public.team_protected_document_opens;
CREATE POLICY "allow_all_team_protected_documents" ON public.team_protected_documents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_team_protected_document_opens" ON public.team_protected_document_opens FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 5. cMeet (meetings)
-- ============================================
CREATE TABLE IF NOT EXISTS public.team_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL UNIQUE,       -- short join code, e.g. "CDS-AB12CD"
  title TEXT NOT NULL,
  agenda TEXT,
  scheduled_for TIMESTAMPTZ,
  created_by UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  created_by_admin BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','ended','cancelled')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_meeting_participants (
  meeting_id UUID NOT NULL REFERENCES public.team_meetings(id) ON DELETE CASCADE,
  team_member_id UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  PRIMARY KEY (meeting_id, team_member_id)
);

ALTER TABLE public.team_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_meeting_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_team_meetings" ON public.team_meetings;
DROP POLICY IF EXISTS "allow_all_team_meeting_participants" ON public.team_meeting_participants;
CREATE POLICY "allow_all_team_meetings" ON public.team_meetings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_team_meeting_participants" ON public.team_meeting_participants FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 6. cDocs (internal collaborative docs)
-- ============================================
CREATE TABLE IF NOT EXISTS public.team_cdocs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',        -- markdown
  theme TEXT NOT NULL DEFAULT 'light',
  department TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  created_by_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.team_cdocs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_team_cdocs" ON public.team_cdocs;
CREATE POLICY "allow_all_team_cdocs" ON public.team_cdocs FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 7. cSign (signature requests)
-- ============================================
CREATE TABLE IF NOT EXISTS public.team_signature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES public.team_cdocs(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  requested_by_admin BOOLEAN NOT NULL DEFAULT false,
  signer_team_member_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  signer_email TEXT,                    -- external signers
  signer_name TEXT,
  access_token TEXT NOT NULL UNIQUE,    -- for public signing link
  signature_image_url TEXT,
  signed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','signed','cancelled','expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.team_signature_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_team_signature_requests" ON public.team_signature_requests;
CREATE POLICY "allow_all_team_signature_requests" ON public.team_signature_requests FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 8. cResume (internal profile resumes)
-- ============================================
CREATE TABLE IF NOT EXISTS public.team_resumes (
  team_member_id UUID PRIMARY KEY REFERENCES public.team_members(id) ON DELETE CASCADE,
  headline TEXT,
  about TEXT,
  skills TEXT[] NOT NULL DEFAULT '{}',
  past_roles JSONB NOT NULL DEFAULT '[]'::jsonb,     -- [{company, title, from, to, summary}]
  projects JSONB NOT NULL DEFAULT '[]'::jsonb,       -- [{title, url, summary}]
  education JSONB NOT NULL DEFAULT '[]'::jsonb,
  certifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  share_token TEXT UNIQUE,                            -- for public link
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.team_resumes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_team_resumes" ON public.team_resumes;
CREATE POLICY "allow_all_team_resumes" ON public.team_resumes FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 9. Payroll entries (per member, per period)
-- ============================================
CREATE TABLE IF NOT EXISTS public.team_payroll_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  period TEXT NOT NULL,                 -- "2026-04" or "2026-W17"
  period_type TEXT NOT NULL DEFAULT 'monthly' CHECK (period_type IN ('monthly','weekly','bi_weekly','one_off')),
  gross_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  deductions NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'NGN',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','cancelled')),
  payment_ref TEXT,
  paid_on DATE,
  scheduled_for DATE,                   -- next-payment date
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_payroll_member ON public.team_payroll_entries(team_member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_payroll_status ON public.team_payroll_entries(status);
ALTER TABLE public.team_payroll_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_team_payroll_entries" ON public.team_payroll_entries;
CREATE POLICY "allow_all_team_payroll_entries" ON public.team_payroll_entries FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 10. Notifications
-- ============================================
CREATE TABLE IF NOT EXISTS public.team_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID REFERENCES public.team_members(id) ON DELETE CASCADE,
  for_admin BOOLEAN NOT NULL DEFAULT false,
  kind TEXT NOT NULL,                   -- 'chat_message','work_assigned','cdocs_tag','csign_request','payroll','cmeet_invite','doc_shared'
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,                            -- in-app route
  actor_member_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  actor_is_admin BOOLEAN NOT NULL DEFAULT false,
  thread_id UUID,
  meeting_id UUID,
  document_id UUID,
  work_id INT,
  signature_request_id UUID,
  payroll_entry_id UUID,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_notifications_recipient ON public.team_notifications(recipient_id, created_at DESC) WHERE recipient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_team_notifications_admin ON public.team_notifications(for_admin, created_at DESC) WHERE for_admin = true;
ALTER TABLE public.team_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_team_notifications" ON public.team_notifications;
CREATE POLICY "allow_all_team_notifications" ON public.team_notifications FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 11. Storage buckets (run once; idempotent)
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('team-avatars', 'team-avatars', true),
  ('team-documents', 'team-documents', true),
  ('team-signatures', 'team-signatures', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies - open for app-level role checks
DO $$
DECLARE
  bucket TEXT;
BEGIN
  FOR bucket IN SELECT unnest(ARRAY['team-avatars','team-documents','team-signatures']) LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "%s_rw" ON storage.objects',
      bucket
    );
    EXECUTE format(
      'CREATE POLICY "%s_rw" ON storage.objects FOR ALL USING (bucket_id = %L) WITH CHECK (bucket_id = %L)',
      bucket, bucket, bucket
    );
  END LOOP;
END $$;

-- ============================================
-- 12. updated_at trigger helper
-- ============================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_team_members_touch ON public.team_members;
CREATE TRIGGER trg_team_members_touch BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_team_cdocs_touch ON public.team_cdocs;
CREATE TRIGGER trg_team_cdocs_touch BEFORE UPDATE ON public.team_cdocs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_team_resumes_touch ON public.team_resumes;
CREATE TRIGGER trg_team_resumes_touch BEFORE UPDATE ON public.team_resumes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
