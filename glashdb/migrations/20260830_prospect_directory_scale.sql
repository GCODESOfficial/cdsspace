-- Scales prospect generation from a 12,000-row research list to a worldwide
-- directory targeting 10,000,000 companies.
--
-- Three things change:
--  1. Identity. A company is one row, keyed on domain when we have one and on a
--     normalised legal name when we do not, so repeated imports of overlapping
--     lists never create a second row for the same business.
--  2. Country presence. A company registered or trading in several countries
--     keeps one row and gains a row per country in prospect_company_countries,
--     with country_count on the parent so the UI can say "available in 6
--     countries" instead of listing the company six times.
--  3. Filter columns and counters. count(*) over ten million rows is too slow for
--     a dashboard, so bucket counters are maintained by trigger.

begin;

-- 1. Identity ---------------------------------------------------------------

-- unaccent is a contrib extension that is not installed everywhere, so accents
-- are folded with an explicit table instead. Both arguments to translate must be
-- the same length, and they are.
create or replace function public.unaccent_basic(value text)
returns text
language sql
immutable
as $$
  select translate(coalesce(value, ''), 'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿĀāĂăĄąĆćĈĉĊċČčĎďĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĨĩĪīĬĭĮįİĴĵĶķĹĺĻļĽľŃńŅņŇňŌōŎŏŐőŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽžƠơƯưǍǎǏǐǑǒǓǔǕǖǗǘǙǚǛǜǞǟǠǡǦǧǨǩǪǫǬǭǰǴǵǸǹǺǻȀȁȂȃȄȅȆȇȈȉȊȋȌȍȎȏȐȑȒȓȔȕȖȗȘșȚțȞȟȦȧȨȩȪȫȬȭȮȯȰȱȲȳ', 'AAAAAACEEEEIIIINOOOOOUUUUYaaaaaaceeeeiiiinooooouuuuyyAaAaAaCcCcCcCcDdEeEeEeEeEeGgGgGgGgHhIiIiIiIiIJjKkLlLlLlNnNnNnOoOoOoRrRrRrSsSsSsSsTtTtUuUuUuUuUuUuWwYyYZzZzZzOoUuAaIiOoUuUuUuUuUuAaAaGgKkOoOojGgNnAaAaAaEeEeIiIiOoOoRrRrUuUuSsTtHhAaEeOoOoOoOoYy');
$$;

-- Normalises a company name for matching: a trailing branch or location
-- qualifier is dropped, then lowercase, accents folded, legal suffixes and
-- punctuation removed. "Acme Foods Ltd." and "ACME Foods Limited" both reduce to
-- "acme foods", and "GTBank (Enugu - Ogui Road)" reduces to "gtbank".
create or replace function public.prospect_name_key(value text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(public.unaccent_basic(regexp_replace(coalesce(value, ''), '\s*[([][^)\]]*[)\]]\s*$', ''))),
          '\y(incorporated|corporation|company|limited|holdings?|group|international|worldwide|global|enterprises?|ventures?|industries|partners|associates|inc|corp|co|ltd|llc|llp|lp|plc|pte|pty|gmbh|ag|nv|bv|sa|sas|srl|spa|ab|as|oy|aps|kk|kft|sdn|bhd|jsc|ooo|pjsc|fzco|fze|fzc|dmcc|wll)\y',
          ' ', 'g'),
        '[^[:alnum:] ]', ' ', 'g'),
      '\s+', ' ', 'g')),
    '');
$$;

alter table public.prospect_companies
  add column if not exists legal_name text,
  add column if not exists name_key text,
  add column if not exists registration_id text,
  add column if not exists hq_country text,
  add column if not exists country_count integer not null default 0,
  add column if not exists employee_count integer,
  add column if not exists size_band text,
  add column if not exists revenue_band text,
  add column if not exists is_public boolean,
  add column if not exists stock_exchanges jsonb not null default '[]'::jsonb,
  add column if not exists ticker text,
  add column if not exists is_startup boolean,
  add column if not exists source_url text;

alter table public.prospect_companies
  drop constraint if exists prospect_companies_size_band_check;
alter table public.prospect_companies
  add constraint prospect_companies_size_band_check
  check (size_band is null or size_band in ('solo', 'micro', 'small', 'medium', 'large', 'enterprise'));

update public.prospect_companies
  set name_key = public.prospect_name_key(company_name)
  where name_key is null;

-- Any duplicates that predate this migration are collapsed onto the oldest row
-- so the unique indexes below can be created safely.
with ranked as (
  select id, row_number() over (partition by name_key order by created_at, id) rank
  from public.prospect_companies where domain is null and name_key is not null
)
delete from public.prospect_companies
where id in (select id from ranked where rank > 1 and id not in (select id from public.prospect_companies where review_status = 'promoted'));

-- Identity keys. A domain is the strongest signal; a normalised name is the
-- fallback for the many directory rows that carry no website at all.
drop index if exists public.prospect_companies_name_key;
create unique index if not exists prospect_companies_domain_unique
  on public.prospect_companies (domain) where domain is not null;
create unique index if not exists prospect_companies_name_key_unique
  on public.prospect_companies (name_key) where domain is null and name_key is not null;
create index if not exists prospect_companies_name_key_idx
  on public.prospect_companies (name_key);

-- Alternate names seen for the same company across different source lists.
create table if not exists public.prospect_company_aliases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.prospect_companies(id) on delete cascade,
  alias text not null,
  name_key text not null,
  source_url text,
  created_at timestamptz not null default now()
);
create unique index if not exists prospect_company_aliases_unique
  on public.prospect_company_aliases (company_id, name_key);
create index if not exists prospect_company_aliases_key_idx
  on public.prospect_company_aliases (name_key);

-- 2. Country presence -------------------------------------------------------

create table if not exists public.prospect_company_countries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.prospect_companies(id) on delete cascade,
  country text not null,
  registration_id text,
  is_headquarters boolean not null default false,
  source_url text,
  created_at timestamptz not null default now()
);
create unique index if not exists prospect_company_countries_unique
  on public.prospect_company_countries (company_id, lower(country));
create index if not exists prospect_company_countries_country_idx
  on public.prospect_company_countries (lower(country), company_id);

-- country_count is denormalised onto the company so list queries and the
-- "available in N countries" label never need a join or a subquery.
create or replace function public.prospect_sync_country_count()
returns trigger
language plpgsql
as $$
declare
  target uuid := coalesce(new.company_id, old.company_id);
begin
  update public.prospect_companies
    set country_count = (select count(*) from public.prospect_company_countries where company_id = target),
        hq_country = coalesce(
          (select country from public.prospect_company_countries where company_id = target and is_headquarters order by created_at limit 1),
          (select country from public.prospect_company_countries where company_id = target order by created_at limit 1)),
        updated_at = now()
    where id = target;
  return null;
end;
$$;

drop trigger if exists prospect_company_countries_sync on public.prospect_company_countries;
create trigger prospect_company_countries_sync
  after insert or update or delete on public.prospect_company_countries
  for each row execute function public.prospect_sync_country_count();

-- Existing single-country rows become the first presence record.
insert into public.prospect_company_countries (company_id, country, is_headquarters)
select id, country, true from public.prospect_companies
where country is not null and trim(country) <> ''
on conflict do nothing;

-- 3. Filters and counters ---------------------------------------------------

create index if not exists prospect_companies_alpha_idx
  on public.prospect_companies (name_key);
create index if not exists prospect_companies_industry_idx
  on public.prospect_companies (lower(industry), deal_score desc);
create index if not exists prospect_companies_size_idx
  on public.prospect_companies (size_band, employee_count desc);
create index if not exists prospect_companies_public_idx
  on public.prospect_companies (is_public, deal_score desc);
create index if not exists prospect_companies_startup_idx
  on public.prospect_companies (is_startup, founded_year desc);
create index if not exists prospect_companies_founded_idx
  on public.prospect_companies (founded_year);
create index if not exists prospect_companies_country_count_idx
  on public.prospect_companies (country_count desc);
create index if not exists prospect_companies_hq_idx
  on public.prospect_companies (lower(hq_country), deal_score desc);

-- Bucket counters. A dashboard over ten million rows cannot run count(*) per
-- panel, so every status transition adjusts a small counter table instead.
create table if not exists public.prospect_directory_counters (
  bucket text primary key,
  value bigint not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function public.prospect_bump_counter(bucket_key text, delta bigint)
returns void
language sql
as $$
  insert into public.prospect_directory_counters (bucket, value, updated_at)
  values (bucket_key, delta, now())
  on conflict (bucket) do update
    set value = public.prospect_directory_counters.value + excluded.value, updated_at = now();
$$;

create or replace function public.prospect_track_counters()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    perform public.prospect_bump_counter('total', 1);
    perform public.prospect_bump_counter('enrichment:' || new.enrichment_status, 1);
    perform public.prospect_bump_counter('activity:' || new.activity_status, 1);
    perform public.prospect_bump_counter('website:' || new.website_status, 1);
    perform public.prospect_bump_counter('review:' || new.review_status, 1);
    perform public.prospect_bump_counter('priority:' || new.priority, 1);
  elsif tg_op = 'DELETE' then
    perform public.prospect_bump_counter('total', -1);
    perform public.prospect_bump_counter('enrichment:' || old.enrichment_status, -1);
    perform public.prospect_bump_counter('activity:' || old.activity_status, -1);
    perform public.prospect_bump_counter('website:' || old.website_status, -1);
    perform public.prospect_bump_counter('review:' || old.review_status, -1);
    perform public.prospect_bump_counter('priority:' || old.priority, -1);
  else
    if new.enrichment_status is distinct from old.enrichment_status then
      perform public.prospect_bump_counter('enrichment:' || old.enrichment_status, -1);
      perform public.prospect_bump_counter('enrichment:' || new.enrichment_status, 1);
    end if;
    if new.activity_status is distinct from old.activity_status then
      perform public.prospect_bump_counter('activity:' || old.activity_status, -1);
      perform public.prospect_bump_counter('activity:' || new.activity_status, 1);
    end if;
    if new.website_status is distinct from old.website_status then
      perform public.prospect_bump_counter('website:' || old.website_status, -1);
      perform public.prospect_bump_counter('website:' || new.website_status, 1);
    end if;
    if new.review_status is distinct from old.review_status then
      perform public.prospect_bump_counter('review:' || old.review_status, -1);
      perform public.prospect_bump_counter('review:' || new.review_status, 1);
    end if;
    if new.priority is distinct from old.priority then
      perform public.prospect_bump_counter('priority:' || old.priority, -1);
      perform public.prospect_bump_counter('priority:' || new.priority, 1);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists prospect_companies_counters on public.prospect_companies;
create trigger prospect_companies_counters
  after insert or update or delete on public.prospect_companies
  for each row execute function public.prospect_track_counters();

-- Seed the counters from whatever is already stored.
truncate table public.prospect_directory_counters;
insert into public.prospect_directory_counters (bucket, value)
select 'total', count(*) from public.prospect_companies
union all select 'enrichment:' || enrichment_status, count(*) from public.prospect_companies group by enrichment_status
union all select 'activity:' || activity_status, count(*) from public.prospect_companies group by activity_status
union all select 'website:' || website_status, count(*) from public.prospect_companies group by website_status
union all select 'review:' || review_status, count(*) from public.prospect_companies group by review_status
union all select 'priority:' || priority, count(*) from public.prospect_companies group by priority;

alter table public.prospect_company_countries enable row level security;
alter table public.prospect_company_aliases enable row level security;
alter table public.prospect_directory_counters enable row level security;

comment on table public.prospect_company_countries is
  'Countries a company is registered or trading in. One company row, many country rows.';
comment on table public.prospect_company_aliases is
  'Alternate names seen for the same company across source lists, used for deduplication.';
comment on table public.prospect_directory_counters is
  'Trigger-maintained bucket counts so the dashboard never runs count(*) over the full directory.';

commit;
