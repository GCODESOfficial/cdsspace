-- Bind every client CREATE row to an existing, stable profiles.id and prevent
-- cross-workspace project/job relationships at the database boundary.

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
      'alter table public.%I add column if not exists client_user_id uuid generated always as (case when owner_kind = ''client'' then owner_id::uuid else null end) stored',
      table_name
    );

    if not exists (
      select 1 from pg_constraint
       where conrelid = format('public.%I', table_name)::regclass
         and conname = table_name || '_client_owner_fk'
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (client_user_id) references public.profiles(id) on delete cascade',
        table_name,
        table_name || '_client_owner_fk'
      );
    end if;

    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end
$$;

-- Client-specific templates are workspace records too.
alter table public.create_templates
  add column if not exists client_user_id uuid generated always as (
    case when scope = 'client' then client_id::uuid else null end
  ) stored;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.create_templates'::regclass
       and conname = 'create_templates_client_owner_fk'
  ) then
    alter table public.create_templates
      add constraint create_templates_client_owner_fk
      foreign key (client_user_id) references public.profiles(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.create_projects'::regclass
       and conname = 'create_projects_workspace_identity_key'
  ) then
    alter table public.create_projects
      add constraint create_projects_workspace_identity_key unique (id, owner_kind, owner_id);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.create_creations'::regclass
       and conname = 'create_creations_project_workspace_fk'
  ) then
    alter table public.create_creations
      add constraint create_creations_project_workspace_fk
      foreign key (project_id, owner_kind, owner_id)
      references public.create_projects(id, owner_kind, owner_id);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.create_creations'::regclass
       and conname = 'create_creations_workspace_identity_key'
  ) then
    alter table public.create_creations
      add constraint create_creations_workspace_identity_key unique (id, owner_kind, owner_id);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.create_jobs'::regclass
       and conname = 'create_jobs_creation_workspace_fk'
  ) then
    alter table public.create_jobs
      add constraint create_jobs_creation_workspace_fk
      foreign key (creation_id, owner_kind, owner_id)
      references public.create_creations(id, owner_kind, owner_id);
  end if;
end
$$;

alter table public.create_templates enable row level security;
alter table public.create_tools enable row level security;
alter table public.create_engines enable row level security;
alter table public.create_engine_routes enable row level security;
alter table public.create_engine_cache enable row level security;
alter table public.create_training_samples enable row level security;

-- CREATE is accessed only through server routes authenticated by the durable
-- first-party CDS Space session. Direct browser database roles get no access.
do $$
declare
  role_name text;
  table_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      foreach table_name in array array[
        'create_credit_accounts', 'create_projects', 'create_creations',
        'create_tool_favorites', 'create_usage_events', 'create_jobs',
        'create_letterheads', 'create_templates', 'create_tools',
        'create_engines', 'create_engine_routes', 'create_engine_cache',
        'create_training_samples'
      ] loop
        execute format('revoke all on table public.%I from %I', table_name, role_name);
      end loop;
    end if;
  end loop;
end
$$;

insert into storage.buckets (id, name, public)
values ('create-private-assets', 'create-private-assets', false)
on conflict (id) do update set public = false;
