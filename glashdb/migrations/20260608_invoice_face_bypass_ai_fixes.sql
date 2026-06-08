-- CDS Space GlashDB fixes: invoice terms, face review evidence, reusable bypass codes.
-- Idempotent and safe to rerun.

alter table public.finance_invoices
  add column if not exists payment_terms text not null default '100% Upfront Payment. Payment is not Refundable',
  add column if not exists revisions_note text not null default 'Designs are subject to Free 2 Revisions',
  add column if not exists working_hours text not null default '9am-5:30pm Monday-Friday UTC+1',
  add column if not exists delivery_speed text not null default 'standard',
  add column if not exists delivery_period text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'finance_invoices_delivery_speed_check'
       and conrelid = 'public.finance_invoices'::regclass
  ) then
    alter table public.finance_invoices
      add constraint finance_invoices_delivery_speed_check
      check (delivery_speed in ('standard','express','super_express','flash'));
  end if;
end $$;

alter table public.team_face_profiles
  add column if not exists enrollment_image_data text,
  add column if not exists latest_capture_image_data text,
  add column if not exists latest_capture_at timestamptz,
  add column if not exists latest_match_score numeric(8,5),
  add column if not exists latest_liveness_score numeric(8,5),
  add column if not exists latest_verification_event_id uuid references public.team_face_verification_events(id) on delete set null,
  add column if not exists latest_verification_flag text,
  add column if not exists reset_requested_at timestamptz,
  add column if not exists reset_requested_by text;

alter table public.team_face_verification_events
  add column if not exists neutral_image_data text,
  add column if not exists challenge_images jsonb not null default '[]'::jsonb,
  add column if not exists flagged boolean not null default false,
  add column if not exists review_status text not null default 'clear',
  add column if not exists review_note text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'team_face_events_review_status_check'
       and conrelid = 'public.team_face_verification_events'::regclass
  ) then
    alter table public.team_face_verification_events
      add constraint team_face_events_review_status_check
      check (review_status in ('clear','flagged','reviewed','reset_requested'));
  end if;
end $$;

create index if not exists idx_team_face_events_flagged_created
  on public.team_face_verification_events (flagged, created_at desc);

create index if not exists idx_team_face_profiles_flag
  on public.team_face_profiles (latest_verification_flag);

-- Existing codes that were burned after one use should become reusable again
-- when they are still within their original expiration window.
update public.team_geofence_bypass_codes
   set status = 'active'
 where status = 'used'
   and expires_at > now();

comment on column public.team_face_profiles.enrollment_image_data is
  'Compressed data URL of the first approved face capture for admin review.';
comment on column public.team_face_profiles.latest_capture_image_data is
  'Compressed data URL of the latest login capture for admin review.';
comment on column public.team_face_verification_events.neutral_image_data is
  'Compressed data URL submitted for the neutral face frame.';
comment on column public.team_face_verification_events.challenge_images is
  'Compressed challenge/liveness captures; trimmed by client before upload.';
