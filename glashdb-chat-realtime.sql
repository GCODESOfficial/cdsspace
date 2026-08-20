-- ---------------------------------------------------------------------------
-- Team chat realtime engine - message change tracking
-- ---------------------------------------------------------------------------
-- Adds a single `updated_at` column to team_chat_messages plus a trigger that
-- bumps it on every INSERT or UPDATE. This is what powers incremental delta
-- sync in the client: instead of re-fetching the whole thread every few
-- seconds, the client asks "give me everything changed since <cursor>" and the
-- server answers with `WHERE updated_at > cursor`.
--
-- Because the trigger fires on UPDATE too, this transparently captures ALL
-- mutations - new messages, edits, soft-deletes, reactions, pins, stars,
-- bookmarks, schedule/translate - since every one of those is an UPDATE on the
-- message row. No application write-path changes are required.
--
-- SAFETY: The app degrades gracefully if this migration has NOT been applied -
-- the messages API falls back to a created_at cursor (new-messages-only sync),
-- so chat keeps working; you just don't get live reactions/edits for other
-- viewers until this runs. Apply it to light up the full engine.
--
-- GlashDB has no migration runner (see memory: glashdb-migrations-manual);
-- run this by hand against DATABASE_URL / DIRECT_URL once.
-- ---------------------------------------------------------------------------

-- 1. The change-tracking column. Backfills existing rows to their created_at.
ALTER TABLE team_chat_messages
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE team_chat_messages
  SET updated_at = COALESCE(edited_at, deleted_at, sent_at, created_at)
  WHERE updated_at IS NULL;

ALTER TABLE team_chat_messages
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE team_chat_messages
  ALTER COLUMN updated_at SET NOT NULL;

-- 2. Trigger keeps updated_at current on every write. SECURITY: touches only
--    NEW.updated_at, never other columns.
CREATE OR REPLACE FUNCTION team_chat_messages_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_team_chat_messages_updated_at ON team_chat_messages;
CREATE TRIGGER trg_team_chat_messages_updated_at
  BEFORE INSERT OR UPDATE ON team_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION team_chat_messages_touch_updated_at();

-- 3. Indexes for the two hot access paths:
--    (a) delta sync  - WHERE thread_id = ? AND updated_at > ?  ORDER BY updated_at
--    (b) history page - WHERE thread_id = ? AND created_at < ?  ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_tcm_thread_updated_at
  ON team_chat_messages (thread_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_tcm_thread_created_at
  ON team_chat_messages (thread_id, created_at);
