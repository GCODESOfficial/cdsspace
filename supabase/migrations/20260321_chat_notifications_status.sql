-- ═══════════════════════════════════════════════════════════════════════
-- CDS Space - Full Database Setup (Supabase)
-- Run this in your Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. Base Tables ──────────────────────────────────────────────────

-- Profiles (linked to Supabase Auth users via auth.uid())
create table if not exists profiles (
  id uuid primary key,                -- matches auth.users.id
  email text unique not null,
  full_name text,
  company_name text,
  phone_number text,
  avatar_url text,
  referral_code text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Subscriptions
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  plan text not null,
  industry text not null,
  company_name text not null,
  brand_brief text,
  design_count integer not null default 0,
  status text not null default 'active',
  assets text,
  referral_code text,
  referrer_id uuid,
  last_reset_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Design Request Status Enum
do $$ begin
  create type design_request_status as enum ('PENDING', 'IN_REVIEW', 'ACTIVE', 'COMPLETED');
exception when duplicate_object then null;
end $$;

-- Banner Status Enum
do $$ begin
  create type banner_status as enum ('PENDING', 'ACTIVE', 'DRAFT', 'SCHEDULED', 'ARCHIVED', 'COMPLETED');
exception when duplicate_object then null;
end $$;

-- Design Requests
create table if not exists design_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  description text not null,
  status design_request_status not null default 'PENDING',
  display_id text,
  admin_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Banner Requests
create table if not exists banner_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  display_id text,
  title text not null default 'Untitled Banner',
  size text not null,
  quality text not null default 'Standard',
  environment text not null default 'Indoor',
  execution_mode text not null default 'Upload',
  design_brief text,
  quantity integer not null default 1,
  status banner_status not null default 'DRAFT',
  mockup_url text,
  admin_notes text,
  fulfillment_type text not null default 'Door-to-door',
  country text,
  state text,
  city text,
  street_address text,
  recipient_name text,
  phone_number text,
  instructions text,
  pickup_station text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─── 2. Chat Messages ───────────────────────────────────────────────

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,               -- format: "client_{userId}"
  sender_id uuid not null references profiles(id) on delete cascade,
  sender_role text not null check (sender_role in ('admin', 'client')),
  message text not null,
  file_url text,
  is_read boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_chat_room_time on chat_messages(room_id, created_at);
create index if not exists idx_chat_sender on chat_messages(sender_id);

-- ─── 3. Notifications ───────────────────────────────────────────────

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('order_update', 'new_message', 'status_change', 'new_order')),
  title text not null,
  message text not null,
  link text,
  is_read boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_notif_user_read on notifications(user_id, is_read);

-- ─── 4. Status Updates (audit trail) ────────────────────────────────

create table if not exists status_updates (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('design_request', 'banner_request')),
  entity_id uuid not null,
  previous_status text not null,
  new_status text not null,
  note text,
  updated_by text not null,           -- admin email or "system"
  created_at timestamptz default now()
);

create index if not exists idx_status_entity on status_updates(entity_type, entity_id);

-- ─── 5. Indexes on base tables ──────────────────────────────────────

create index if not exists idx_subs_user on subscriptions(user_id);
create index if not exists idx_design_user on design_requests(user_id);
create index if not exists idx_banner_user on banner_requests(user_id);

-- ─── 6. Auto-create profile on signup (trigger) ─────────────────────

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url),
    updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

-- Drop existing trigger if any, then create
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── 7. Enable Realtime ─────────────────────────────────────────────

alter publication supabase_realtime add table chat_messages;
alter publication supabase_realtime add table notifications;

-- ─── 8. Row Level Security ──────────────────────────────────────────

-- Profiles
alter table profiles enable row level security;

create policy "Users can read own profile"
  on profiles for select
  using (id = auth.uid());

create policy "Users can update own profile"
  on profiles for update
  using (id = auth.uid());

-- Subscriptions
alter table subscriptions enable row level security;

create policy "Users can read own subscriptions"
  on subscriptions for select
  using (user_id = auth.uid());

create policy "Users can insert own subscriptions"
  on subscriptions for insert
  with check (user_id = auth.uid());

create policy "Users can update own subscriptions"
  on subscriptions for update
  using (user_id = auth.uid());

-- Design Requests
alter table design_requests enable row level security;

create policy "Users can read own design requests"
  on design_requests for select
  using (user_id = auth.uid());

create policy "Users can insert own design requests"
  on design_requests for insert
  with check (user_id = auth.uid());

create policy "Users can update own design requests"
  on design_requests for update
  using (user_id = auth.uid());

-- Banner Requests
alter table banner_requests enable row level security;

create policy "Users can read own banner requests"
  on banner_requests for select
  using (user_id = auth.uid());

create policy "Users can insert own banner requests"
  on banner_requests for insert
  with check (user_id = auth.uid());

create policy "Users can update own banner requests"
  on banner_requests for update
  using (user_id = auth.uid());

create policy "Users can delete own banner requests"
  on banner_requests for delete
  using (user_id = auth.uid());

-- Chat Messages
alter table chat_messages enable row level security;

create policy "Users can read own room messages"
  on chat_messages for select
  using (room_id = 'client_' || auth.uid()::text);

create policy "Users can insert own messages"
  on chat_messages for insert
  with check (sender_id = auth.uid());

-- Notifications
alter table notifications enable row level security;

create policy "Users can read own notifications"
  on notifications for select
  using (user_id = auth.uid());

create policy "Users can update own notifications"
  on notifications for update
  using (user_id = auth.uid());

-- Status Updates (read-only, filtered at API level)
alter table status_updates enable row level security;

create policy "Anyone can read status updates"
  on status_updates for select
  using (true);
