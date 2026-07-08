-- CDS Space Blog System - content publishing & thought leadership.
-- Public blog (landing + posts) + admin Blog Manager. Authors, posts with
-- status/scheduling/SEO, and logged-in like/dislike engagement.

create extension if not exists "pgcrypto";

-- ─────────────── Authors ───────────────
create table if not exists public.blog_authors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  photo_url text,
  position text,
  bio text,
  social_links jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────── Posts ───────────────
create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  subtitle text,
  excerpt text,
  cover_url text,
  category text not null default 'Branding',
  tags text[] not null default '{}',
  content text not null default '',          -- rich HTML from the editor
  series text,                               -- optional series name (Phase 2 pages)
  seo_title text,
  seo_description text,
  author_id uuid references public.blog_authors(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft','scheduled','published','hidden','archived','deleted')),
  published_at timestamptz,
  reading_time integer not null default 1,   -- minutes
  views integer not null default 0,
  likes_count integer not null default 0,
  dislikes_count integer not null default 0,
  sharing_enabled boolean not null default true,
  reactions_enabled boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blog_posts_status_idx on public.blog_posts (status);
create index if not exists blog_posts_category_idx on public.blog_posts (category);
create index if not exists blog_posts_published_idx on public.blog_posts (published_at desc);
create index if not exists blog_posts_tags_idx on public.blog_posts using gin (tags);

-- ─────────────── Engagement (logged-in like / dislike) ───────────────
create table if not exists public.blog_post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  user_id uuid not null,
  value smallint not null check (value in (1, -1)),   -- 1 = like, -1 = dislike
  created_at timestamptz not null default now(),
  constraint blog_post_reactions_unique unique (post_id, user_id)
);

create index if not exists blog_post_reactions_post_idx on public.blog_post_reactions (post_id);
