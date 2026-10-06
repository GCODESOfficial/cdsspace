-- When each admin was last active, for "online" / "last seen" in chats.
--
-- Team members (team_device_sessions.last_seen_at) and clients
-- (client_presence.last_seen_at) were already recorded; admins were not, so a
-- client could never see whether CDS Space was online. The admin app and site
-- check for incoming calls every few seconds while open, and that check now
-- records the admin here. Keyed like the call actions: member id (sub-admins)
-- or email (the super admin).

begin;

create table if not exists public.admin_presence (
  admin_key text primary key,
  is_super_admin boolean not null default false,
  takes_client_messages boolean not null default false,
  last_seen_at timestamptz not null default now()
);

alter table public.admin_presence enable row level security;
revoke all on public.admin_presence from anon, authenticated;

commit;
