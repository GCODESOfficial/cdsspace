-- CDS Space GlashDB storage bucket repair.
-- Idempotent and non-destructive: creates missing bucket metadata only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('applications', 'applications', true, 10485760, null),
  ('consultation-uploads', 'consultation-uploads', true, 10485760, null),
  ('ai-training-docs', 'ai-training-docs', false, 10485760, array[
    'text/plain',
    'text/markdown',
    'application/json',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]),
  ('bank-statements', 'bank-statements', false, 10485760, array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]),
  ('media', 'media', true, null, null),
  ('portfolio-designs', 'portfolio-designs', true, 10485760, array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]::text[]),
  ('team-avatars', 'team-avatars', true, 5242880, array[
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]),
  ('team-documents', 'team-documents', true, 20971520, null),
  ('team-signatures', 'team-signatures', true, 5242880, array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml'
  ]::text[]),
  ('testimonials', 'testimonials', true, 5242880, array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]::text[]),
  ('work-tracking-screenshots', 'work-tracking-screenshots', false, 5242880, array[
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = coalesce(storage.buckets.file_size_limit, excluded.file_size_limit),
  allowed_mime_types = coalesce(storage.buckets.allowed_mime_types, excluded.allowed_mime_types),
  updated_at = now();

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'applications_public_read'
  ) then
    create policy applications_public_read
      on storage.objects
      for select
      to public
      using (bucket_id = 'applications');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'consultation_uploads_public_read'
  ) then
    create policy consultation_uploads_public_read
      on storage.objects
      for select
      to public
      using (bucket_id = 'consultation-uploads');
  end if;
end $$;
