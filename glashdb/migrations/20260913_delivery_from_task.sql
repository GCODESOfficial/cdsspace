-- A delivery could only be raised by routing a client order, so work that began
-- life as a taskboard task had nowhere to put its finished files. The team
-- ended up sending designs through chat, outside the review and approval the
-- delivery flow exists to provide.
--
-- A delivery can now point back at the task it came from. The client is still
-- optional and stays unset until an admin attaches one before sharing, which is
-- what lets a team open a draft for work that has no client yet.

begin;

alter table public.client_deliveries
  add column if not exists source_task_id uuid references public.task_board_tasks(id) on delete set null;

comment on column public.client_deliveries.source_task_id is
  'The taskboard task this delivery was raised from, when it did not come from a client order.';

-- One delivery per task. A second press of "Create delivery" must return the
-- existing draft rather than quietly opening a rival one that the first
-- uploader never sees.
create unique index if not exists client_deliveries_source_task_unique
  on public.client_deliveries (source_task_id)
  where source_task_id is not null;

commit;
