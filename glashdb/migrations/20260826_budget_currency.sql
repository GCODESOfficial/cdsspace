-- Budget currency selection on brand briefs.
--
-- A budget range is now only offered once the client picks a currency, using
-- the same seven currencies offered during client onboarding (see
-- src/lib/client-billing.ts). Storing the code alongside the range keeps an
-- older answer such as "Under $500" readable when the label lists change.

alter table public.brand_briefs
  add column if not exists budget_currency text;
