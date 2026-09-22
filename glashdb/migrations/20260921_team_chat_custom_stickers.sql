create table if not exists public.team_chat_stickers (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  title text not null,
  asset_url text,
  emoji text,
  background text not null default '#0A4FE8',
  mime_type text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint team_chat_stickers_content_check check (
    (asset_url is not null and emoji is null)
    or (asset_url is null and emoji is not null)
  )
);

create index if not exists idx_team_chat_stickers_active_created
  on public.team_chat_stickers(is_active, created_at desc);

alter table public.team_chat_stickers enable row level security;

drop policy if exists team_chat_stickers_authenticated_read
  on public.team_chat_stickers;
create policy team_chat_stickers_authenticated_read
  on public.team_chat_stickers
  for select
  to authenticated
  using (is_active = true);

revoke insert, update, delete on public.team_chat_stickers from authenticated;
grant select on public.team_chat_stickers to authenticated;
