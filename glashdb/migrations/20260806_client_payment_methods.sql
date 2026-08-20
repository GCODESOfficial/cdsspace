-- Client payment methods prepared through Paystack hosted checkout.
-- Raw card numbers and CVVs are never stored by CDS Space.

create table if not exists public.client_payment_setup_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'paystack' check (provider in ('paystack')),
  purpose text not null default 'card_setup' check (purpose in ('card_setup')),
  reference text not null unique,
  payment_email text not null,
  amount integer not null check (amount >= 0),
  currency text not null,
  status text not null default 'pending' check (status in ('pending', 'successful', 'failed', 'expired')),
  provider_response jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (now() + interval '2 hours'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'paystack' check (provider in ('paystack')),
  authorization_code text not null,
  authorization_signature text,
  customer_code text,
  payment_email text not null,
  channel text not null default 'card',
  card_type text,
  card_brand text,
  last4 text,
  exp_month text,
  exp_year text,
  bank text,
  country_code text,
  reusable boolean not null default false,
  is_default boolean not null default true,
  is_active boolean not null default true,
  paystack_reference text,
  authorization_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index if not exists idx_client_payment_setup_sessions_user
  on public.client_payment_setup_sessions (user_id, created_at desc);
create index if not exists idx_client_payment_setup_sessions_reference
  on public.client_payment_setup_sessions (reference);
create index if not exists idx_client_payment_methods_user_active
  on public.client_payment_methods (user_id, is_active);

alter table public.client_payment_setup_sessions enable row level security;
alter table public.client_payment_methods enable row level security;

-- These tables deliberately have no browser-facing RLS policies. Server
-- routes return only masked fields and keep authorization codes private.

comment on table public.client_payment_methods is
  'Server-only reusable Paystack authorizations and masked payment method metadata.';
comment on column public.client_payment_methods.authorization_code is
  'Sensitive provider token. Never return this column to a browser.';
