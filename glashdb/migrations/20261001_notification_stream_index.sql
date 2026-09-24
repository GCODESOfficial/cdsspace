-- The live notification stream asks one question every couple of seconds: has
-- anything new arrived for this person? Client notices had no index for that
-- shape, so the check scanned the table once per connected tab.

begin;

create index if not exists notifications_user_recent_idx
  on public.notifications (user_id, created_at desc);

commit;
