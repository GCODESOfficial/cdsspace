-- ============================================
-- CDS Space: AI system schema
-- ============================================
-- Usage logging (cost + audit), admin-curated templates, and
-- per-installation settings (quota, model pin, feature toggles).
-- Run in Supabase SQL Editor.
-- ============================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Usage log - every AI generation call (success OR error)
CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,                                     -- matches AIKind in src/lib/ai/prompts.ts
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('admin','team','public')),
  actor_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  model TEXT,
  prompt_tokens INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  latency_ms INT,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','error','rate_limited','unauthorized')),
  error TEXT,
  input_excerpt TEXT,                                     -- first ~400 chars for debugging
  output_excerpt TEXT,                                    -- first ~400 chars for debugging
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_time ON public.ai_usage_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_actor ON public.ai_usage_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_kind ON public.ai_usage_log (kind, created_at DESC);

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_ai_usage_log" ON public.ai_usage_log;
CREATE POLICY "allow_all_ai_usage_log" ON public.ai_usage_log
  FOR ALL USING (true) WITH CHECK (true);

-- 2. Templates - reusable, admin-editable prompts for cDocs & project docs
CREATE TABLE IF NOT EXISTS public.ai_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'cdocs'
    CHECK (category IN ('cdocs','project','role','chat','resume','custom')),
  emoji TEXT DEFAULT '📝',
  description TEXT,
  body_template TEXT NOT NULL,                            -- markdown scaffold
  ai_seed_prompt TEXT,                                    -- optional: user hint to AI when instantiating
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,           -- [{"key":"project_name","label":"Project","required":true}]
  is_builtin BOOLEAN NOT NULL DEFAULT false,
  times_used INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_templates_category ON public.ai_templates (category);

ALTER TABLE public.ai_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_ai_templates" ON public.ai_templates;
CREATE POLICY "allow_all_ai_templates" ON public.ai_templates
  FOR ALL USING (true) WITH CHECK (true);

-- 3. Settings - single row. daily_token_cap applied cumulatively across actors.
CREATE TABLE IF NOT EXISTS public.ai_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled BOOLEAN NOT NULL DEFAULT true,
  allow_team BOOLEAN NOT NULL DEFAULT true,               -- if false, only admins can call AI
  allow_public BOOLEAN NOT NULL DEFAULT false,            -- e.g. careers reply-helpers for applicants
  daily_token_cap INT NOT NULL DEFAULT 200000,            -- 0 = unlimited
  default_model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.ai_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_ai_settings" ON public.ai_settings;
CREATE POLICY "allow_all_ai_settings" ON public.ai_settings
  FOR ALL USING (true) WITH CHECK (true);

-- 4. Knowledge documents - admin-uploaded files and notes that can be used
-- as reference context during generation.
CREATE TABLE IF NOT EXISTS public.ai_knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'custom'
    CHECK (category IN ('cdocs','project','role','chat','resume','custom')),
  description TEXT,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  content_text TEXT,
  content_excerpt TEXT,
  file_name TEXT,
  file_path TEXT,
  file_mime TEXT,
  file_size_bytes INT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_documents_category
  ON public.ai_knowledge_documents (category, is_active, updated_at DESC);

ALTER TABLE public.ai_knowledge_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_ai_knowledge_documents" ON public.ai_knowledge_documents;
CREATE POLICY "allow_all_ai_knowledge_documents" ON public.ai_knowledge_documents
  FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.ai_knowledge_documents_bump_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.content_excerpt IS NULL OR NEW.content_excerpt = '' THEN
    NEW.content_excerpt := left(coalesce(NEW.content_text, NEW.description, ''), 900);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ai_knowledge_documents_bump_updated ON public.ai_knowledge_documents;
CREATE TRIGGER trg_ai_knowledge_documents_bump_updated
  BEFORE INSERT OR UPDATE ON public.ai_knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION public.ai_knowledge_documents_bump_updated();

INSERT INTO storage.buckets (id, name, public)
VALUES ('ai-training-docs', 'ai-training-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Keep templates.updated_at fresh and auto-slugify if caller omits
CREATE OR REPLACE FUNCTION public.ai_templates_bump_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := lower(regexp_replace(NEW.title, '[^a-zA-Z0-9]+', '-', 'g')) ||
                '-' || substr(md5(random()::text), 1, 5);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ai_templates_bump_updated ON public.ai_templates;
CREATE TRIGGER trg_ai_templates_bump_updated
  BEFORE INSERT OR UPDATE ON public.ai_templates
  FOR EACH ROW EXECUTE FUNCTION public.ai_templates_bump_updated();

-- 5. Built-in cDocs templates (idempotent inserts)
INSERT INTO public.ai_templates (slug, title, category, emoji, description, body_template, ai_seed_prompt, variables, is_builtin)
VALUES
  ('meeting-notes', 'Meeting Notes', 'cdocs', '🗒️',
   'Running notes for a meeting, with action items and decisions.',
$$# {{meeting_title}}
_{{date}} · Attendees: {{attendees}}_

## Agenda
-

## Discussion
-

## Decisions
-

## Action items
- [ ]

## Follow-ups
-
$$,
   'Draft internal meeting notes for {{meeting_title}} attended by {{attendees}}.',
   '[{"key":"meeting_title","label":"Meeting title","required":true},{"key":"date","label":"Date"},{"key":"attendees","label":"Attendees"}]'::jsonb,
   true),

  ('one-on-one-agenda', '1:1 Agenda', 'cdocs', '👥',
   'A lightweight agenda for a manager ↔ direct report 1:1.',
$$# 1:1 - {{manager}} & {{report}}
_{{date}}_

## Wins since last time
-

## Blockers / frustrations
-

## Projects in flight
-

## Growth & feedback
-

## Next actions
- [ ]
$$, NULL,
   '[{"key":"manager","label":"Manager"},{"key":"report","label":"Direct report"},{"key":"date","label":"Date"}]'::jsonb,
   true),

  ('product-brief', 'Product Brief (PRD)', 'cdocs', '📘',
   'A one-pager PRD: problem, user, success, scope.',
$$# {{project_name}} - Product Brief

## Problem
What are we solving and for whom?

## Target user
Who is this for? What are they trying to do?

## Success metric
How do we know this worked?

## Scope
### In scope
-
### Out of scope
-

## Constraints & risks
-

## Open questions
-
$$,
   'Draft a crisp product brief for {{project_name}}.',
   '[{"key":"project_name","label":"Project","required":true}]'::jsonb,
   true),

  ('post-mortem', 'Post-mortem', 'cdocs', '🔍',
   'Blameless post-mortem for an incident or failed initiative.',
$$# Post-mortem - {{incident}}

## What happened
_Timeline of events_

## Impact
-

## Root causes
-

## What went well
-

## What could have gone better
-

## Action items
- [ ]
$$, NULL,
   '[{"key":"incident","label":"Incident / initiative","required":true}]'::jsonb,
   true),

  ('launch-plan', 'Launch Plan', 'cdocs', '🚀',
   'Plan a launch: positioning, channels, day-of checklist.',
$$# {{launch_name}} - Launch Plan

## Positioning
_One line: who it's for and what it does differently._

## Key moments
-

## Channels
- Twitter/X
- LinkedIn
- Email
- Clients list

## Asset checklist
- [ ] Hero image
- [ ] Landing page section
- [ ] Launch post copy
- [ ] Founder thread
$$,
   'Draft a launch plan for {{launch_name}}.',
   '[{"key":"launch_name","label":"Launch name","required":true}]'::jsonb,
   true),

  ('design-review', 'Design Review', 'cdocs', '🎨',
   'Structured design critique with the CDS eye.',
$$# Design Review - {{artifact}}

## Intent
_What is this trying to accomplish?_

## What's working
-

## What to push further
-

## Specific asks
- [ ]

## Open questions
-
$$, NULL,
   '[{"key":"artifact","label":"Artifact / page","required":true}]'::jsonb,
   true),

  ('project-brief', 'Project Brief', 'project', '💼',
   'Internal brief for a new client project.',
$$# {{project_name}} - Project Brief

## Client
{{client_name}}

## Overview
_2–3 sentences on the project._

## Goals
-

## Scope
-

## Timeline
-

## Stakeholders
-

## Risks
-
$$,
   'Draft an internal project brief for {{client_name}}.',
   '[{"key":"project_name","label":"Project","required":true},{"key":"client_name","label":"Client"}]'::jsonb,
   true)
ON CONFLICT (slug) DO NOTHING;

-- 6. Daily usage rollup - used by admin /ai settings page
CREATE OR REPLACE VIEW public.v_ai_usage_daily AS
SELECT
  date_trunc('day', created_at)::date                              AS day,
  kind,
  COUNT(*)                                                         AS calls,
  SUM(prompt_tokens)                                               AS prompt_tokens,
  SUM(completion_tokens)                                           AS completion_tokens,
  SUM(prompt_tokens + completion_tokens)                           AS total_tokens,
  COUNT(*) FILTER (WHERE status != 'ok')                           AS errors,
  ROUND(AVG(latency_ms)::numeric, 0)                               AS avg_latency_ms
FROM public.ai_usage_log
GROUP BY 1, 2
ORDER BY 1 DESC, total_tokens DESC;

-- (No auto-cap on ai_usage_log - keep every row for audit + cost analysis.)
