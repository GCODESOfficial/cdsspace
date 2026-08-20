-- Per-item, per-platform social publish schedule (queue).
--
-- Powers the "Auto-schedule to connected channels" control on a content item:
-- pick one or more connected platforms + a time; the content-autopublish cron
-- fires each due row via the normal publish path (logged in content_publications).
-- Kept separate from content_items.scheduled_at (the editorial calendar) so
-- scheduling a social post never disturbs the content workflow status.
create table if not exists public.content_social_schedules (
  id            uuid primary key default gen_random_uuid(),
  content_id    uuid not null references public.content_items(id) on delete cascade,
  platform      text not null
                  check (platform in ('linkedin','facebook','instagram','tiktok','x')),
  scheduled_for timestamptz not null,
  status        text not null default 'pending'
                  check (status in ('pending','published','failed','canceled')),
  publication_id uuid,          -- the content_publications row created when it fired
  error         text,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- At most one pending schedule per content item + platform.
create unique index if not exists content_social_schedules_pending_unique
  on public.content_social_schedules (content_id, platform)
  where status = 'pending';

create index if not exists content_social_schedules_due_idx
  on public.content_social_schedules (scheduled_for)
  where status = 'pending';
