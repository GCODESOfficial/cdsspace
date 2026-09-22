begin;

-- Pre-aggregated directory facets keep the prospect-generation overview fast
-- when the directory contains millions of rows. The existing status counters
-- already avoid full table counts; these rows do the same for country and
-- industry filters.
create table if not exists public.prospect_directory_facets (
  facet text not null,
  facet_key text not null,
  label text not null,
  company_count bigint not null default 0 check (company_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (facet, facet_key)
);

create or replace function public.prospect_bump_facet(
  facet_name text,
  raw_key text,
  display_label text,
  delta bigint
)
returns void
language plpgsql
as $$
declare
  normalized_key text := lower(trim(coalesce(raw_key, '')));
begin
  if normalized_key = '' or delta = 0 then
    return;
  end if;

  insert into public.prospect_directory_facets (facet, facet_key, label, company_count, updated_at)
  values (facet_name, normalized_key, trim(display_label), greatest(delta, 0), now())
  on conflict (facet, facet_key) do update
    set company_count = greatest(public.prospect_directory_facets.company_count + delta, 0),
        label = case when trim(display_label) <> '' then trim(display_label) else public.prospect_directory_facets.label end,
        updated_at = now();

  delete from public.prospect_directory_facets
   where facet = facet_name and facet_key = normalized_key and company_count = 0;
end;
$$;

create or replace function public.prospect_track_company_facets()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    perform public.prospect_bump_facet('industry', new.industry, new.industry, 1);
    if coalesce(new.country_count, 0) > 1 then
      perform public.prospect_bump_counter('multi_country', 1);
    end if;
  elsif tg_op = 'DELETE' then
    perform public.prospect_bump_facet('industry', old.industry, old.industry, -1);
    if coalesce(old.country_count, 0) > 1 then
      perform public.prospect_bump_counter('multi_country', -1);
    end if;
  else
    if lower(trim(coalesce(new.industry, ''))) is distinct from lower(trim(coalesce(old.industry, ''))) then
      perform public.prospect_bump_facet('industry', old.industry, old.industry, -1);
      perform public.prospect_bump_facet('industry', new.industry, new.industry, 1);
    end if;
    if (coalesce(new.country_count, 0) > 1) is distinct from (coalesce(old.country_count, 0) > 1) then
      perform public.prospect_bump_counter('multi_country', case when coalesce(new.country_count, 0) > 1 then 1 else -1 end);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists prospect_companies_facets on public.prospect_companies;
create trigger prospect_companies_facets
  after insert or update of industry, country_count or delete on public.prospect_companies
  for each row execute function public.prospect_track_company_facets();

create or replace function public.prospect_track_country_facets()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    perform public.prospect_bump_facet('country', new.country, new.country, 1);
  elsif tg_op = 'DELETE' then
    perform public.prospect_bump_facet('country', old.country, old.country, -1);
  elsif lower(trim(coalesce(new.country, ''))) is distinct from lower(trim(coalesce(old.country, ''))) then
    perform public.prospect_bump_facet('country', old.country, old.country, -1);
    perform public.prospect_bump_facet('country', new.country, new.country, 1);
  end if;
  return null;
end;
$$;

drop trigger if exists prospect_company_countries_facets on public.prospect_company_countries;
create trigger prospect_company_countries_facets
  after insert or update of country or delete on public.prospect_company_countries
  for each row execute function public.prospect_track_country_facets();

-- Reachability is a distinct-company measure. This small membership table
-- makes additions, removals and email changes update the counter exactly once
-- per company rather than recounting every contact on every page load.
create table if not exists public.prospect_reachable_companies (
  company_id uuid primary key references public.prospect_companies(id) on delete cascade,
  updated_at timestamptz not null default now()
);

create or replace function public.prospect_refresh_reachable_company(target_company_id uuid)
returns void
language plpgsql
as $$
declare
  changed_rows integer;
begin
  if target_company_id is null then
    return;
  end if;

  if exists (
    select 1 from public.prospect_company_contacts
     where company_id = target_company_id
       and seniority = 'decision_maker'
       and email is not null
       and trim(email) <> ''
  ) then
    insert into public.prospect_reachable_companies (company_id, updated_at)
    values (target_company_id, now())
    on conflict (company_id) do nothing;
    get diagnostics changed_rows = row_count;
    if changed_rows > 0 then
      perform public.prospect_bump_counter('reachable_decision_makers', 1);
    end if;
  else
    delete from public.prospect_reachable_companies where company_id = target_company_id;
    get diagnostics changed_rows = row_count;
    if changed_rows > 0 then
      perform public.prospect_bump_counter('reachable_decision_makers', -1);
    end if;
  end if;
end;
$$;

create or replace function public.prospect_track_reachable_companies()
returns trigger
language plpgsql
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.prospect_refresh_reachable_company(old.company_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.company_id is distinct from old.company_id) then
    perform public.prospect_refresh_reachable_company(new.company_id);
  elsif tg_op = 'INSERT' then
    perform public.prospect_refresh_reachable_company(new.company_id);
  end if;
  return null;
end;
$$;

drop trigger if exists prospect_contacts_reachability on public.prospect_company_contacts;
create trigger prospect_contacts_reachability
  after insert or update of company_id, seniority, email or delete on public.prospect_company_contacts
  for each row execute function public.prospect_track_reachable_companies();

truncate table public.prospect_directory_facets;
insert into public.prospect_directory_facets (facet, facet_key, label, company_count)
select 'country', lower(trim(country)), min(trim(country)), count(distinct company_id)
  from public.prospect_company_countries
 where trim(coalesce(country, '')) <> ''
 group by lower(trim(country));

insert into public.prospect_directory_facets (facet, facet_key, label, company_count)
select 'industry', lower(trim(industry)), min(trim(industry)), count(*)
  from public.prospect_companies
 where trim(coalesce(industry, '')) <> ''
 group by lower(trim(industry));

insert into public.prospect_directory_counters (bucket, value, updated_at)
select 'multi_country', count(*)::bigint, now()
  from public.prospect_companies where country_count > 1
on conflict (bucket) do update set value = excluded.value, updated_at = excluded.updated_at;

truncate table public.prospect_reachable_companies;
insert into public.prospect_reachable_companies (company_id)
select distinct company_id
  from public.prospect_company_contacts
 where seniority = 'decision_maker' and email is not null and trim(email) <> '';

insert into public.prospect_directory_counters (bucket, value, updated_at)
select 'reachable_decision_makers', count(*)::bigint, now()
  from public.prospect_reachable_companies
on conflict (bucket) do update set value = excluded.value, updated_at = excluded.updated_at;

alter table public.prospect_directory_facets enable row level security;
alter table public.prospect_reachable_companies enable row level security;

comment on table public.prospect_directory_facets is
  'Trigger-maintained country and industry counts for the prospect directory overview.';
comment on table public.prospect_reachable_companies is
  'Companies with at least one publicly reachable decision-maker contact.';

commit;
