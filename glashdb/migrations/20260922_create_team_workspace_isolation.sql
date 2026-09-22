-- Tie every team-owned CREATE record to a real, stable team_members.id.
-- The generated UUID is null for client/admin rows, so their existing
-- ownership rules remain unchanged.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'create_credit_accounts',
    'create_projects',
    'create_creations',
    'create_tool_favorites',
    'create_usage_events',
    'create_jobs',
    'create_letterheads'
  ] loop
    execute format(
      'alter table public.%I add column if not exists team_member_id uuid generated always as (case when owner_kind = ''team'' then owner_id::uuid else null end) stored',
      table_name
    );

    if not exists (
      select 1
        from pg_constraint
       where conrelid = format('public.%I', table_name)::regclass
         and conname = table_name || '_team_owner_fk'
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (team_member_id) references public.team_members(id) on delete cascade',
        table_name,
        table_name || '_team_owner_fk'
      );
    end if;
  end loop;
end
$$;
