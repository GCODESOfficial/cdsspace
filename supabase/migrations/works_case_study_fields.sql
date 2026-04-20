-- Case-study metadata for the public work detail overlay.
--
-- The overlay's four-column metadata grid needs these fields. They're all
-- optional: the UI gracefully shows "—" when a row is missing a value.
--
-- Multi-value fields (project_scope, deliverables) are stored as plain text
-- with newline-separated lines, so the admin can just paste a list. The
-- overlay splits on \n when rendering.

alter table public.works
    add column if not exists industry       text,
    add column if not exists project_scope  text,
    add column if not exists deliverables   text,
    add column if not exists timeline       text;
