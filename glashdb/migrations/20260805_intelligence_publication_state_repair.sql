begin;

-- A publication restored from Deleted can have a live status while retaining
-- its soft-delete tombstone. Public library queries correctly hide tombstoned
-- rows, so repair existing state before enforcing the invariant.
update public.blog_posts
set deleted_at = null,
    deleted_by = null,
    updated_at = now()
where status <> 'deleted'
  and deleted_at is not null;

update public.blog_posts
set deleted_at = coalesce(deleted_at, updated_at, now())
where status = 'deleted'
  and deleted_at is null;

create or replace function public.sync_blog_post_deleted_state()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'deleted' then
    new.deleted_at := coalesce(new.deleted_at, now());
  else
    new.deleted_at := null;
    new.deleted_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists blog_posts_sync_deleted_state on public.blog_posts;
create trigger blog_posts_sync_deleted_state
before insert or update of status, deleted_at on public.blog_posts
for each row execute function public.sync_blog_post_deleted_state();

alter table public.blog_posts
  drop constraint if exists blog_posts_deleted_state_check;

alter table public.blog_posts
  add constraint blog_posts_deleted_state_check
  check ((status = 'deleted') = (deleted_at is not null));

commit;
