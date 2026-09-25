create extension if not exists pgcrypto;

create table if not exists public.create_letterhead_signatures (
  id uuid primary key default gen_random_uuid(),
  letterhead_id uuid not null references public.create_letterheads(id) on delete cascade,
  source text not null default 'upload' check (source in ('upload', 'invitation')),
  signer_name text,
  signer_email text,
  access_token uuid unique default gen_random_uuid(),
  status text not null default 'ready' check (status in ('ready', 'pending', 'opened', 'signed', 'declined')),
  storage_path text,
  storage_name text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  signature_x numeric(6,3) not null default 54.000 check (signature_x between 0 and 100),
  signature_y numeric(6,3) not null default 72.000 check (signature_y between 0 and 100),
  signature_width numeric(6,3) not null default 22.000 check (signature_width between 5 and 80),
  signature_page text not null default 'last' check (signature_page in ('first', 'last')),
  opened_at timestamptz,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status in ('ready', 'signed') and storage_path is not null)
    or (status in ('pending', 'opened', 'declined') and source = 'invitation')
  )
);

create index if not exists idx_create_letterhead_signatures_document
  on public.create_letterhead_signatures(letterhead_id, created_at);

create index if not exists idx_create_letterhead_signatures_pending
  on public.create_letterhead_signatures(letterhead_id, status)
  where status in ('pending', 'opened');

do $$
begin
  if exists (select 1 from pg_proc where proname = 'touch_create_updated_at') then
    drop trigger if exists touch_create_letterhead_signatures_updated_at on public.create_letterhead_signatures;
    create trigger touch_create_letterhead_signatures_updated_at
      before update on public.create_letterhead_signatures
      for each row execute function public.touch_create_updated_at();
  end if;
end
$$;

alter table public.create_letterhead_signatures enable row level security;
revoke all on public.create_letterhead_signatures from anon, authenticated;

comment on table public.create_letterhead_signatures is
  'Additional uploaded and invited signatures placed on a private Create Studio letterhead.';
