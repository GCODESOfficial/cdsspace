alter table public.create_letterheads
  add column if not exists bottom_margin text not null default 'wide'
    check (bottom_margin in ('wide', 'small')),
  add column if not exists stamp_path text,
  add column if not exists stamp_name text,
  add column if not exists stamp_size_bytes bigint not null default 0
    check (stamp_size_bytes >= 0),
  add column if not exists stamp_x numeric(6,3) not null default 62.000
    check (stamp_x between 0 and 100),
  add column if not exists stamp_y numeric(6,3) not null default 68.000
    check (stamp_y between 0 and 100),
  add column if not exists stamp_width numeric(6,3) not null default 20.000
    check (stamp_width between 5 and 80),
  add column if not exists stamp_page text not null default 'last'
    check (stamp_page in ('first', 'last'));

comment on column public.create_letterheads.bottom_margin is
  'Wide protects deep stationery footers; small permits document text closer to the bottom edge.';

comment on column public.create_letterheads.stamp_path is
  'Private storage path for the optional document stamp image.';
