-- ============================================
-- CDS Space: Consultation / Book a Session requests
-- Run this in your Supabase SQL Editor
-- ============================================

create extension if not exists "pgcrypto";

create table if not exists public.consultation_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  company text,
  budget_range text,
  message text,
  how_heard text,
  file_urls text[] default '{}',
  status text not null default 'new'
    check (status in ('new','reviewing','scheduled','completed','archived')),
  notes text,
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_consultation_requests_status on public.consultation_requests(status);
create index if not exists idx_consultation_requests_created_at on public.consultation_requests(created_at desc);

-- updated_at trigger
create or replace function public.consultation_requests_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists consultation_requests_updated_at_trigger on public.consultation_requests;
create trigger consultation_requests_updated_at_trigger
  before update on public.consultation_requests
  for each row execute function public.consultation_requests_set_updated_at();

-- RLS: anyone can insert (public form), anyone authenticated can read/update
alter table public.consultation_requests enable row level security;

drop policy if exists "Allow public insert on consultation_requests" on public.consultation_requests;
create policy "Allow public insert on consultation_requests"
  on public.consultation_requests for insert with check (true);

drop policy if exists "Allow read on consultation_requests" on public.consultation_requests;
create policy "Allow read on consultation_requests"
  on public.consultation_requests for select using (true);

drop policy if exists "Allow update on consultation_requests" on public.consultation_requests;
create policy "Allow update on consultation_requests"
  on public.consultation_requests for update using (true) with check (true);

drop policy if exists "Allow delete on consultation_requests" on public.consultation_requests;
create policy "Allow delete on consultation_requests"
  on public.consultation_requests for delete using (true);

-- Storage bucket for consultation file uploads (briefs, assets)
insert into storage.buckets (id, name, public)
values ('consultation-uploads', 'consultation-uploads', true)
on conflict (id) do nothing;

drop policy if exists "Allow public upload to consultation-uploads" on storage.objects;
create policy "Allow public upload to consultation-uploads"
  on storage.objects for insert with check (bucket_id = 'consultation-uploads');

drop policy if exists "Allow public read on consultation-uploads" on storage.objects;
create policy "Allow public read on consultation-uploads"
  on storage.objects for select using (bucket_id = 'consultation-uploads');
