-- Connect subscription design orders to the private production and delivery workflow.

create extension if not exists pgcrypto;

alter table public.design_requests
  add column if not exists subscription_id uuid references public.subscriptions(id) on delete set null,
  add column if not exists quota_period_start date,
  add column if not exists submitted_at timestamptz,
  add column if not exists workflow_type text,
  add column if not exists workflow_status text not null default 'new',
  add column if not exists team_title text,
  add column if not exists team_brief text,
  add column if not exists task_id uuid references public.task_board_tasks(id) on delete set null,
  add column if not exists project_id uuid references public.finance_projects(id) on delete set null,
  add column if not exists delivery_id uuid references public.client_deliveries(id) on delete set null,
  add column if not exists routed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'design_requests_workflow_type_check'
      and conrelid = 'public.design_requests'::regclass
  ) then
    alter table public.design_requests
      add constraint design_requests_workflow_type_check
      check (workflow_type is null or workflow_type in ('taskboard', 'project'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'design_requests_workflow_status_check'
      and conrelid = 'public.design_requests'::regclass
  ) then
    alter table public.design_requests
      add constraint design_requests_workflow_status_check
      check (workflow_status in ('new', 'assigned', 'in_progress', 'internal_review', 'revision_requested', 'approved', 'published'));
  end if;
end $$;

create index if not exists idx_design_requests_subscription_period
  on public.design_requests(subscription_id, quota_period_start);
create index if not exists idx_design_requests_workflow
  on public.design_requests(workflow_status, updated_at desc);

alter table public.finance_projects
  add column if not exists source_design_request_id uuid references public.design_requests(id) on delete set null;
create unique index if not exists uq_finance_projects_design_request
  on public.finance_projects(source_design_request_id)
  where source_design_request_id is not null;

-- Existing project assignment writers already use this conflict target, but
-- older databases did not receive its supporting unique index.
create unique index if not exists uq_project_assignments_member
  on public.project_assignments(project_id, team_member_id)
  where team_member_id is not null;

alter table public.client_deliveries
  add column if not exists source_design_request_id uuid references public.design_requests(id) on delete set null;
create unique index if not exists uq_client_deliveries_design_request
  on public.client_deliveries(source_design_request_id)
  where source_design_request_id is not null;

create table if not exists public.design_request_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '',
  description text not null default '',
  category text not null default 'carousel',
  asset_paths text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

alter table public.design_request_drafts enable row level security;
grant select, insert, update, delete on public.design_request_drafts to service_role;

create or replace function public.submit_design_request_order(
  p_user_id uuid,
  p_title text,
  p_description text,
  p_category text,
  p_asset_paths text[] default array[]::text[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.subscriptions%rowtype;
  v_request public.design_requests%rowtype;
  v_period date := date_trunc('month', now() at time zone 'Africa/Lagos')::date;
  v_limit integer;
  v_used integer;
  v_sequence integer;
begin
  if length(trim(coalesce(p_title, ''))) < 2 then
    raise exception using errcode = '22023', message = 'Add a clear title for the design request.';
  end if;
  if length(trim(coalesce(p_description, ''))) < 10 then
    raise exception using errcode = '22023', message = 'Add enough detail for the design team to begin.';
  end if;
  if coalesce(array_length(p_asset_paths, 1), 0) > 5 then
    raise exception using errcode = '22023', message = 'A design request can include up to five reference assets.';
  end if;

  select * into v_subscription
    from public.subscriptions
   where user_id = p_user_id and status = 'active'
   order by activated_at desc nulls last, created_at desc
   limit 1
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'An active design subscription is required.';
  end if;

  v_limit := case lower(coalesce(v_subscription.plan, ''))
    when 'startup' then 5
    when 'scaleup' then 10
    when 'supreme' then greatest(coalesce(v_subscription.design_quantity, 1), 1)
    else greatest(coalesce(v_subscription.design_quantity, 1), 1)
  end;

  if v_subscription.last_reset_at is null
     or (v_subscription.last_reset_at at time zone 'Africa/Lagos')::date < v_period then
    update public.subscriptions
       set design_count = 0, last_reset_at = now(), updated_at = now()
     where id = v_subscription.id;
    v_used := 0;
  else
    select greatest(
      coalesce(v_subscription.design_count, 0),
      count(*)::integer
    ) into v_used
      from public.design_requests
     where subscription_id = v_subscription.id
       and quota_period_start = v_period;
  end if;

  if v_used >= v_limit then
    raise exception using errcode = 'P0001', message = format('This plan has used all %s design requests for the current month.', v_limit);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select count(*)::integer + 1 into v_sequence
    from public.design_requests where user_id = p_user_id;

  insert into public.design_requests (
    user_id, subscription_id, quota_period_start, title, description,
    category, asset_paths, status, display_id, submitted_at
  ) values (
    p_user_id, v_subscription.id, v_period, trim(p_title), trim(p_description),
    left(coalesce(nullif(trim(p_category), ''), 'other'), 60), coalesce(p_asset_paths, array[]::text[]),
    'PENDING', 'REQ-' || lpad(v_sequence::text, 3, '0'), now()
  ) returning * into v_request;

  update public.subscriptions
     set design_count = v_used + 1, last_reset_at = now(), updated_at = now()
   where id = v_subscription.id;
  delete from public.design_request_drafts where user_id = p_user_id;

  return jsonb_build_object(
    'request', to_jsonb(v_request),
    'usage', jsonb_build_object('used', v_used + 1, 'limit', v_limit, 'period_start', v_period)
  );
end $$;

revoke all on function public.submit_design_request_order(uuid,text,text,text,text[]) from public, anon, authenticated;
grant execute on function public.submit_design_request_order(uuid,text,text,text,text[]) to service_role;

create or replace function public.release_design_request_order(p_user_id uuid, p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.design_requests%rowtype;
begin
  select * into v_request
    from public.design_requests
   where id = p_request_id and user_id = p_user_id
   for update;
  if not found then return false; end if;
  if v_request.task_id is not null or v_request.project_id is not null or v_request.delivery_id is not null then
    raise exception using errcode = 'P0001', message = 'This order has entered production and can no longer be deleted.';
  end if;
  if v_request.status not in ('PENDING', 'IN_REVIEW') then
    raise exception using errcode = 'P0001', message = 'This order can no longer be deleted.';
  end if;

  delete from public.design_requests where id = v_request.id;
  if v_request.subscription_id is not null
     and v_request.quota_period_start = date_trunc('month', now() at time zone 'Africa/Lagos')::date then
    update public.subscriptions
       set design_count = greatest(coalesce(design_count, 0) - 1, 0), updated_at = now()
     where id = v_request.subscription_id;
  end if;
  return true;
end $$;

revoke all on function public.release_design_request_order(uuid,uuid) from public, anon, authenticated;
grant execute on function public.release_design_request_order(uuid,uuid) to service_role;

create or replace function public.sync_design_request_delivery_state()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.source_design_request_id is null then return new; end if;
  update public.design_requests
     set delivery_id = new.id,
         workflow_status = case new.status
           when 'submitted' then 'internal_review'
           when 'revision_requested' then 'revision_requested'
           when 'published' then 'published'
           else workflow_status
         end,
         status = case when new.status = 'published' then 'COMPLETED'::public.design_request_status else status end,
         updated_at = now()
   where id = new.source_design_request_id;
  return new;
end $$;

drop trigger if exists trg_sync_design_request_delivery_state on public.client_deliveries;
create trigger trg_sync_design_request_delivery_state
  after insert or update of status on public.client_deliveries
  for each row execute function public.sync_design_request_delivery_state();
