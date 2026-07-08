-- ============================================
-- CDS Space: Brand Briefs - public token flow
-- Idempotent. Run in Supabase SQL editor.
-- ============================================

create extension if not exists "pgcrypto";

create table if not exists public.brand_briefs (
  id uuid primary key default gen_random_uuid(),
  public_token text unique not null,

  -- Admin sets this when requesting a brief so the client sees a name on arrival.
  invite_label text,
  invite_note text,

  -- Form fields (all nullable until submission)
  brand_name text,
  brand_tagline text,
  industry text,
  brand_description text,

  contact_name text,
  contact_email text,
  contact_phone text,

  target_audience text,
  competitors text,
  unique_selling_point text,

  brand_personality text,
  brand_values text,
  design_preferences text,
  inspiration_references text,

  -- Stored as a text[] so we can display check-box selections cleanly.
  assets_needed text[] not null default '{}',

  goals text,
  long_term_vision text,
  budget_range text,
  timeline text,
  additional_notes text,

  status text not null default 'pending' check (status in ('pending','submitted','archived')),
  submitted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_brand_briefs_token on public.brand_briefs(public_token);
create index if not exists idx_brand_briefs_status on public.brand_briefs(status);

-- RLS: enable with a permissive policy - the app uses the service-role key
-- server-side for admin ops and the anon key only through API routes we control.
alter table public.brand_briefs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'brand_briefs' and policyname = 'brand_briefs_all') then
    create policy brand_briefs_all on public.brand_briefs for all using (true) with check (true);
  end if;
end $$;

-- updated_at trigger
create or replace function public.touch_brand_briefs_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_brand_briefs_touch on public.brand_briefs;
create trigger trg_brand_briefs_touch
  before update on public.brand_briefs
  for each row execute function public.touch_brand_briefs_updated_at();
