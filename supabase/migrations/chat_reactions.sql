-- ============================================
-- CDS Space: Chat message reactions
-- Stores reactions as a JSONB map: { "❤️": ["uuid1","uuid2"], "👏": ["uuid3"] }
-- ============================================

alter table public.chat_messages
  add column if not exists reactions jsonb not null default '{}'::jsonb;

create index if not exists idx_chat_messages_reactions on public.chat_messages using gin (reactions);
