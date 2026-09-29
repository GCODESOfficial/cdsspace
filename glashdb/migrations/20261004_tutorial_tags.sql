-- A tutorial can now cover several tools, modules and pages.
--
-- Each video belonged to exactly one tool, so a recording that explained
-- letterheads in both the CREATE studio and the Executive Board had to be
-- uploaded twice, and a general tour of invoicing could only be filed under
-- one screen. Tutorials now carry tags, and appear wherever they are tagged.
--
-- The original tool_slug stays as the primary tag, so nothing filed before
-- this change moves or disappears.

begin;

alter table public.dashboard_tutorials
  add column if not exists tags text[] not null default '{}';

comment on column public.dashboard_tutorials.tags is
  'Tools, modules and pages this tutorial is filed under. The first entry mirrors tool_slug.';

-- Everything already uploaded keeps showing exactly where it did.
update public.dashboard_tutorials
   set tags = array[tool_slug]
 where cardinality(tags) = 0 and tool_slug is not null;

-- The client library looks tutorials up by tag for the screen being viewed.
create index if not exists idx_dashboard_tutorials_tags
  on public.dashboard_tutorials using gin (tags);

commit;
