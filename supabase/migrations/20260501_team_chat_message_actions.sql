-- ============================================
-- CDS Space: Team chat message actions
-- Adds lightweight reply/edit/delete/reaction/sticker support
-- ============================================

alter table public.team_chat_messages
  add column if not exists reply_to_message_id uuid references public.team_chat_messages(id) on delete set null,
  add column if not exists sticker_key text,
  add column if not exists reactions jsonb not null default '{}'::jsonb,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

create index if not exists idx_team_chat_messages_reply_to on public.team_chat_messages(reply_to_message_id);
create index if not exists idx_team_chat_messages_reactions on public.team_chat_messages using gin (reactions);
