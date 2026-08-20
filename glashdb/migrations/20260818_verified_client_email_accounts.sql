begin;

alter table public.profiles
  add column if not exists email_verified_at timestamptz;

comment on column public.profiles.email_verified_at is
  'The auth-provider timestamp proving control of the profile email. Null profiles are never active client accounts.';

update public.profiles p
   set email_verified_at = u.email_confirmed_at,
       updated_at = now()
  from auth.users u
 where u.id = p.id
   and u.email_confirmed_at is not null
   and p.email_verified_at is distinct from u.email_confirmed_at;

-- An orphaned profile cannot authenticate. Preserve profiles that own business
-- or legal records, but suspend and hide them until support restores the auth
-- identity. This avoids destroying client work, invoices, payments or consent.
update public.profiles p
   set email_verified_at = null,
       account_status = case when p.account_status = 'active' then 'suspended' else p.account_status end,
       updated_at = now()
 where not exists (select 1 from auth.users u where u.id = p.id);

-- These records were explicitly identified by the administrator as abusive
-- sign-ups. They have no authentication identity or client work attached.
delete from public.profiles p
 where lower(btrim(p.email)) in (
   'zzfull_1783140087335@example.com',
   'info.glashdb@gmail.com',
   'charlie@selainvestments.com',
   'jhayerak318@gmail.com',
   'lucymonday9@gmail.com',
   'p.reston.t.rin.it.y.8@gmail.com',
   'harrison_guerrero@yahoo.com',
   'he.ze.nib.e2.2@gmail.com',
   'elijahprincessjoy2019@gmail.com',
   'a.cet.r.a.d.er0.5.2@gmail.com'
 )
   and not exists (select 1 from auth.users u where u.id = p.id);

-- Permanently remove only orphan profiles that have no business, project,
-- payment, conversation, subscription or legal record. Delivery/notification
-- attempts associated with these empty profiles are disposable audit noise.
delete from public.profiles p
 where not exists (select 1 from auth.users u where u.id = p.id)
   and not exists (select 1 from public.banner_requests x where x.user_id = p.id)
   and not exists (select 1 from public.brand_briefs x where x.client_user_id = p.id)
   and not exists (select 1 from public.brand_identity_deliveries x where x.user_id = p.id)
   and not exists (select 1 from public.brand_marketer_commissions x where x.client_user_id = p.id)
   and not exists (select 1 from public.chat_messages x where x.sender_id = p.id)
   and not exists (select 1 from public.client_account_closures x where x.user_id = p.id)
   and not exists (select 1 from public.client_account_invites x where x.accepted_user_id = p.id)
   and not exists (select 1 from public.client_brand_assets x where x.user_id = p.id)
   and not exists (select 1 from public.client_deliveries x where x.client_user_id = p.id)
   and not exists (select 1 from public.client_payment_methods x where x.user_id = p.id)
   and not exists (select 1 from public.client_payment_setup_sessions x where x.user_id = p.id)
   and not exists (select 1 from public.clients x where x.platform_user_id = p.id)
   and not exists (select 1 from public.design_requests x where x.user_id = p.id)
   and not exists (select 1 from public.finance_invoices x where x.user_id = p.id)
   and not exists (select 1 from public.finance_projects x where x.user_id = p.id)
   and not exists (select 1 from public.finance_quotations x where x.user_id = p.id)
   and not exists (select 1 from public.invoice_payment_reminders x where x.client_user_id = p.id)
   and not exists (select 1 from public.invoice_payment_submissions x where x.user_id = p.id)
   and not exists (select 1 from public.meta_contacts x where x.client_id = p.id)
   and not exists (select 1 from public.project_documents x where x.client_user_id = p.id)
   and not exists (select 1 from public.subscriptions x where x.user_id = p.id)
   and not exists (select 1 from public.team_chat_client_participants x where x.client_user_id = p.id)
   and not exists (select 1 from public.team_chat_messages x where x.client_user_id = p.id)
   and not exists (select 1 from public.user_legal_agreements x where x.user_id = p.id)
   and not exists (select 1 from public.whatsapp_contacts x where x.client_id = p.id);

create index if not exists profiles_verified_active_idx
  on public.profiles (email_verified_at, account_status)
  where email_verified_at is not null and account_status = 'active';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Password accounts remain auth-only until the owner follows the email link.
  -- OAuth accounts arrive with email_confirmed_at already set and are created
  -- immediately because their provider has verified the address.
  if new.email is null or new.email_confirmed_at is null then
    update public.profiles
       set email_verified_at = null,
           updated_at = now()
     where id = new.id;
    return new;
  end if;

  insert into public.profiles
    (id, email, email_verified_at, full_name, avatar_url, company_name, phone_number)
  values (
    new.id,
    lower(btrim(new.email)),
    new.email_confirmed_at,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''),
    coalesce(new.raw_user_meta_data->>'company_name', ''),
    coalesce(new.raw_user_meta_data->>'phone_number', '')
  )
  on conflict (id) do update set
    email = excluded.email,
    email_verified_at = excluded.email_verified_at,
    full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
    avatar_url = coalesce(nullif(excluded.avatar_url, ''), public.profiles.avatar_url),
    company_name = coalesce(nullif(excluded.company_name, ''), public.profiles.company_name),
    phone_number = coalesce(nullif(excluded.phone_number, ''), public.profiles.phone_number),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_deleted_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set email_verified_at = null,
         account_status = case when account_status = 'active' then 'suspended' else account_status end,
         updated_at = now()
   where id = old.id;
  return old;
end;
$$;

drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function public.handle_deleted_auth_user();

commit;
