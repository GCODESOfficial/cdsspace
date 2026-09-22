import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/activity-log";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { sanitizeOrFilterTerm } from "@/lib/search-filter";
import {
    CLIENT_MODULES,
    isClientModuleKey,
    resolveClientModuleVisibility,
    type ClientModuleKey,
} from "@/lib/client-modules";
import { readClientModuleDefaults } from "@/lib/client-modules-server";

export const dynamic = "force-dynamic";

interface ClientRow {
    id: string;
    public_user_id: string | null;
    full_name: string | null;
    company_name: string | null;
    email: string | null;
}

function clientSummary(row: ClientRow) {
    return {
        id: row.id,
        publicUserId: row.public_user_id || "",
        name: row.full_name || row.email || "Client",
        company: row.company_name || "",
        email: row.email || "",
    };
}

/** Turn a body value into a module map, ignoring keys we do not know. */
function readModuleMap(value: unknown, allowNull: boolean) {
    const map: Partial<Record<ClientModuleKey, boolean | null>> = {};
    if (!value || typeof value !== "object") return map;
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
        if (!isClientModuleKey(key)) continue;
        if (raw === null && allowNull) {
            map[key] = null;
            continue;
        }
        if (typeof raw === "boolean") map[key] = raw;
    }
    return map;
}

export async function GET(request: NextRequest) {
    const denied = await requireFinanceAdminAsync(request, "clients.modules.view");
    if (denied) return denied;

    const db = financeDb();
    const search = sanitizeOrFilterTerm(new URL(request.url).searchParams.get("search"));

    try {
        // Searching is a client lookup, so admin can pick who to override.
        if (search) {
            const { data, error } = await db
                .from("profiles")
                .select("id, public_user_id, full_name, company_name, email")
                .eq("account_status", "active")
                .or(`full_name.ilike.%${search}%,email.ilike.%${search}%,company_name.ilike.%${search}%`)
                .order("full_name")
                .limit(20);
            if (error) throw error;
            return NextResponse.json({ results: (data || []).map(clientSummary) });
        }

        const defaults = await readClientModuleDefaults();
        const { data: overrideRows, error: overrideError } = await db
            .from("client_dashboard_module_overrides")
            .select("user_id, module_key, enabled");
        if (overrideError) throw overrideError;

        const byUser = new Map<string, Partial<Record<ClientModuleKey, boolean>>>();
        for (const row of (overrideRows || []) as { user_id: string; module_key: string; enabled: boolean }[]) {
            if (!isClientModuleKey(row.module_key)) continue;
            const current = byUser.get(row.user_id) || {};
            current[row.module_key] = row.enabled !== false;
            byUser.set(row.user_id, current);
        }

        const userIds = [...byUser.keys()];
        let profiles: ClientRow[] = [];
        if (userIds.length) {
            const { data, error } = await db
                .from("profiles")
                .select("id, public_user_id, full_name, company_name, email")
                .in("id", userIds);
            if (error) throw error;
            profiles = (data || []) as ClientRow[];
        }

        const clients = profiles.map((row) => ({
            ...clientSummary(row),
            overrides: byUser.get(row.id) || {},
            visibility: resolveClientModuleVisibility(defaults, byUser.get(row.id) || {}),
        }));
        clients.sort((a, b) => a.name.localeCompare(b.name));

        return NextResponse.json({ modules: CLIENT_MODULES, defaults, clients });
    } catch (error) {
        console.error("[client-modules] load failed", error);
        return NextResponse.json({ error: "Could not load client dashboard modules." }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    const denied = await requireFinanceAdminAsync(request, "clients.modules.edit");
    if (denied) return denied;

    const db = financeDb();
    const now = new Date().toISOString();

    try {
        const body = await request.json();
        const userId = typeof body.userId === "string" ? body.userId.trim() : "";

        // Per-client overrides. A null value clears the override so the client
        // falls back to the platform default again.
        if (userId) {
            const modules = readModuleMap(body.modules, true);
            const clears = Object.entries(modules).filter(([, value]) => value === null).map(([key]) => key);
            const sets = Object.entries(modules).filter(([, value]) => typeof value === "boolean");

            if (clears.length) {
                const { error } = await db
                    .from("client_dashboard_module_overrides")
                    .delete()
                    .eq("user_id", userId)
                    .in("module_key", clears);
                if (error) throw error;
            }
            if (sets.length) {
                const { error } = await db
                    .from("client_dashboard_module_overrides")
                    .upsert(
                        sets.map(([module_key, enabled]) => ({ user_id: userId, module_key, enabled, updated_at: now })),
                        { onConflict: "user_id,module_key" },
                    );
                if (error) throw error;
            }

            await logActivity({
                action: "client_modules.override",
                page: "clients/modules",
                resource_type: "client",
                resource_id: userId,
                metadata: { modules },
            });
            return NextResponse.json({ ok: true });
        }

        // Platform defaults.
        const defaults = readModuleMap(body.defaults, false);
        const rows = Object.entries(defaults).map(([module_key, enabled]) => ({ module_key, enabled, updated_at: now }));
        if (rows.length) {
            const { error } = await db
                .from("client_dashboard_modules")
                .upsert(rows, { onConflict: "module_key" });
            if (error) throw error;
        }

        await logActivity({
            action: "client_modules.defaults",
            page: "clients/modules",
            resource_type: "client_dashboard",
            resource_label: "Client dashboard modules",
            metadata: { defaults },
        });
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("[client-modules] save failed", error);
        return NextResponse.json({ error: "Could not save client dashboard modules." }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const denied = await requireFinanceAdminAsync(request, "clients.modules.edit");
    if (denied) return denied;

    const userId = new URL(request.url).searchParams.get("userId")?.trim();
    if (!userId) return NextResponse.json({ error: "A client is required." }, { status: 400 });

    try {
        const { error } = await financeDb()
            .from("client_dashboard_module_overrides")
            .delete()
            .eq("user_id", userId);
        if (error) throw error;

        await logActivity({
            action: "client_modules.override_clear",
            page: "clients/modules",
            resource_type: "client",
            resource_id: userId,
        });
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("[client-modules] clear failed", error);
        return NextResponse.json({ error: "Could not clear the client overrides." }, { status: 500 });
    }
}
