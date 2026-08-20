-- CREATE multi-engine ("4 brains") layer.
-- Routes each tool/capability to an engine (internal | creattie | magnific | openai),
-- with per-engine daily spend caps, a result cache (so identical work never bills
-- twice), and a training-sample store used to make the Internal brain self-sufficient.

create table if not exists public.create_engines (
  key                 text primary key,            -- internal | creattie | magnific | openai
  label               text not null,
  enabled             boolean not null default true,
  daily_budget_cents  integer not null default 0,  -- 0 = uncapped (free/internal); >0 hard-caps paid engines
  spent_today_cents   integer not null default 0,
  spend_date          date not null default current_date,
  cost_per_call_cents integer not null default 0,   -- estimate used for budget accounting
  license_attested    boolean not null default false, -- admin confirms redistribution rights (Creattie)
  config              jsonb not null default '{}'::jsonb,
  updated_at          timestamptz not null default now()
);

create table if not exists public.create_engine_routes (
  tool_slug        text not null,
  capability       text not null default 'default',
  primary_engine   text not null,
  fallback_engines text[] not null default '{}',
  updated_at       timestamptz not null default now(),
  primary key (tool_slug, capability)
);

-- Result cache: identical (engine, tool, normalised input) never re-bills a paid engine.
create table if not exists public.create_engine_cache (
  cache_key       text primary key,   -- sha256(engine + tool + canonical input)
  engine          text not null,
  tool_slug       text not null,
  output          jsonb not null,
  file_name       text,
  output_format   text,
  file_size_bytes bigint,
  hits            integer not null default 0,
  created_at      timestamptz not null default now(),
  last_hit_at     timestamptz
);
create index if not exists create_engine_cache_tool_idx on public.create_engine_cache (tool_slug, engine);

-- Training samples for the Internal brain (fine-tune on our own first-party outputs).
create table if not exists public.create_training_samples (
  id          uuid primary key default gen_random_uuid(),
  engine      text not null default 'internal',
  capability  text not null,              -- illustration | vector | animation | upscale | restore | ...
  label       text,
  prompt      text,
  asset_ref   text,                       -- reference asset (storage ref or data URL, capped)
  source      text not null default 'manual', -- manual | harvested (from our own successful runs)
  tags        text[] not null default '{}',
  status      text not null default 'ready', -- ready | queued | training | trained | rejected
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists create_training_samples_cap_idx on public.create_training_samples (capability, status);

-- Seed the four brains (idempotent).
insert into public.create_engines (key, label, enabled, daily_budget_cents, cost_per_call_cents, config) values
  ('internal', 'Internal CREATE brain', true, 0, 0, '{"selfHosted": true}'::jsonb),
  ('openai',   'OpenAI brain',          true, 500, 4, '{"textModel": "gpt-4o-mini", "imageModel": "gpt-image-1"}'::jsonb),
  ('magnific', 'Magnific brain',        true, 300, 8, '{"mode": "upscale"}'::jsonb),
  ('creattie', 'Creattie brain',        false, 0, 0, '{"note": "disabled until license attested"}'::jsonb)
on conflict (key) do nothing;

-- Seed sensible default routes (idempotent). Tools without a row fall back to internal.
insert into public.create_engine_routes (tool_slug, capability, primary_engine, fallback_engines) values
  ('illustration-generator', 'default', 'openai',   '{creattie,internal}'),
  ('vector-generator',       'default', 'internal', '{creattie}'),
  ('logo-animation',         'default', 'internal', '{}'),
  ('image-restorer',         'default', 'magnific', '{internal}'),
  ('background-remover',     'default', 'openai',   '{}'),
  ('brand-name-checker',     'default', 'openai',   '{internal}'),
  ('logo-ideator',           'default', 'openai',   '{internal}')
on conflict (tool_slug, capability) do nothing;
