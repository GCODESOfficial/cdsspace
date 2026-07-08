-- Enable Supabase Realtime broadcast for cmeet:* channels.
--
-- Why: cmeet signalling goes through `channel('cmeet:<room>')` with
-- broadcast-only payloads (no table reads). On fresh Supabase projects
-- the `realtime.messages` table has no permissive RLS, so subscribe()
-- fails with CHANNEL_ERROR the moment a peer tries to connect.
--
-- This migration installs two permissive policies that apply only to
-- topics matching `cmeet:%` - every authenticated user can read and
-- write broadcast frames for those topics, and nothing else is exposed.
--
-- Re-runnable: policies are dropped-if-exists first.

-- 1) Make sure RLS is on so policies are evaluated.
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

-- 2) Allow any authenticated or anon session to receive cmeet:* frames.
DROP POLICY IF EXISTS "cmeet realtime read" ON realtime.messages;
CREATE POLICY "cmeet realtime read"
ON realtime.messages
FOR SELECT
TO authenticated, anon
USING (realtime.topic() LIKE 'cmeet:%');

-- 3) Allow any authenticated or anon session to send cmeet:* frames.
DROP POLICY IF EXISTS "cmeet realtime write" ON realtime.messages;
CREATE POLICY "cmeet realtime write"
ON realtime.messages
FOR INSERT
TO authenticated, anon
WITH CHECK (realtime.topic() LIKE 'cmeet:%');
