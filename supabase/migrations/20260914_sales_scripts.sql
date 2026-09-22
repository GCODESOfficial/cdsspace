create extension if not exists pgcrypto;

create table if not exists public.admin_sales_scripts (
  id uuid primary key default gen_random_uuid(),
  source_script_id uuid references public.admin_sales_scripts(id) on delete set null,
  seed_key text unique,
  category text not null check (category in ('sales', 'marketing', 'client_experience')),
  title text not null default '',
  script_text text not null default '',
  use_case text,
  channel text not null default 'Any channel' check (channel in ('Any channel', 'Phone call', 'WhatsApp', 'Email', 'Social message', 'In person')),
  stage text not null default 'Opening' check (stage in ('Opening', 'Discovery', 'Follow-up', 'Objection handling', 'Closing', 'Onboarding', 'Service recovery')),
  market text not null default 'Global',
  language text not null default 'English',
  tags text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  sort_order integer not null default 100,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_sales_scripts_library_idx
  on public.admin_sales_scripts (status, category, sort_order, updated_at desc);
create unique index if not exists admin_sales_scripts_one_draft_per_admin_idx
  on public.admin_sales_scripts (created_by) where status = 'draft';

insert into public.admin_sales_scripts
  (seed_key, category, title, script_text, use_case, channel, stage, market, language, tags, status, sort_order, created_by, updated_by)
values
  ('sales-first-conversation', 'sales', 'Open a first conversation', 'Hello [Name], I noticed [specific opportunity] around [their brand or goal]. At CDS Space, we help organisations turn opportunities like this into clear brand and business experiences. Would a brief conversation this week be useful?', 'Personalise the opportunity before contacting a new prospect.', 'Any channel', 'Opening', 'Global', 'English', array['prospecting','introduction'], 'published', 10, 'system', 'system'),
  ('sales-discovery', 'sales', 'Begin a discovery call', 'Before we recommend anything, I would like to understand what success should look like for you. What are you trying to achieve, what is slowing that down today, and what would make this project valuable?', 'Use after introductions to keep discovery focused on the client outcome.', 'Phone call', 'Discovery', 'Global', 'English', array['discovery','consultation'], 'published', 20, 'system', 'system'),
  ('sales-follow-up', 'sales', 'Follow up without pressure', 'Hello [Name], I am following up on our conversation about [project or goal]. I have kept the next step simple: [specific action]. Would you like us to proceed, adjust the approach, or reconnect at a better time?', 'Give a prospect three respectful ways to respond.', 'Any channel', 'Follow-up', 'Global', 'English', array['follow-up'], 'published', 30, 'system', 'system'),
  ('marketing-introduction', 'marketing', 'Introduce CDS Space clearly', 'CDS Space helps ambitious organisations build brands, digital products and physical experiences that work together. We combine strategy, design and production so clients can move from an idea to a consistent market presence with one accountable partner.', 'Standard short introduction for campaigns, partnerships and events.', 'Any channel', 'Opening', 'Global', 'English', array['brand-introduction','campaign'], 'published', 40, 'system', 'system'),
  ('marketing-collaboration', 'marketing', 'Open a partnership conversation', 'Hello [Name], our work at CDS Space intersects with [specific part of their work]. I see a practical opportunity to create value together around [shared audience or outcome]. May I send a short collaboration outline for your review?', 'Use when approaching a potential partner, community or channel.', 'Email', 'Opening', 'Global', 'English', array['partnership','collaboration'], 'published', 50, 'system', 'system'),
  ('marketing-reengagement', 'marketing', 'Re-engage a quiet contact', 'Hello [Name], it has been a while since we last connected. We have been developing new ways to support organisations with [relevant service]. If [their current priority] is still important, I would be glad to share a concise recommendation.', 'Reconnect using relevance rather than a generic check-in.', 'WhatsApp', 'Follow-up', 'Global', 'English', array['re-engagement'], 'published', 60, 'system', 'system'),
  ('cx-welcome', 'client_experience', 'Welcome a new client', 'Welcome to CDS Space, [Name]. We are pleased to have you here. Your workspace keeps your requests, files, messages and progress together. We will guide you through each next step and keep communication clear from briefing to delivery.', 'Standard welcome after a client account or project is opened.', 'Any channel', 'Onboarding', 'Global', 'English', array['welcome','onboarding'], 'published', 70, 'system', 'system'),
  ('cx-progress', 'client_experience', 'Share a clear progress update', 'Hello [Name], here is your current project update: [completed work]. We are now working on [current stage], and the next item we need from you is [action, if any]. The next scheduled update is [date or milestone].', 'Keep project updates specific and action-led.', 'Any channel', 'Follow-up', 'Global', 'English', array['project-update','client-care'], 'published', 80, 'system', 'system'),
  ('cx-recovery', 'client_experience', 'Respond when an experience falls short', 'Thank you for bringing this to our attention, [Name]. I understand the impact of [specific issue]. We are taking responsibility for the next step: [corrective action], with an update by [time]. We will stay with this until it is properly resolved.', 'Acknowledge impact, state ownership and give a definite next update.', 'Any channel', 'Service recovery', 'Global', 'English', array['service-recovery','support'], 'published', 90, 'system', 'system')
on conflict (seed_key) do nothing;

alter table public.admin_sales_scripts enable row level security;
