-- PDF-first Intelligence publishing and external attribution.
-- Safe to rerun.

alter table if exists public.blog_authors
  add column if not exists role text,
  add column if not exists expertise text[] not null default '{}',
  add column if not exists contributor_type text not null default 'author',
  add column if not exists is_active boolean not null default true,
  add column if not exists is_external boolean not null default false,
  add column if not exists organization text,
  add column if not exists profile_url text;

alter table if exists public.blog_posts
  add column if not exists original_source_url text;

create index if not exists blog_authors_external_idx
  on public.blog_authors (is_external, is_active);
