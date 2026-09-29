-- Letterhead line spacing, and the price of asking CDS Space to design one.
--
-- line_spacing multiplies the body leading in the PDF engine, so a letter can
-- be opened out or tightened without touching the artwork. 1.00 is the old
-- fixed leading, and the default keeps existing documents looking the same.
--
-- letterhead_design_pricing holds one row of per-currency prices for the
-- "request a letterhead design" button. Naira and Rwandan francs are set
-- directly because they are local-market prices; the rest are the USD price
-- carried across at the standing rates, and every one stays editable in
-- Sales Settings.

alter table public.create_letterheads
  add column if not exists line_spacing numeric(4,2) not null default 1.00;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'create_letterheads_line_spacing_check'
  ) then
    alter table public.create_letterheads
      add constraint create_letterheads_line_spacing_check
      check (line_spacing between 1.00 and 3.00);
  end if;
end $$;

comment on column public.create_letterheads.line_spacing is
  'Body leading multiplier for the PDF: 1.00 is single spacing, 1.50 is one-and-a-half, 2.00 is double.';

create table if not exists public.letterhead_design_pricing (
  id boolean primary key default true check (id),
  price_ngn numeric(14,2) not null default 15000,
  price_usd numeric(14,2) not null default 25,
  price_rwf numeric(14,2) not null default 20000,
  price_gbp numeric(14,2) not null default 19.75,
  price_eur numeric(14,2) not null default 23,
  price_cny numeric(14,2) not null default 180,
  price_aed numeric(14,2) not null default 91.75,
  updated_by text,
  updated_at timestamptz not null default now()
);

insert into public.letterhead_design_pricing (id) values (true)
on conflict (id) do nothing;

alter table public.letterhead_design_pricing enable row level security;

comment on table public.letterhead_design_pricing is
  'Single row: what a CDS Space letterhead design costs in each billing currency. Edited in Sales Settings.';
