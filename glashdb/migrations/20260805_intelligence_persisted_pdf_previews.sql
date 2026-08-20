-- Persist the PDF's first page before a publication can go live.
-- Safe to rerun.

alter table if exists public.blog_posts
  add column if not exists pdf_preview_url text;

