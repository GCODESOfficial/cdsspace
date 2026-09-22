-- One token table, two jobs: proving an email address at sign-up, and
-- authorising a password reset. The purpose is part of the token so a sign-up
-- link can never be replayed to set someone's password, or the reverse.

begin;

alter table public.client_email_verifications
  add column if not exists purpose text not null default 'signup';

alter table public.client_email_verifications
  drop constraint if exists client_email_verifications_purpose_check;
alter table public.client_email_verifications
  add constraint client_email_verifications_purpose_check
  check (purpose in ('signup', 'password_reset'));

create index if not exists client_email_verifications_purpose_idx
  on public.client_email_verifications (purpose, user_id, created_at desc);

commit;
