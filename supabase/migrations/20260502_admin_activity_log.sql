-- Admin activity log + per-page audit trail.
--
-- Every admin-side mutation writes a row here via the logActivity helper in
-- src/lib/activity-log.ts. The ActivityPanel component queries this table
-- filtered by `page` to render the per-page feed the ops team requested.
--
-- The table is intentionally un-indexed beyond (page, created_at) — activity
-- volume is low compared to finance/chat tables and rows don't need
-- cross-referenced queries beyond the page filter.
--
-- Re-runnable: IF NOT EXISTS on the table + indexes.

CREATE TABLE IF NOT EXISTS admin_activity_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Who did the thing. actor_id is intentionally TEXT so we can store
    -- either a team_member UUID or an admin email without a FK/JOIN.
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('admin', 'team', 'system')),
    actor_id TEXT,
    actor_name TEXT NOT NULL,
    actor_is_admin BOOLEAN NOT NULL DEFAULT FALSE,

    -- What they did. `action` is a dotted verb like "team_member.suspend".
    -- `resource_type` / `resource_id` / `resource_label` describe the target.
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    resource_label TEXT,

    -- The admin page that triggered the mutation — this is what the
    -- ActivityPanel filters on, so keep the shape stable: "team-members",
    -- "finance/invoices", "finance/projects", etc.
    page TEXT NOT NULL,

    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_page_created
    ON admin_activity_log (page, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_resource
    ON admin_activity_log (resource_type, resource_id);

CREATE INDEX IF NOT EXISTS idx_activity_actor_created
    ON admin_activity_log (actor_id, created_at DESC);

-- Keep the log light — prune anything older than 180 days. Running the
-- cleanup as a one-off delete is fine; the cron job is optional.
-- (Uncomment if you have pg_cron:)
-- SELECT cron.schedule(
--     'prune_admin_activity_log',
--     '0 3 * * *',
--     $$DELETE FROM admin_activity_log WHERE created_at < NOW() - INTERVAL '180 days'$$
-- );

COMMENT ON TABLE admin_activity_log IS
    'Audit trail for admin-side mutations — displayed per page via <ActivityPanel>';
