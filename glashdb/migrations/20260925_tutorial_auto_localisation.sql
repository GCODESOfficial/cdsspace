-- A tutorial is uploaded once in its original language. Captions and the
-- remaining supported audio languages are generated privately in the
-- background and exposed only through authenticated media routes.
alter table public.dashboard_tutorials
  add column if not exists source_language_code text not null default 'en',
  add column if not exists processing_status text not null default 'ready',
  add column if not exists processing_error text,
  add column if not exists processing_started_at timestamptz,
  add column if not exists processed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'dashboard_tutorials_processing_status_check'
  ) then
    alter table public.dashboard_tutorials
      add constraint dashboard_tutorials_processing_status_check
      check (processing_status in ('queued', 'processing', 'ready', 'failed'));
  end if;
end
$$;

alter table public.dashboard_tutorial_media
  alter column video_path drop not null,
  alter column video_name drop not null,
  alter column video_mime drop not null,
  alter column video_size_bytes drop not null,
  add column if not exists is_original boolean not null default false,
  add column if not exists audio_path text,
  add column if not exists audio_name text,
  add column if not exists audio_mime text,
  add column if not exists audio_size_bytes bigint,
  add column if not exists generated_by text;

-- Preserve existing manually localised tutorials. One existing media record is
-- identified as the source; the remaining records continue using their own
-- complete video files exactly as before.
with ranked as (
  select id, tutorial_id, language_code,
         row_number() over (
           partition by tutorial_id
           order by case when language_code = 'en' then 0 else 1 end, created_at
         ) as position
  from public.dashboard_tutorial_media
)
update public.dashboard_tutorial_media media
set is_original = ranked.position = 1
from ranked
where media.id = ranked.id;

update public.dashboard_tutorials tutorial
set source_language_code = source.language_code
from public.dashboard_tutorial_media source
where source.tutorial_id = tutorial.id and source.is_original;

create unique index if not exists uq_dashboard_tutorial_original_media
  on public.dashboard_tutorial_media(tutorial_id)
  where is_original;

