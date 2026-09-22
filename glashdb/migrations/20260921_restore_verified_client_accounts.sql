begin;

-- Restore client profiles only when control of the same email is still proven
-- by a live confirmed auth user or by a previously linked, verified OAuth
-- identity. A syntactically plausible address alone is not account ownership.
with eligible as (
  select p.id
    from public.profiles p
   where p.account_status in ('closed', 'suspended')
     and p.email_verified_at is not null
     and lower(btrim(p.email)) <> 'johnemediong22@gmail.com'
     and (
       exists (
         select 1
           from auth.users u
          where u.id = p.id
            and u.deleted_at is null
            and u.email_confirmed_at is not null
            and lower(btrim(u.email)) = lower(btrim(p.email))
            and (u.banned_until is null or u.banned_until <= now())
       )
       or exists (
         select 1
           from public.client_auth_identities identity
          where identity.client_user_id = p.id
            and identity.provider_email_verified = true
            and lower(btrim(identity.provider_email)) = lower(btrim(p.email))
       )
     )
), restored as (
  update public.profiles p
     set account_status = 'active',
         closed_at = null,
         closure_reason = null,
         closure_requested_email = null,
         updated_at = now()
    from eligible
   where p.id = eligible.id
  returning p.id
)
update public.client_account_closures closure
   set reopened_at = coalesce(closure.reopened_at, now()),
       metadata = closure.metadata || jsonb_build_object(
         'restored', true,
         'restored_reason', 'verified_email_identity_recovery'
       )
 where closure.user_id in (select id from restored)
   and closure.reopened_at is null;

commit;
