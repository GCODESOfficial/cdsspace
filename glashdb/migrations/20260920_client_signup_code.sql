-- Email/password sign-up now proves the address with a six-digit code typed
-- into the sign-up page, sent from CDS Space's own mailer. The emailed link is
-- kept as a fallback and shares the same row, so using either spends both.
-- Google and LinkedIn accounts are provider-verified and never get a code.

begin;

alter table public.client_email_verifications
  -- SHA-256 of user id, address and code. The code itself is only in the email.
  add column if not exists code_hash text,
  -- Wrong guesses against this code. Five ends it; a new code must be sent.
  add column if not exists attempts integer not null default 0;

create index if not exists client_email_verifications_pending_email_idx
  on public.client_email_verifications (lower(email), created_at desc)
  where used_at is null and purpose = 'signup';

commit;
