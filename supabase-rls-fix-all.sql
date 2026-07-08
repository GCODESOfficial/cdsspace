-- ============================================================
-- CDS Space: Fix "RLS not enabled" on all public schema tables
-- ============================================================
-- The Supabase linter ("rls_disabled_in_public") flags every table
-- in the public schema that is exposed to PostgREST but has RLS off.
-- This migration enables RLS on every such table and adds a
-- permissive policy so app access is preserved.
--
-- It matches the policy pattern used elsewhere in this project
-- (e.g. supabase-hrm.sql, supabase-clients.sql) - FOR ALL USING (true)
-- WITH CHECK (true). Tighten per-table later if a table contains
-- data that must not be readable by the anon role.
--
-- Safe to re-run. Only touches tables that currently have RLS off.
-- Run this in the Supabase SQL Editor.
-- ============================================================

DO $$
DECLARE
  r RECORD;
  policy_name text;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'            -- ordinary tables only (no views / partitions / matviews)
      AND n.nspname = 'public'       -- only the PostgREST-exposed schema
      AND c.relrowsecurity = false   -- skip tables that already have RLS enabled
  LOOP
    RAISE NOTICE 'Enabling RLS on public.%', r.relname;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);

    policy_name := 'allow_all_' || r.relname;

    -- Drop if it somehow exists, then create a single permissive policy
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, r.relname);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (true) WITH CHECK (true)',
      policy_name, r.relname
    );
  END LOOP;
END $$;

-- ---- Verification ----
-- After running the DO block this query should return zero rows.
-- If it returns any row, that table still has RLS disabled.
--   SELECT n.nspname, c.relname
--   FROM pg_class c
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE c.relkind = 'r'
--     AND n.nspname = 'public'
--     AND c.relrowsecurity = false;
