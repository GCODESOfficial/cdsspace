-- Stickers are transparent visual assets; colour belongs to the asset itself,
-- never to an application-generated tile behind it.
alter table public.team_chat_stickers
  alter column background set default 'transparent';

update public.team_chat_stickers
set background = 'transparent'
where background is distinct from 'transparent';

-- Direct client/support chat now uses the same sticker message contract as
-- project and team chat.
alter table public.chat_messages
  add column if not exists sticker_key text;

create index if not exists idx_chat_messages_sticker_key
  on public.chat_messages(sticker_key)
  where sticker_key is not null;
