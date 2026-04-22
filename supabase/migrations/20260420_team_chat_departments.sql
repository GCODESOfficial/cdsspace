-- ============================================
-- CDS Space: Team Chat — Departments + Forwarding
-- Idempotent. Safe to re-run.
-- ============================================

-- 1. Departments (first-class, replaces the free-text team_members.department)
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  thread_id UUID REFERENCES public.team_chat_threads(id) ON DELETE SET NULL,
  created_by UUID,
  created_by_is_admin BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_departments" ON public.departments;
CREATE POLICY "allow_all_departments" ON public.departments FOR ALL USING (true) WITH CHECK (true);

-- updated_at auto-bump (reuses the helper from supabase-team-portal.sql)
DROP TRIGGER IF EXISTS trg_departments_touch ON public.departments;
CREATE TRIGGER trg_departments_touch BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. Add department_id FK to team_members (nullable; keep existing `department` text for back-compat)
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_team_members_department_id ON public.team_members(department_id);

-- 3. Forwarded metadata on team_chat_messages (who originally sent; NOT who forwarded)
ALTER TABLE public.team_chat_messages
  ADD COLUMN IF NOT EXISTS forwarded JSONB;
-- Shape: { original_sender_name: string, original_body: string,
--          original_created_at: timestamptz, original_source: 'client'|'team' }

-- 4. Forwarded metadata on client chat_messages (symmetric)
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS forwarded JSONB;

-- 5. Back-fill: seed departments from existing team_members.department strings
INSERT INTO public.departments (name)
SELECT DISTINCT TRIM(department)
FROM public.team_members
WHERE department IS NOT NULL AND TRIM(department) <> ''
ON CONFLICT (name) DO NOTHING;

-- Link existing members to their department row
UPDATE public.team_members tm
SET department_id = d.id
FROM public.departments d
WHERE tm.department_id IS NULL
  AND tm.department IS NOT NULL
  AND LOWER(TRIM(tm.department)) = LOWER(TRIM(d.name));

-- 6. Auto-create a team_chat_threads row for every existing department that
--    doesn't already have one, and link it back on departments.thread_id.
DO $$
DECLARE
  dept RECORD;
  new_thread_id UUID;
BEGIN
  FOR dept IN SELECT id, name FROM public.departments WHERE thread_id IS NULL LOOP
    INSERT INTO public.team_chat_threads (kind, name, department, includes_admin)
    VALUES ('department', dept.name, dept.name, true)
    RETURNING id INTO new_thread_id;

    UPDATE public.departments SET thread_id = new_thread_id WHERE id = dept.id;

    -- Seed participants: every active member in that department
    INSERT INTO public.team_chat_participants (thread_id, team_member_id)
    SELECT new_thread_id, tm.id
    FROM public.team_members tm
    WHERE tm.department_id = dept.id AND tm.is_active
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- 7. Trigger: keep team_chat_participants in sync when a member's department changes
CREATE OR REPLACE FUNCTION public.sync_member_department_thread()
RETURNS TRIGGER AS $$
DECLARE
  old_thread UUID;
  new_thread UUID;
BEGIN
  -- Leaving a department: remove from old department's thread
  IF TG_OP = 'UPDATE' AND OLD.department_id IS DISTINCT FROM NEW.department_id THEN
    IF OLD.department_id IS NOT NULL THEN
      SELECT thread_id INTO old_thread FROM public.departments WHERE id = OLD.department_id;
      IF old_thread IS NOT NULL THEN
        DELETE FROM public.team_chat_participants
        WHERE thread_id = old_thread AND team_member_id = NEW.id;
      END IF;
    END IF;
  END IF;

  -- Joining a department (or insert): add to new department's thread
  IF NEW.department_id IS NOT NULL AND NEW.is_active THEN
    SELECT thread_id INTO new_thread FROM public.departments WHERE id = NEW.department_id;
    IF new_thread IS NOT NULL THEN
      INSERT INTO public.team_chat_participants (thread_id, team_member_id)
      VALUES (new_thread, NEW.id)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- Deactivating: remove from all department threads
  IF TG_OP = 'UPDATE' AND OLD.is_active IS DISTINCT FROM NEW.is_active AND NEW.is_active = false THEN
    DELETE FROM public.team_chat_participants p
    USING public.team_chat_threads t
    WHERE p.team_member_id = NEW.id
      AND p.thread_id = t.id
      AND t.kind = 'department';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_team_members_sync_thread ON public.team_members;
CREATE TRIGGER trg_team_members_sync_thread
  AFTER INSERT OR UPDATE OF department_id, is_active ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_member_department_thread();

-- ============================================
-- 8. Self-serve team invites
-- One-shot tokens an admin can generate and share; the invitee fills in
-- their own full_name / email / username / password / role / phone.
-- ============================================
CREATE TABLE IF NOT EXISTS public.team_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  suggested_role_title TEXT,
  suggested_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  is_sub_admin BOOLEAN NOT NULL DEFAULT false,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID,
  redeemed_at TIMESTAMPTZ,
  redeemed_member_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_invites_token ON public.team_invites(token);
CREATE INDEX IF NOT EXISTS idx_team_invites_pending ON public.team_invites(redeemed_at) WHERE redeemed_at IS NULL;

ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_team_invites" ON public.team_invites;
CREATE POLICY "allow_all_team_invites" ON public.team_invites FOR ALL USING (true) WITH CHECK (true);
