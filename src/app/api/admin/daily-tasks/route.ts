/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionAsync } from "@/app/api/admin-check/route";
import { hasPermission } from "@/lib/admin-permissions";
import { glashQuery } from "@/lib/glashdb/postgres";
import { ROLE_TEMPLATES } from "@/lib/team-tasks/role-templates";
import {
    effectiveItemsFor,
    saveScopeItems,
    resetScope,
    type TemplateScope,
    type EditableItem,
} from "@/lib/team-tasks/templates-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function guard(session: any): boolean {
    if (!session) return false;
    if (session.role === "super_admin") return true;
    return hasPermission(session.permissions, "team_today") || hasPermission(session.permissions, "team_members");
}

function normalizeScope(raw: any): TemplateScope | null {
    return raw === "universal" || raw === "role" || raw === "member" ? raw : null;
}

export async function GET(req: NextRequest) {
    const session = await getAdminSessionAsync(req);
    if (!guard(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const scope = normalizeScope(req.nextUrl.searchParams.get("scope"));
    const key = req.nextUrl.searchParams.get("key");

    // Scope+key requested → return that scope's effective checklist.
    if (scope) {
        if (scope !== "universal" && !key) {
            return NextResponse.json({ error: "key is required" }, { status: 400 });
        }
        const { items, customized } = await effectiveItemsFor(scope, scope === "universal" ? null : key);
        return NextResponse.json({ items, customized });
    }

    // Otherwise return the pickers: roles (from templates) + active team members.
    const members = await glashQuery<any>(
        `select id, full_name, role_title, department
           from public.team_members
          where is_active
          order by department nulls last, full_name`,
    ).catch(() => []);

    return NextResponse.json({
        roles: ROLE_TEMPLATES.map((r) => ({ key: r.key, name: r.name })),
        members,
    });
}

export async function POST(req: NextRequest) {
    const session = await getAdminSessionAsync(req);
    if (!guard(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const scope = normalizeScope(body.scope);
    const key: string | null = body.key ?? null;
    if (!scope) return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
    if (scope !== "universal" && !key) return NextResponse.json({ error: "key is required" }, { status: 400 });

    const scopeKey = scope === "universal" ? null : key;

    try {
        if (action === "save") {
            const items: EditableItem[] = Array.isArray(body.items)
                ? body.items
                      .map((it: any) => ({
                          kind: it?.kind === "evidence" ? "evidence" : "task",
                          label: String(it?.label ?? "").trim(),
                      }))
                      .filter((it: EditableItem) => it.label.length > 0)
                : [];
            await saveScopeItems(scope, scopeKey, items, session?.memberId ?? null);
            const effective = await effectiveItemsFor(scope, scopeKey);
            return NextResponse.json({ ok: true, ...effective });
        }

        if (action === "reset") {
            await resetScope(scope, scopeKey);
            const effective = await effectiveItemsFor(scope, scopeKey);
            return NextResponse.json({ ok: true, ...effective });
        }

        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Request failed" }, { status: 500 });
    }
}
