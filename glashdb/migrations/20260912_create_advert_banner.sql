create table if not exists public.create_advert_banner (
  id smallint primary key default 1 check (id = 1),
  image_url text,
  storage_path text,
  alt_text text not null default 'CDS Space Create promotion',
  target_url text,
  is_active boolean not null default false,
  image_width integer,
  image_height integer,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.create_advert_banner (id)
values (1)
on conflict (id) do nothing;

alter table public.create_advert_banner enable row level security;

revoke all on table public.create_advert_banner from anon, authenticated;
