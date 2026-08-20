-- Preserve attendance across manual checkout, automatic safety checkout, and
-- work-tracking heartbeats. Re-runnable and safe for existing timebook rows.

create or replace function public.sync_timebook_checkout_to_work_tracking()
returns trigger
language plpgsql
as $$
begin
  if new.clock_out_at is not null
     and old.clock_out_at is distinct from new.clock_out_at then
    update public.team_work_tracking_sessions
       set status = 'stopped',
           ended_at = greatest(new.clock_out_at, started_at),
           pause_reason = case
             when 'auto_clock_out' = any(coalesce(new.flags, '{}'::text[]))
               then 'attendance_auto_closed'
             else 'attendance_closed'
           end,
           updated_at = now()
     where team_member_id = new.team_member_id
       and work_date = new.work_date
       and status in ('active', 'paused');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_timebook_checkout_stops_tracking on public.team_time_entries;
create trigger trg_timebook_checkout_stops_tracking
  after update of clock_out_at on public.team_time_entries
  for each row execute function public.sync_timebook_checkout_to_work_tracking();

-- Close unfinished attendance from past Lagos dates while preserving the
-- original clock-in, completed sessions, worked minutes, and audit history.
with source as (
  select
    t.*,
    coalesce(t.session_started_at, t.clock_in_at) as active_session_start,
    (t.work_date + time '18:15') at time zone 'Africa/Lagos' as regular_cutoff,
    (t.work_date + time '23:55') at time zone 'Africa/Lagos' as night_cutoff,
    coalesce((
      select sum(coalesce((item ->> 'minutes')::integer, 0))
        from jsonb_array_elements(
          case when jsonb_typeof(t.sessions) = 'array' then t.sessions else '[]'::jsonb end
        ) as item
    ), 0)::integer as prior_minutes
  from public.team_time_entries t
  where t.clock_in_at is not null
    and t.clock_out_at is null
    and t.work_date < (now() at time zone 'Africa/Lagos')::date
), timed as (
  select
    source.*,
    greatest(
      active_session_start,
      case when active_session_start > regular_cutoff then night_cutoff else regular_cutoff end
    ) as automatic_checkout_at
  from source
), calculated as (
  select
    timed.*,
    greatest(0, round(extract(epoch from (
      automatic_checkout_at - active_session_start -
      case
        when break_start_at is not null and break_end_at is not null then
          greatest(
            interval '0 seconds',
            least(automatic_checkout_at, break_end_at) - greatest(active_session_start, break_start_at)
          )
        else
          greatest(
            interval '0 seconds',
            least(automatic_checkout_at, (work_date + time '14:00') at time zone 'Africa/Lagos')
              - greatest(active_session_start, (work_date + time '13:00') at time zone 'Africa/Lagos')
          )
      end
    )) / 60.0))::integer as active_session_minutes
  from timed
), scored as (
  select
    calculated.*,
    (prior_minutes + active_session_minutes)::integer as reconciled_total_minutes,
    greatest(0, round(extract(epoch from (
      automatic_checkout_at - ((work_date + time '18:00') at time zone 'Africa/Lagos')
    )) / 60.0))::integer as reconciled_overtime_minutes,
    case attendance_status
      when 'approved_leave' then 100
      when 'early' then 100
      when 'on_time' then 95
      when 'late' then 75
      when 'half_day' then 45
      else 0
    end as attendance_score,
    case attendance_status
      when 'early' then 100
      when 'on_time' then 100
      when 'late' then 70
      when 'half_day' then 45
      else 0
    end as punctuality_score
  from calculated
), final_values as (
  select
    scored.*,
    least(100, round(reconciled_total_minutes / 480.0 * 100))::integer as hours_score,
    least(100, reconciled_overtime_minutes / 60.0 * 10) as overtime_score
  from scored
)
update public.team_time_entries target
   set clock_out_at = value.automatic_checkout_at,
       sessions = coalesce(target.sessions, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
         'clock_in_at', value.active_session_start,
         'clock_out_at', value.automatic_checkout_at,
         'minutes', value.active_session_minutes
       )),
       current_status = 'offline',
       total_work_minutes = value.reconciled_total_minutes,
       overtime_minutes = value.reconciled_overtime_minutes,
       early_logout = false,
       flags = array(
         select distinct flag
           from unnest(coalesce(target.flags, '{}'::text[]) || array['auto_clock_out', 'reconciled_checkout']) as flag
       ),
       scores = jsonb_build_object(
         'attendance', value.attendance_score,
         'punctuality', value.punctuality_score,
         'work_hours', value.hours_score,
         'task_completion', null,
         'communication', null,
         'productivity', round(
           value.attendance_score * 0.4
           + value.punctuality_score * 0.25
           + value.hours_score * 0.25
           + value.overtime_score * 0.1
         )
       )
  from final_values value
 where target.id = value.id
   and target.clock_out_at is null;

insert into public.team_time_events
  (entry_id, team_member_id, event_type, work_date, from_status, to_status, flags, metadata)
select
  entry.id,
  entry.team_member_id,
  'clock_out',
  entry.work_date,
  null,
  'offline',
  entry.flags,
  jsonb_build_object(
    'source', 'timebook_reliability_reconciliation',
    'automatic', true,
    'attendance_preserved', true,
    'cutoff_at', entry.clock_out_at,
    'total_work_minutes', entry.total_work_minutes
  )
from public.team_time_entries entry
where 'reconciled_checkout' = any(coalesce(entry.flags, '{}'::text[]))
  and not exists (
    select 1
      from public.team_time_events event
     where event.entry_id = entry.id
       and event.event_type = 'clock_out'
       and event.metadata ->> 'source' = 'timebook_reliability_reconciliation'
  );

-- Reconcile stale tracking sessions that were left active after an existing
-- attendance checkout or have no matching active attendance row.
update public.team_work_tracking_sessions tracking
   set status = 'stopped',
       ended_at = greatest(attendance.clock_out_at, tracking.started_at),
       pause_reason = 'attendance_closed',
       updated_at = now()
  from public.team_time_entries attendance
 where tracking.team_member_id = attendance.team_member_id
   and tracking.work_date = attendance.work_date
   and tracking.status in ('active', 'paused')
   and attendance.clock_out_at is not null;

update public.team_work_tracking_sessions tracking
   set status = 'stopped',
       ended_at = greatest(
         tracking.started_at,
         least(now(), (tracking.work_date + time '23:55') at time zone 'Africa/Lagos')
       ),
       pause_reason = 'attendance_not_active',
       updated_at = now()
 where tracking.status in ('active', 'paused')
   and not exists (
     select 1
       from public.team_time_entries attendance
      where attendance.team_member_id = tracking.team_member_id
        and attendance.work_date = tracking.work_date
        and attendance.clock_in_at is not null
        and attendance.clock_out_at is null
   );

-- If an older race ever produced multiple live sessions, keep the newest one.
with ranked as (
  select id,
         row_number() over (
           partition by team_member_id, work_date
           order by started_at desc, created_at desc, id desc
         ) as position
    from public.team_work_tracking_sessions
   where status in ('active', 'paused')
)
update public.team_work_tracking_sessions tracking
   set status = 'stopped',
       ended_at = greatest(now(), tracking.started_at),
       pause_reason = 'duplicate_session_reconciled',
       updated_at = now()
  from ranked
 where tracking.id = ranked.id
   and ranked.position > 1;

create unique index if not exists uq_work_tracking_one_open_session_per_day
  on public.team_work_tracking_sessions (team_member_id, work_date)
  where status in ('active', 'paused');

comment on function public.sync_timebook_checkout_to_work_tracking() is
  'Stops attendance-linked work tracking whenever a timebook row is checked out, preserving a single consistent member state.';
