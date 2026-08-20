-- Track the two welcome-message channels independently so delivery and
-- historical backfills remain idempotent.

create table if not exists public.client_welcome_deliveries (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  chat_delivered_at timestamptz,
  email_sent_at timestamptz,
  email_attempted_at timestamptz,
  email_error text,
  template_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.client_welcome_deliveries (
  user_id,
  chat_delivered_at,
  template_updated_at
)
select p.id,
       min(m.created_at),
       max(nullif(m.metadata ->> 'template_updated_at', '')::timestamptz)
  from public.profiles p
  join public.chat_messages m
    on m.room_id = 'client_' || p.id::text
   and m.metadata ->> 'kind' = 'client_welcome'
 group by p.id
on conflict (user_id) do update
set chat_delivered_at = coalesce(public.client_welcome_deliveries.chat_delivered_at, excluded.chat_delivered_at),
    template_updated_at = coalesce(excluded.template_updated_at, public.client_welcome_deliveries.template_updated_at),
    updated_at = now();

drop trigger if exists client_welcome_deliveries_updated_at on public.client_welcome_deliveries;
create trigger client_welcome_deliveries_updated_at
  before update on public.client_welcome_deliveries
  for each row execute function public.update_updated_at();

alter table public.client_welcome_deliveries enable row level security;
revoke all on table public.client_welcome_deliveries from anon, authenticated;

comment on table public.client_welcome_deliveries is
  'Idempotent audit state for CDS Space client welcome messages delivered by chat and email.';
