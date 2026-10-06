-- A brand can have several owners (founder and co-founders). Each owner holds
-- their own brand identity copy for the project, so uniqueness moves from the
-- project to the (project, owner) pair.

alter table public.brand_identity_deliveries
  drop constraint if exists brand_identity_deliveries_one_per_project;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'brand_identity_deliveries_one_per_project_owner'
  ) then
    alter table public.brand_identity_deliveries
      add constraint brand_identity_deliveries_one_per_project_owner unique (project_id, user_id);
  end if;
end $$;
