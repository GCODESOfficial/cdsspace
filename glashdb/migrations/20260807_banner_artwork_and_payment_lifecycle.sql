-- Banner artwork storage and payment-gated production lifecycle.
-- Submitted catalogue orders wait for payment; only a paid linked invoice moves
-- the banner into the production pending queue.

alter type public.banner_status add value if not exists 'AWAITING_QUOTE' before 'PENDING';
alter type public.banner_status add value if not exists 'AWAITING_PAYMENT' before 'PENDING';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('banners', 'banners', false, 20971520, null)
on conflict (id) do update
set file_size_limit = greatest(coalesce(storage.buckets.file_size_limit, 0), excluded.file_size_limit),
    public = false;

drop policy if exists "Clients can upload own banner artwork" on storage.objects;
create policy "Clients can upload own banner artwork"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'banners'
    and (storage.foldername(name))[1] = auth.uid()::text
    and lower(name) ~ '\.(png|jpe?g|pdf|ai|fig|svg)$'
  );

drop policy if exists "Clients can read own banner artwork" on storage.objects;
create policy "Clients can read own banner artwork"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'banners'
    and (storage.foldername(name))[1] = auth.uid()::text
    and lower(name) ~ '\.(png|jpe?g|pdf|ai|fig|svg)$'
  );

drop policy if exists "Clients can update own banner artwork" on storage.objects;
create policy "Clients can update own banner artwork"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'banners'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'banners'
    and (storage.foldername(name))[1] = auth.uid()::text
    and lower(name) ~ '\.(png|jpe?g|pdf|ai|fig|svg)$'
  );

drop policy if exists "Clients can delete own banner artwork" on storage.objects;
create policy "Clients can delete own banner artwork"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'banners'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create or replace function public.queue_paid_banner_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status::text = 'paid' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update public.banner_requests
       set status = 'PENDING',
           updated_at = now()
     where invoice_id = new.id
       and status::text = 'AWAITING_PAYMENT';
  end if;
  return new;
end;
$$;

drop trigger if exists finance_invoice_queue_paid_banner on public.finance_invoices;
create trigger finance_invoice_queue_paid_banner
after insert or update of status on public.finance_invoices
for each row execute function public.queue_paid_banner_order();

comment on function public.queue_paid_banner_order() is
  'Moves a linked banner from awaiting payment to pending production only after its invoice is marked paid.';
