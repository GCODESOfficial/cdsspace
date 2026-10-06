-- Pinned chats: a person's own conversations kept at the top of their chat
-- list, as WhatsApp's "Pin chat" (a conversation, not a message). Per person,
-- so it follows them to every device: viewer_key is 'team:<member id>' or
-- 'admin:<member id or email>'; conversation_key is 'team:<thread id>' (team
-- chat) or 'room:<room id>' (an admin's client conversation).

begin;

create table if not exists public.chat_pins (
  viewer_key text not null,
  conversation_key text not null,
  pinned_at timestamptz not null default now(),
  primary key (viewer_key, conversation_key)
);

alter table public.chat_pins enable row level security;
revoke all on public.chat_pins from anon, authenticated;

commit;
