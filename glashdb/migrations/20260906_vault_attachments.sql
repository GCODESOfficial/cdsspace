-- The document vault could only hold files uploaded into it. Most documents the
-- board wants to keep already exist somewhere: a cDoc, a protected document, a
-- legal document, or a file living on someone else's system behind a link.
--
-- A vault entry now records where its content comes from. An uploaded file keeps
-- its storage path; an attached document keeps a reference to the record it
-- points at; a link keeps the URL. Nothing is copied, so the vault entry stays
-- in step with the document it references.

begin;

alter table public.executive_vault_files
  add column if not exists source_kind text not null default 'upload',
  add column if not exists source_id uuid,
  add column if not exists link_url text;

-- Uploads are the only kind that own a stored file, so the storage columns stop
-- being mandatory for everything else.
alter table public.executive_vault_files alter column storage_path drop not null;
alter table public.executive_vault_files alter column file_name drop not null;

alter table public.executive_vault_files
  drop constraint if exists executive_vault_files_source_kind_check;
alter table public.executive_vault_files
  add constraint executive_vault_files_source_kind_check
  check (source_kind in ('upload', 'cdoc', 'protected_doc', 'legal_doc', 'link'));

-- Every kind has to carry the one thing that makes it resolvable.
alter table public.executive_vault_files
  drop constraint if exists executive_vault_files_source_target_check;
alter table public.executive_vault_files
  add constraint executive_vault_files_source_target_check
  check (
    (source_kind = 'upload' and storage_path is not null)
    or (source_kind = 'link' and link_url is not null)
    or (source_kind in ('cdoc', 'protected_doc', 'legal_doc') and source_id is not null)
  );

create index if not exists executive_vault_files_source_idx
  on public.executive_vault_files (source_kind, source_id);

comment on column public.executive_vault_files.source_kind is
  'Where the entry content lives: an uploaded file, a referenced document elsewhere in the app, or an external link.';
comment on column public.executive_vault_files.source_id is
  'Id of the referenced cDoc, protected document, or legal document.';

commit;
