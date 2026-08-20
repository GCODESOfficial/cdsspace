begin;

-- Never create a client welcome conversation before the account has proved
-- ownership of its email address. Application delivery applies the same gate;
-- retaining it here protects manual and database-triggered profile inserts.
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
  if new.email_verified_at is null
     or new.account_status is distinct from 'active'
     or lower(coalesce(new.email, '')) in ('ceo@cdsspace.pro', 'admin@cdsspace.pro') then
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
    raise warning 'Could not create CDS Space client welcome message for %: %', new.id, sqlerrm;
    return new;
end;
$$;

-- Fake accounts removed from profiles left behind display-only welcome rooms
-- because the room identifier is text rather than a foreign key. Delete only
-- automated web welcome messages whose UUID no longer belongs to a profile.
delete from public.chat_messages m
 where m.room_id ~* '^client_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and m.sender_role = 'admin'
   and m.source = 'web'
   and m.metadata ->> 'kind' = 'client_welcome'
   and coalesce((m.metadata ->> 'automated')::boolean, false)
   and not exists (
     select 1
       from public.profiles p
      where p.id = substring(m.room_id from 8)::uuid
   );

comment on function public.send_client_signup_welcome_message() is
  'Creates the initial client welcome message only after the client email is verified and the profile is active.';

commit;
