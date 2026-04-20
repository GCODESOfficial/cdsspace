-- Legal documents (privacy policy, terms of service) editable from the admin portal.
--
-- Content is stored as HTML so the admin can edit via a textarea, a WYSIWYG editor,
-- or by round-tripping through .docx (uploaded via /api/admin/legal/[slug]/upload).
--
-- Only two rows are expected in practice: slug = 'privacy' and slug = 'terms'.
-- Additional slugs (e.g. 'cookies', 'dpa') can be added later without schema changes.

create table if not exists public.legal_documents (
    id              uuid primary key default gen_random_uuid(),
    slug            text not null unique,
    title           text not null,
    subtitle        text,
    content         text not null default '',
    effective_date  date not null default current_date,
    version         integer not null default 1,
    updated_at      timestamptz not null default now(),
    updated_by      text
);

create index if not exists legal_documents_slug_idx on public.legal_documents (slug);

-- Lock down direct client access. All reads/writes go through server routes that
-- use the service role key (admin APIs) or the anon key with RLS that permits SELECT
-- of a published document.
alter table public.legal_documents enable row level security;

-- Public (anon) users can read documents — the privacy/terms pages fetch them.
drop policy if exists "legal_documents_public_read" on public.legal_documents;
create policy "legal_documents_public_read"
    on public.legal_documents
    for select
    using (true);

-- No direct insert/update/delete from anon/auth users. Admin routes use the
-- service role key, which bypasses RLS.
