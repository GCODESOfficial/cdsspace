-- ---------------------------------------------------------------------------
-- Many-to-many: team members <-> departments
-- ---------------------------------------------------------------------------
-- A team member can now belong to more than one department. Membership lives in
-- the junction table below (the source of truth for the HRM Departments page,
-- member counts, and department chat-channel membership).
--
-- team_members.department_id / department (text) are KEPT as the member's
-- "primary" department for backward-compat with existing single-department
-- features (lead scoping, displays, project-by-department seeding).
--
-- GlashDB has no migration runner (see memory: glashdb-migrations-manual);
-- run this by hand against DATABASE_URL / DIRECT_URL once.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS team_member_departments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  department_id  uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_member_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_tmd_department ON team_member_departments (department_id);
CREATE INDEX IF NOT EXISTS idx_tmd_member ON team_member_departments (team_member_id);

-- Backfill from the existing single-department assignment (by id)...
INSERT INTO team_member_departments (team_member_id, department_id)
SELECT id, department_id
  FROM team_members
 WHERE department_id IS NOT NULL
ON CONFLICT (team_member_id, department_id) DO NOTHING;

-- ...and by matching the legacy department name string for anyone without an id.
INSERT INTO team_member_departments (team_member_id, department_id)
SELECT m.id, d.id
  FROM team_members m
  JOIN departments d ON lower(d.name) = lower(m.department)
 WHERE m.department IS NOT NULL AND m.department <> ''
ON CONFLICT (team_member_id, department_id) DO NOTHING;
