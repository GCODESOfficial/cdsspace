/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Admin activity log. Every admin-side mutation should call `logActivity`
 * so the per-page Activity panel has a timeline to render. Failures are
 * swallowed - logging must never break the actual operation it's tracing.
 */
import { getAdminSession } from "@/lib/admin-session";
import { getTeamSession } from "@/lib/team-auth";
import { glashQuery } from "@/lib/glashdb/postgres";
import { criticalActivityNotification, notifyAdminFeatureEvent } from "@/lib/admin-feature-notifications";

export interface LogActivityInput {
    /** Verb like "team_member.suspend", "invoice.create", "project.assign". */
    action: string;
    /** Admin page that triggered it - e.g. "team-members", "finance/invoices". */
    page: string;
    /** Kind of thing acted on - "team_member", "invoice", "project", etc. */
    resource_type: string;
    /** UUID or external id of the target (stringified). */
    resource_id?: string | null;
    /** Human-readable label shown in the feed. */
    resource_label?: string | null;
    /** Anything else you want to remember. */
    metadata?: Record<string, any>;
}

export interface ActivityLogRowInput extends LogActivityInput {
    actor_kind: "admin" | "team" | "system";
    actor_id?: string | null;
    actor_name: string;
    actor_is_admin?: boolean;
}

export async function insertActivityLog(input: ActivityLogRowInput): Promise<void> {
    await glashQuery(
        `insert into public.admin_activity_log
          (actor_kind, actor_id, actor_name, actor_is_admin, action, resource_type, resource_id, resource_label, page, metadata)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
            input.actor_kind,
            input.actor_id ?? null,
            input.actor_name,
            input.actor_is_admin ?? (input.actor_kind === "admin"),
            input.action,
            input.resource_type,
            input.resource_id ?? null,
            input.resource_label ?? null,
            input.page,
            input.metadata ?? {},
        ],
    );
}

export async function logActivity(input: LogActivityInput): Promise<void> {
    try {
        // Resolve actor from whichever session is present. Admin wins if
        // both exist because admin routes are what we're instrumenting.
        const admin = await getAdminSession();
        const team = admin ? null : await getTeamSession();

        let actor_kind: "admin" | "team" | "system" = "system";
        let actor_id: string | null = null;
        let actor_name = "System";
        let actor_is_admin = false;

        if (admin) {
            actor_kind = "admin";
            actor_id = admin.email;
            actor_name = admin.name || admin.email;
            actor_is_admin = true;
        } else if (team) {
            actor_kind = "team";
            actor_id = team.id;
            actor_name = team.full_name || team.email;
        }

        await insertActivityLog({
            ...input,
            actor_kind,
            actor_id,
            actor_name,
            actor_is_admin,
        });
        const notification = criticalActivityNotification(input);
        if (notification) await notifyAdminFeatureEvent(notification);
    } catch (err) {
        // Activity logging is best-effort. Never let it break the caller.
        console.error("[activity-log] insert failed:", err);
    }
}

/** Fire-and-forget - doesn't await so the caller can return quickly. */
export function logActivityBackground(input: LogActivityInput): void {
    void logActivity(input);
}
