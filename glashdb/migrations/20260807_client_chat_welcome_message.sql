-- Editable one-time welcome message for newly created client accounts.

create table if not exists public.client_chat_welcome_settings (
  id smallint primary key default 1,
  message text not null,
  is_active boolean not null default true,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_chat_welcome_settings_singleton check (id = 1),
  constraint client_chat_welcome_settings_message_length check (char_length(message) between 50 and 12000)
);

insert into public.client_chat_welcome_settings (id, message, is_active)
values (
  1,
  $welcome$Welcome to CDS Space.

We are genuinely excited to have you here.

At CDS Space, we do not see the people and businesses we work with as just clients. We see you as a partner, and we believe the strongest work happens when both sides are aligned around one vision: building something credible, memorable, and built to last.

Your account is now set up, and this marks the beginning of a journey we hope will help your business communicate its true value more clearly at every touchpoint.

Our goal is not simply to make your brand look better.

We want to help you build a professional brand that represents who you are, what you stand for, and where you are going, whether someone encounters you through your website, product, packaging, social media, office, event, marketing materials, or customer experience.

As we work together, our team will focus on helping you create greater consistency, stronger customer trust, better experiences, and a brand infrastructure that can continue to represent your business professionally as it grows.

Through your CDS Space account, you will be able to communicate with our team, manage your projects, share files, follow progress, access important documents and deliverables, and keep everything related to our work together organised in one place.

More importantly, we want you to know that you are not simply purchasing a service from us.

You are giving us the opportunity to contribute to something you are building, and we take that responsibility seriously.

Whatever stage your business is currently in, our aim is to help make the next version stronger, clearer, more credible, and more prepared for the opportunities ahead.

Welcome to CDS Space.

We look forward to building something remarkable with you.

**CDS Space Branding Agency**
**Best Attracts Best.**

[www.cdsspace.pro](https://www.cdsspace.pro)
support@cdsspace.pro$welcome$,
  true
)
on conflict (id) do nothing;

drop trigger if exists client_chat_welcome_settings_updated_at on public.client_chat_welcome_settings;
create trigger client_chat_welcome_settings_updated_at
  before update on public.client_chat_welcome_settings
  for each row execute function public.update_updated_at();

create unique index if not exists idx_chat_messages_one_client_welcome
  on public.chat_messages (room_id)
  where metadata ->> 'kind' = 'client_welcome';

create or replace function public.send_client_signup_welcome_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  welcome_text text;
  welcome_updated_at timestamptz;
begin
  -- Staff/admin accounts are not created through the client signup flow, but
  -- keep the known super-admin identities out if a profile is ever recreated.
  if lower(coalesce(new.email, '')) in ('ceo@cdsspace.pro', 'admin@cdsspace.pro') then
    return new;
  end if;

  select settings.message, settings.updated_at
    into welcome_text, welcome_updated_at
  from public.client_chat_welcome_settings settings
  where settings.id = 1
    and settings.is_active = true;

  if nullif(btrim(welcome_text), '') is null then
    return new;
  end if;

  insert into public.chat_messages (
    room_id,
    sender_id,
    sender_role,
    message,
    is_read,
    source,
    message_type,
    delivery_status,
    sent_at,
    metadata
  ) values (
    'client_' || new.id::text,
    null,
    'admin',
    welcome_text,
    false,
    'web',
    'text',
    'sent',
    now(),
    jsonb_build_object(
      'kind', 'client_welcome',
      'automated', true,
      'template_updated_at', welcome_updated_at
    )
  )
  on conflict do nothing;

  return new;
exception
  when others then
    -- A welcome message must never prevent account creation. The warning is
    -- retained in the database log for investigation.
    raise warning 'Could not create CDS Space client welcome message for %: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists profiles_send_client_signup_welcome on public.profiles;
create trigger profiles_send_client_signup_welcome
  after insert on public.profiles
  for each row execute function public.send_client_signup_welcome_message();

alter table public.client_chat_welcome_settings enable row level security;
revoke all on table public.client_chat_welcome_settings from anon, authenticated;

comment on table public.client_chat_welcome_settings is
  'Super-admin managed message sent once to every newly created client profile.';
comment on function public.send_client_signup_welcome_message() is
  'Creates the initial unread admin chat message when a client profile is first created.';
