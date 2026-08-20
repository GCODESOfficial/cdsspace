-- Client birthday reminder preferences and outreach history.
-- Safe to run repeatedly.

alter table public.clients
  add column if not exists birthday_reminder_enabled boolean not null default true,
  add column if not exists birthday_reminder_days smallint not null default 30,
  add column if not exists preferred_contact_method text,
  add column if not exists last_birthday_wish_at timestamptz,
  add column if not exists birthday_wished_for_year integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clients_birthday_reminder_days_check'
      and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients
      add constraint clients_birthday_reminder_days_check
      check (birthday_reminder_days between 1 and 90);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'clients_preferred_contact_method_check'
      and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients
      add constraint clients_preferred_contact_method_check
      check (
        preferred_contact_method is null
        or preferred_contact_method in ('email', 'whatsapp', 'phone')
      );
  end if;
end $$;

create index if not exists idx_clients_birthday_reminders
  on public.clients (birthday_reminder_enabled, birthday)
  where birthday is not null;

comment on column public.clients.birthday_reminder_enabled is
  'Whether admin birthday reminders should be shown for this client.';
comment on column public.clients.birthday_reminder_days is
  'How many days before the next birthday the reminder becomes visible.';
comment on column public.clients.preferred_contact_method is
  'Preferred birthday outreach channel: email, whatsapp, or phone.';
comment on column public.clients.last_birthday_wish_at is
  'When the team most recently marked birthday wishes as sent.';
comment on column public.clients.birthday_wished_for_year is
  'The birthday occurrence year that was marked as wished.';
