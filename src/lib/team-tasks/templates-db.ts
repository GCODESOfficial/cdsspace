import "server-only";
import { glashQuery } from "@/lib/glashdb/postgres";
import {
    UNIVERSAL_TASKS,
    ROLE_TEMPLATES,
    roleKeyFor,
    roleTemplateFor,
    type ChecklistTemplateItem,
} from "@/lib/team-tasks/role-templates";

export type TemplateScope = "universal" | "role" | "member";

export interface EditableItem {
    kind: "task" | "evidence";
    label: string;
}

interface TemplateRow {
    id: string;
    scope: TemplateScope;
    role_key: string | null;
    member_id: string | null;
    kind: "task" | "evidence";
    label: string;
    position: number;
}

/** Code-default items for a scope (used when no admin override exists). */
export function defaultItemsFor(scope: TemplateScope, key: string | null): ChecklistTemplateItem[] {
    if (scope === "universal") {
        return UNIVERSAL_TASKS.map((label, i) => ({
            template_key: `universal:task:${i}`,
            role_key: "universal",
            kind: "task" as const,
            label,
        }));
    }
    if (scope === "role" && key) {
        const role = ROLE_TEMPLATES.find((r) => r.key === key);
        if (!role) return [];
        const items: ChecklistTemplateItem[] = [];
        role.tasks.forEach((label, i) =>
            items.push({ template_key: `${role.key}:task:${i}`, role_key: role.key, kind: "task", label }),
        );
        role.evidence.forEach((label, i) =>
            items.push({ template_key: `${role.key}:evidence:${i}`, role_key: role.key, kind: "evidence", label }),
        );
        return items;
    }
    // member scope has no code defaults
    return [];
}

function rowToItem(row: TemplateRow): ChecklistTemplateItem {
    return {
        template_key: `db:${row.id}`,
        role_key: row.scope === "role" ? row.role_key ?? "role" : row.scope,
        kind: row.kind,
        label: row.label,
    };
}

/**
 * The effective (admin-facing) checklist for one scope+key: admin overrides if
 * any exist for that scope, otherwise the code defaults. `customized` tells the
 * UI whether it's showing saved overrides or the shipped defaults.
 */
export async function effectiveItemsFor(
    scope: TemplateScope,
    key: string | null,
): Promise<{ items: ChecklistTemplateItem[]; customized: boolean }> {
    let rows: TemplateRow[] = [];
    try {
        if (scope === "universal") {
            rows = await glashQuery<TemplateRow>(
                `select id, scope, role_key, member_id, kind, label, position
                   from public.team_task_templates
                  where active and scope = 'universal'
                  order by position, created_at`,
            );
        } else if (scope === "role") {
            rows = await glashQuery<TemplateRow>(
                `select id, scope, role_key, member_id, kind, label, position
                   from public.team_task_templates
                  where active and scope = 'role' and role_key = $1
                  order by position, created_at`,
                [key],
            );
        } else {
            rows = await glashQuery<TemplateRow>(
                `select id, scope, role_key, member_id, kind, label, position
                   from public.team_task_templates
                  where active and scope = 'member' and member_id = $1
                  order by position, created_at`,
                [key],
            );
        }
    } catch {
        rows = [];
    }
    if (rows.length) return { items: rows.map(rowToItem), customized: true };
    return { items: defaultItemsFor(scope, key), customized: false };
}

/**
 * Replace every override row for a scope+key with the supplied ordered list.
 * Empty list clears the scope (falls back to code defaults).
 */
export async function saveScopeItems(
    scope: TemplateScope,
    key: string | null,
    items: EditableItem[],
    createdBy?: string | null,
): Promise<void> {
    if (scope === "role" && !key) throw new Error("role_key is required for role scope");
    if (scope === "member" && !key) throw new Error("member_id is required for member scope");

    const roleKey = scope === "role" ? key : null;
    const memberId = scope === "member" ? key : null;

    if (scope === "universal") {
        await glashQuery(`delete from public.team_task_templates where scope = 'universal'`);
    } else if (scope === "role") {
        await glashQuery(`delete from public.team_task_templates where scope = 'role' and role_key = $1`, [roleKey]);
    } else {
        await glashQuery(`delete from public.team_task_templates where scope = 'member' and member_id = $1`, [memberId]);
    }

    let position = 0;
    for (const item of items) {
        const label = (item.label || "").trim();
        if (!label) continue;
        const kind = item.kind === "evidence" ? "evidence" : "task";
        await glashQuery(
            `insert into public.team_task_templates (scope, role_key, member_id, kind, label, position, created_by)
             values ($1, $2, $3, $4, $5, $6, $7)`,
            [scope, roleKey, memberId, kind, label, position++, createdBy ?? null],
        );
    }
}

/** Drop all overrides for a scope+key, reverting to code defaults. */
export async function resetScope(scope: TemplateScope, key: string | null): Promise<void> {
    if (scope === "universal") {
        await glashQuery(`delete from public.team_task_templates where scope = 'universal'`);
    } else if (scope === "role") {
        await glashQuery(`delete from public.team_task_templates where scope = 'role' and role_key = $1`, [key]);
    } else {
        await glashQuery(`delete from public.team_task_templates where scope = 'member' and member_id = $1`, [key]);
    }
}

/**
 * The resolved daily checklist for a member: effective universal + effective
 * role (matched from role_title/department) + any member-specific overrides.
 * DB-backed replacement for the sync checklistTemplateFor().
 */
export async function resolveChecklistFor(member: {
    id: string;
    role_title?: string | null;
    department?: string | null;
}): Promise<ChecklistTemplateItem[]> {
    const roleKey = roleKeyFor(member.role_title, member.department);

    let rows: TemplateRow[] = [];
    try {
        rows = await glashQuery<TemplateRow>(
            `select id, scope, role_key, member_id, kind, label, position
               from public.team_task_templates
              where active and (
                    scope = 'universal'
                 or (scope = 'role' and role_key = $1)
                 or (scope = 'member' and member_id = $2)
              )
              order by scope, position, created_at`,
            [roleKey, member.id],
        );
    } catch {
        rows = [];
    }

    const universalRows = rows.filter((r) => r.scope === "universal");
    const roleRows = rows.filter((r) => r.scope === "role");
    const memberRows = rows.filter((r) => r.scope === "member");

    const universal = universalRows.length
        ? universalRows.map(rowToItem)
        : defaultItemsFor("universal", null);

    let role: ChecklistTemplateItem[] = [];
    if (roleKey) {
        role = roleRows.length ? roleRows.map(rowToItem) : (roleTemplateFor(member.role_title, member.department) ? defaultItemsFor("role", roleKey) : []);
    }

    const memberItems = memberRows.map(rowToItem);

    return [...universal, ...role, ...memberItems];
}
