-- ---------------------------------------------------------------------------
-- Content Hub — AI writing defaults
-- ---------------------------------------------------------------------------
-- Adds two settings to the single-row content_settings table:
--   * default_hashtags — how many hashtags the AI generates by default (3).
--   * best_examples     — a curated list of the brand's best-performing posts,
--                         fed to the AI as few-shot style references so it learns
--                         to write more content like them. Shape:
--                         [{ "text": "...", "platform": "...", "note": "..." }]
--
-- SAFETY: The app degrades gracefully if this hasn't been applied — the meta API
-- falls back to default_hashtags=3 / best_examples=[] and the AI route treats a
-- missing column as "no examples", so nothing breaks.
--
-- GlashDB has no migration runner (see memory: glashdb-migrations-manual);
-- run this by hand against DATABASE_URL / DIRECT_URL once.
-- ---------------------------------------------------------------------------

ALTER TABLE content_settings
  ADD COLUMN IF NOT EXISTS default_hashtags integer NOT NULL DEFAULT 3;

ALTER TABLE content_settings
  ADD COLUMN IF NOT EXISTS best_examples jsonb NOT NULL DEFAULT '[]'::jsonb;
