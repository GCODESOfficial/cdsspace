-- 20260803_translation_memory.sql
-- Translation memory cache. Every string we translate (via the self-hosted
-- LibreTranslate engine) is stored so repeat requests are instant - this is
-- what makes the translator feel "super fast" after the first pass.

create table if not exists public.translation_memory (
  id bigserial primary key,
  source_lang text not null default 'en',
  target_lang text not null,
  text_hash text not null,
  source_text text not null,
  translated_text text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_translation_memory
  on public.translation_memory (target_lang, text_hash);
