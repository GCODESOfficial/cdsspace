-- ============================================
-- CDS Space: cMeet - enable Supabase Realtime broadcast
--
-- The live meeting client (`src/lib/cmeet-rtc.ts`) subscribes to a Realtime
-- broadcast channel named `cmeet:<roomCode>` to exchange WebRTC signaling
-- (offer / answer / ICE / chat).
--
-- When the project has "Private Channels" or Realtime Authorization turned
-- on, anon users can't subscribe or send to any channel until RLS policies
-- on `realtime.messages` allow it. That surfaces in the browser as
-- CHANNEL_ERROR and the friendly message:
--   "Couldn't connect to the meeting (CHANNEL_ERROR).
--    Make sure Realtime is enabled on this Supabase project…"
--
-- This migration adds the minimal policies so any anon / authenticated user
-- can read AND publish broadcast messages on `cmeet:*` topics (ephemeral
-- WebRTC signaling - no DB rows, no PII, no persistence).
--
-- Idempotent: safe to re-run. No-op on projects where Realtime
-- Authorization is already permissive.
-- ============================================

-- Realtime schema is owned by Supabase; it always exists.
do $$
begin
  -- Only enable RLS if the table exists (defensive - on very old projects
  -- `realtime.messages` may not be provisioned until Realtime is used).
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'realtime' and table_name = 'messages'
  ) then
    execute 'alter table realtime.messages enable row level security';
  end if;
end$$;

-- Drop any previous versions so re-runs stay clean.
drop policy if exists "cmeet broadcast read" on realtime.messages;
drop policy if exists "cmeet broadcast send" on realtime.messages;

-- Allow anyone (anon + logged-in) to receive cmeet broadcasts.
create policy "cmeet broadcast read"
  on realtime.messages
  for select
  to anon, authenticated
  using (
    extension = 'broadcast'
    and topic like 'cmeet:%'
  );

-- Allow anyone (anon + logged-in) to send cmeet broadcasts. These are
-- ephemeral WebRTC signaling frames, not persisted outside the channel.
create policy "cmeet broadcast send"
  on realtime.messages
  for insert
  to anon, authenticated
  with check (
    extension = 'broadcast'
    and topic like 'cmeet:%'
  );

-- Optional: grant the base CRUD privileges on realtime.messages so the
-- policies have something to gate. Supabase provisions these by default,
-- but belt-and-braces for older projects that predate the current grants.
grant select, insert on realtime.messages to anon, authenticated;
