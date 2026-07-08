-- ---------------------------------------------------------------------------
-- Link brand briefs to projects
-- ---------------------------------------------------------------------------
-- Adds a nullable project_id to brand_briefs so a client-submitted brief can be
-- attached to a finance_projects row and surfaced inside that project's
-- workspace Files panel (team/work). One brief per project.
--
-- Set automatically when an admin uses "Create Project" from a brief, and
-- manually via the "Attach brand brief" picker in the project workspace.
--
-- SAFETY: The app degrades gracefully if this hasn't been applied — the
-- team/work API wraps the brief queries in a fallback, so the Files panel keeps
-- working (it just won't show a linked brief until this runs).
--
-- GlashDB has no migration runner (see memory: glashdb-migrations-manual);
-- run this by hand against DATABASE_URL / DIRECT_URL once.
-- ---------------------------------------------------------------------------

ALTER TABLE brand_briefs
  ADD COLUMN IF NOT EXISTS project_id uuid;

-- Detach the brief automatically if its project is deleted.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'brand_briefs_project_id_fkey'
  ) THEN
    ALTER TABLE brand_briefs
      ADD CONSTRAINT brand_briefs_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES finance_projects (id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_brand_briefs_project_id
  ON brand_briefs (project_id);
