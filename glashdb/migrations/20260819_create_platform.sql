create extension if not exists pgcrypto;

create table if not exists public.create_tools (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  short_description text not null default '',
  category text not null default 'Design',
  stage text not null default 'phase_1',
  status text not null default 'active' check (status in ('active', 'maintenance', 'disabled')),
  role_access text[] not null default array['client', 'team', 'admin']::text[],
  credit_cost integer not null default 1 check (credit_cost >= 0),
  requires_provider boolean not null default false,
  provider_key text,
  is_beta boolean not null default false,
  is_new boolean not null default false,
  is_featured boolean not null default false,
  supports_simple_mode boolean not null default true,
  supports_pro_mode boolean not null default false,
  input_schema jsonb not null default '{}'::jsonb,
  output_formats text[] not null default array[]::text[],
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.create_credit_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_kind text not null check (owner_kind in ('client', 'team', 'admin')),
  owner_id text not null,
  monthly_credit_limit integer not null default 50,
  credits_used integer not null default 0 check (credits_used >= 0),
  storage_limit_bytes bigint not null default 10737418240,
  storage_used_bytes bigint not null default 0 check (storage_used_bytes >= 0),
  reset_at timestamptz not null default (date_trunc('month', now()) + interval '1 month'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_kind, owner_id)
);

create table if not exists public.create_projects (
  id uuid primary key default gen_random_uuid(),
  owner_kind text not null check (owner_kind in ('client', 'team', 'admin')),
  owner_id text not null,
  name text not null,
  description text,
  color text not null default '#0A4FE8',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists idx_create_projects_owner on public.create_projects(owner_kind, owner_id, archived_at, updated_at desc);

create table if not exists public.create_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  description text not null default '',
  scope text not null default 'global' check (scope in ('global', 'client', 'team', 'admin', 'public')),
  client_id text,
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  preview_url text,
  locked_fields jsonb not null default '[]'::jsonb,
  editable_fields jsonb not null default '[]'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_create_templates_scope on public.create_templates(scope, status, category);

create table if not exists public.create_creations (
  id uuid primary key default gen_random_uuid(),
  owner_kind text not null check (owner_kind in ('client', 'team', 'admin')),
  owner_id text not null,
  actor_email text,
  tool_slug text not null,
  tool_name text not null,
  title text not null,
  status text not null default 'ready' check (status in ('draft', 'processing', 'ready', 'failed', 'provider_required')),
  project_id uuid references public.create_projects(id) on delete set null,
  input_summary jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  file_name text,
  file_size_bytes bigint,
  output_format text,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_create_creations_owner on public.create_creations(owner_kind, owner_id, deleted_at, updated_at desc);
create index if not exists idx_create_creations_project on public.create_creations(project_id, updated_at desc);

create table if not exists public.create_tool_favorites (
  owner_kind text not null check (owner_kind in ('client', 'team', 'admin')),
  owner_id text not null,
  tool_slug text not null,
  created_at timestamptz not null default now(),
  primary key(owner_kind, owner_id, tool_slug)
);

create table if not exists public.create_usage_events (
  id uuid primary key default gen_random_uuid(),
  owner_kind text not null check (owner_kind in ('client', 'team', 'admin')),
  owner_id text not null,
  actor_email text,
  tool_slug text not null,
  event_type text not null default 'generation',
  credits_used integer not null default 0,
  status text not null default 'ok',
  latency_ms integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_create_usage_events_owner on public.create_usage_events(owner_kind, owner_id, created_at desc);
create index if not exists idx_create_usage_events_tool on public.create_usage_events(tool_slug, created_at desc);

create or replace function public.touch_create_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_create_tools_updated_at on public.create_tools;
create trigger touch_create_tools_updated_at
before update on public.create_tools
for each row execute function public.touch_create_updated_at();

drop trigger if exists touch_create_credit_accounts_updated_at on public.create_credit_accounts;
create trigger touch_create_credit_accounts_updated_at
before update on public.create_credit_accounts
for each row execute function public.touch_create_updated_at();

drop trigger if exists touch_create_projects_updated_at on public.create_projects;
create trigger touch_create_projects_updated_at
before update on public.create_projects
for each row execute function public.touch_create_updated_at();

drop trigger if exists touch_create_templates_updated_at on public.create_templates;
create trigger touch_create_templates_updated_at
before update on public.create_templates
for each row execute function public.touch_create_updated_at();

drop trigger if exists touch_create_creations_updated_at on public.create_creations;
create trigger touch_create_creations_updated_at
before update on public.create_creations
for each row execute function public.touch_create_updated_at();

insert into public.create_tools
  (slug, name, short_description, category, stage, status, role_access, credit_cost, requires_provider, provider_key, is_beta, is_new, is_featured, supports_simple_mode, supports_pro_mode, output_formats)
values
  ('social-media-designer', 'Social media designer', 'Create professional campaign, announcement, event, and product posts using guided CDS Space templates.', 'Design', 'phase_1', 'active', array['client','team','admin']::text[], 2, false, null, false, true, true, true, true, array['PNG','JPG']::text[]),
  ('birthday-template', 'Birthday reusable template', 'Generate locked-structure birthday graphics with editable name, photo, role, date, and message fields.', 'Design', 'phase_1', 'active', array['client','team','admin']::text[], 1, false, null, false, true, true, true, false, array['PNG','JPG']::text[]),
  ('background-remover', 'Background remover', 'Remove image backgrounds, refine edges, and export transparent PNGs.', 'Image', 'phase_1', 'maintenance', array['client','team','admin']::text[], 1, true, 'BACKGROUND_REMOVAL_PROVIDER', true, false, true, true, true, array['PNG','JPG']::text[]),
  ('image-restorer', 'Image restorer', 'Improve poor-quality images with denoise, sharpen, upscale, and colour recovery options.', 'Image', 'phase_1', 'maintenance', array['client','team','admin']::text[], 3, true, 'IMAGE_RESTORATION_PROVIDER', true, false, false, true, true, array['PNG','JPG']::text[]),
  ('jpg-to-svg', 'JPG to SVG', 'Trace simple raster artwork into editable SVG paths with adjustable detail and smoothing.', 'Conversion', 'phase_1', 'active', array['client','team','admin']::text[], 2, false, null, true, false, false, true, true, array['SVG']::text[]),
  ('video-compressor', 'Professional video compressor', 'Reduce video file size with quality-focused presets for web, social, WhatsApp, and email.', 'Video', 'phase_1', 'maintenance', array['client','team','admin']::text[], 2, true, 'VIDEO_COMPRESSION_WORKER', true, false, true, true, true, array['MP4']::text[]),
  ('barcode-generator', 'Barcode generator', 'Generate QR codes, Code 39 labels, and downloadable barcode assets for packaging or campaigns.', 'Brand', 'phase_1', 'active', array['client','team','admin']::text[], 0, false, null, false, true, true, true, true, array['PNG','SVG','PDF']::text[]),
  ('mockup-generator', 'Mockup generator', 'Create branded product, packaging, signage, device, and environmental mockup previews.', 'Mockups', 'phase_1', 'active', array['client','team','admin']::text[], 2, false, null, true, true, true, true, true, array['PNG','JPG']::text[]),
  ('illustration-generator', 'Illustration generator', 'Generate professional illustrations from brand-aware creative prompts.', 'Design', 'phase_2', 'maintenance', array['team','admin']::text[], 5, true, 'IMAGE_GENERATION_PROVIDER', true, false, false, true, true, array['PNG']::text[]),
  ('vector-generator', 'Vector generator', 'Create SVG-style vector concepts from prompts or reference descriptions.', 'Design', 'phase_2', 'active', array['team','admin']::text[], 3, false, null, true, false, false, true, true, array['PNG','SVG']::text[]),
  ('clean-vector-tracer', 'Clean vector tracer', 'Produce simplified vector artwork for logos, icons, scanned files, and signage references.', 'Image', 'phase_2', 'maintenance', array['team','admin']::text[], 4, true, 'VECTOR_TRACE_PROVIDER', true, false, false, true, true, array['SVG']::text[]),
  ('logo-ideator', 'Professional logo ideator', 'Guide brand discovery and generate strategy-led logo directions, symbol ideas, and rationale.', 'Brand', 'phase_2', 'active', array['client','team','admin']::text[], 3, false, null, true, false, false, true, true, array['PDF','TXT']::text[]),
  ('brand-name-checker', 'Brand name checker', 'Run a preliminary naming review across internal rules, social fit, domains, and similarity signals.', 'Brand', 'phase_2', 'active', array['client','team','admin']::text[], 1, false, null, true, false, false, true, false, array['PDF','TXT']::text[]),
  ('logo-animation', 'Logo animation generator', 'Prepare reveal, fade, draw, morph, and motion presets for logo animation exports.', 'Video', 'phase_2', 'maintenance', array['team','admin']::text[], 8, true, 'LOGO_ANIMATION_WORKER', true, false, false, true, true, array['MP4','WebM','GIF']::text[]),
  ('figma-to-illustrator', 'Figma to Illustrator converter', 'Analyze Figma files, identify compatible vector layers, and export Illustrator-friendly fallbacks.', 'Conversion', 'phase_3', 'maintenance', array['team','admin']::text[], 6, true, 'FIGMA_CONVERSION_WORKER', true, false, false, true, true, array['AI','SVG','PDF']::text[])
on conflict (slug) do update set
  name = excluded.name,
  short_description = excluded.short_description,
  category = excluded.category,
  stage = excluded.stage,
  requires_provider = excluded.requires_provider,
  provider_key = excluded.provider_key,
  supports_simple_mode = excluded.supports_simple_mode,
  supports_pro_mode = excluded.supports_pro_mode,
  output_formats = excluded.output_formats;

insert into public.create_templates
  (name, category, description, scope, status, locked_fields, editable_fields, created_by)
values
  ('CDS Space birthday card', 'Employee birthday', 'Locked birthday graphic with editable portrait, name, role, date, and message.', 'global', 'published', '["layout","logo","background","typography"]'::jsonb, '["photo","name","position","date","message"]'::jsonb, 'system'),
  ('Corporate announcement post', 'Corporate', 'A clean announcement layout for company updates and internal notices.', 'global', 'published', '["grid","brand footer","spacing"]'::jsonb, '["headline","supporting copy","cta","image"]'::jsonb, 'system'),
  ('Product promotion post', 'Retail', 'Structured product highlight for offers, launches, and campaign posts.', 'global', 'published', '["price lockup","brand strip","safe area"]'::jsonb, '["product image","headline","offer","cta"]'::jsonb, 'system')
on conflict do nothing;
