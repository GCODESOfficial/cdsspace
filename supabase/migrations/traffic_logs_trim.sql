-- Auto-cap public.traffic_logs at 200 rows.
--
-- A trigger runs after every insert, counts the current rows, and if the
-- total exceeds 200 deletes the oldest (created_at ASC, id ASC for deterministic
-- tie-breaking) until exactly 200 remain.
--
-- Runs inside the DB so it works regardless of which client inserted (anon or
-- service role) and regardless of RLS policies on the table. It also removes
-- the need for the app to do its own "count -> delete" dance after every
-- insert, which was fragile and blocked by RLS when using the anon key.
--
-- The function is `security definer` so it can delete rows even when the
-- invoking role (anon) would otherwise be denied by RLS.

create or replace function public.trim_traffic_logs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  max_rows constant int := 200;
  excess int;
begin
  select greatest(count(*) - max_rows, 0) into excess from public.traffic_logs;

  if excess > 0 then
    delete from public.traffic_logs
    where id in (
      select id
      from public.traffic_logs
      order by created_at asc, id asc
      limit excess
    );
  end if;

  return null;
end;
$$;

-- `after insert ... for each statement` — one trim per insert statement,
-- not per row. A single INSERT that adds 5 rows triggers exactly one trim
-- instead of five redundant ones.
drop trigger if exists trim_traffic_logs_trigger on public.traffic_logs;
create trigger trim_traffic_logs_trigger
    after insert on public.traffic_logs
    for each statement
    execute function public.trim_traffic_logs();

-- One-shot cleanup so the table is at ≤200 rows right after this migration
-- runs, without waiting for the next insert to trigger the trim.
do $$
declare
  excess int;
begin
  select greatest(count(*) - 200, 0) into excess from public.traffic_logs;
  if excess > 0 then
    delete from public.traffic_logs
    where id in (
      select id from public.traffic_logs
      order by created_at asc, id asc
      limit excess
    );
  end if;
end $$;
