-- Sign in with Apple for the iPhone app (App Store rule: an app offering a
-- third-party login such as LinkedIn must also offer Sign in with Apple).
-- Apple identities are stored and connected exactly like Google and LinkedIn.

begin;

do $$
declare constraint_name text;
begin
  for constraint_name in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.client_auth_identities'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%provider%'
  loop
    execute format('alter table public.client_auth_identities drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.client_auth_identities
  add constraint client_auth_identities_provider_check
  check (provider in ('google', 'linkedin', 'apple'));

commit;
