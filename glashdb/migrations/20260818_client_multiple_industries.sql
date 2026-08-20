begin;

alter table public.clients
  add column if not exists industries text[] not null default '{}'::text[];

update public.clients
   set industries = array[btrim(industry)]
 where cardinality(industries) = 0
   and nullif(btrim(industry), '') is not null;

create or replace function public.sync_client_industries()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  input_industries text[];
  normalized_industries text[];
begin
  -- A legacy writer that changes only `industry` is still supported. When the
  -- array is supplied, it is canonical and the first selection remains the
  -- legacy primary industry used by older pricing and finance workflows.
  if tg_op = 'UPDATE'
     and new.industry is distinct from old.industry
     and new.industries is not distinct from old.industries then
    input_industries := case
      when nullif(btrim(new.industry), '') is null then '{}'::text[]
      else array[btrim(new.industry)]
    end;
  else
    input_industries := coalesce(new.industries, '{}'::text[]);
    if cardinality(input_industries) = 0 and nullif(btrim(new.industry), '') is not null then
      input_industries := array[btrim(new.industry)];
    end if;
  end if;

  select coalesce(array_agg(cleaned order by first_position), '{}'::text[])
    into normalized_industries
    from (
      select btrim(value) as cleaned, min(position) as first_position
        from unnest(input_industries) with ordinality as selected(value, position)
       where nullif(btrim(value), '') is not null
       group by btrim(value)
    ) normalized;

  if cardinality(normalized_industries) > 12 then
    raise exception 'A client can have no more than 12 industries.';
  end if;

  new.industries := normalized_industries;
  new.industry := normalized_industries[1];
  return new;
end;
$$;

drop trigger if exists clients_sync_industries on public.clients;
create trigger clients_sync_industries
  before insert or update of industry, industries on public.clients
  for each row execute function public.sync_client_industries();

create index if not exists clients_industries_gin_idx
  on public.clients using gin (industries);

comment on column public.clients.industries is
  'All industries associated with the client. The first value is mirrored to industry for backward compatibility.';
comment on column public.clients.industry is
  'Backward-compatible primary industry. Prefer industries for client directory features.';

commit;
