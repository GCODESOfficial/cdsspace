-- Content Hub role/permission sync for Visual Library.
--
-- Adds reusable role bundles for the new photo/video handoff workflow and
-- upgrades existing content-creation/studio grants so the image/video creator
-- can pick from Visual Library without role admins manually revisiting everyone.
-- Idempotent; apply manually in the GlashDB SQL editor.

create extension if not exists "pgcrypto";

create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  permissions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_roles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_roles'
      and policyname = 'admin_roles_all'
  ) then
    create policy admin_roles_all on public.admin_roles
    for all
    using (true)
    with check (true);
  end if;
end $$;

insert into public.admin_roles (name, description, permissions)
values
  (
    'Content Hub Manager',
    'Full Content Hub access: plan, create, manage Visual Library, approve, schedule, publish, use BSD Studio, AI, and settings.',
    array[
      'content_hub.view',
      'content_hub.create',
      'content_hub.visual_library',
      'content_hub.ai',
      'content_hub.calendar',
      'content_hub.approve',
      'content_hub.schedule',
      'content_hub.publish',
      'content_hub.studio',
      'content_hub.settings'
    ]::text[]
  ),
  (
    'Content Creator',
    'Create posts with AI and generate from approved Visual Library photos/videos.',
    array[
      'content_hub.view',
      'content_hub.create',
      'content_hub.visual_library',
      'content_hub.ai'
    ]::text[]
  ),
  (
    'Visual Producer',
    'Upload, organize, archive, and mark Visual Library photos/videos for content creators.',
    array[
      'content_hub.view',
      'content_hub.visual_library'
    ]::text[]
  ),
  (
    'Social Media Publisher',
    'View approved packages, manage the content calendar, schedule posts, and mark content as published.',
    array[
      'content_hub.view',
      'content_hub.calendar',
      'content_hub.schedule',
      'content_hub.publish'
    ]::text[]
  )
on conflict (name) do update
set
  description = excluded.description,
  permissions = (
    select array(
      select distinct p
      from unnest(public.admin_roles.permissions || excluded.permissions) as p
      order by p
    )
  ),
  updated_at = now();

-- Existing creators/studio users now need the Visual Library picker/upload
-- surface that replaced direct source upload in Generate From Image/Video.
update public.admin_roles
set
  permissions = (
    select array(
      select distinct p
      from unnest(permissions || array['content_hub.visual_library']::text[]) as p
      order by p
    )
  ),
  updated_at = now()
where (
    'content_hub.create' = any(permissions)
    or 'content_hub.studio' = any(permissions)
  )
  and not ('content_hub.visual_library' = any(permissions));

-- Direct sub-admin/team-member permission overrides can exist independently of
-- reusable roles, so keep them compatible too.
do $$
begin
  if to_regclass('public.sub_admins') is not null then
    update public.sub_admins
    set permissions = (
      select array(
        select distinct p
        from unnest(permissions || array['content_hub.visual_library']::text[]) as p
        order by p
      )
    )
    where (
        'content_hub.create' = any(permissions)
        or 'content_hub.studio' = any(permissions)
      )
      and not ('content_hub.visual_library' = any(permissions));
  end if;

  if to_regclass('public.team_members') is not null then
    update public.team_members
    set
      permissions = (
        select array(
          select distinct p
          from unnest(permissions || array['content_hub.visual_library']::text[]) as p
          order by p
        )
      ),
      updated_at = now()
    where is_sub_admin = true
      and (
        'content_hub.create' = any(permissions)
        or 'content_hub.studio' = any(permissions)
      )
      and not ('content_hub.visual_library' = any(permissions));
  end if;
end $$;
