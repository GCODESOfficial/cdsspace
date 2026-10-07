-- Sign in with Apple for clients (iPhone app, /api/mobile/v1/auth/apple).
--
-- Apple requires it next to Google sign-in on iOS (App Store guideline 4.8).
-- The Apple identity is recorded like Google's: provider 'apple', subject =
-- Apple's stable user ID ("sub"), email = the address Apple shares (which may
-- be a private @privaterelay.appleid.com relay).

begin;

alter table public.client_auth_identities
  drop constraint if exists client_auth_identities_provider_check;

alter table public.client_auth_identities
  add constraint client_auth_identities_provider_check
  check (provider in ('google', 'linkedin', 'apple'));

commit;
