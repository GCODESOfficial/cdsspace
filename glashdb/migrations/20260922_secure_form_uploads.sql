-- Private storage for consultation and application attachments. Files are
-- streamed only through permission-checked admin endpoints.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('secure-form-uploads', 'secure-form-uploads', false, 10485760, null)
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = null;

