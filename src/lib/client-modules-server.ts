import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";
import {
    allClientModulesEnabled,
    isClientModuleKey,
    resolveClientModuleVisibility,
    type ClientModuleKey,
    type ClientModuleVisibility,
} from "@/lib/client-modules";

type ModuleFlags = Partial<Record<ClientModuleKey, boolean>>;

function toFlags(rows: unknown): ModuleFlags {
    if (!Array.isArray(rows)) return {};
    return rows.reduce<ModuleFlags>((flags, row) => {
        const record = row as { module_key?: unknown; enabled?: unknown };
        if (isClientModuleKey(record.module_key)) {
            flags[record.module_key] = record.enabled !== false;
        }
        return flags;
    }, {});
}

/** Platform-wide defaults. Modules with no row are on. */
export async function readClientModuleDefaults(): Promise<ModuleFlags> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = getSupabaseAdmin() as any;
    const { data, error } = await db.from("client_dashboard_modules").select("module_key, enabled");
    if (error) throw error;
    return toFlags(data);
}

/** One client's overrides, keyed by module. */
export async function readClientModuleOverrides(userId: string): Promise<ModuleFlags> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = getSupabaseAdmin() as any;
    const { data, error } = await db
        .from("client_dashboard_module_overrides")
        .select("module_key, enabled")
        .eq("user_id", userId);
    if (error) throw error;
    return toFlags(data);
}

/**
 * What this client is allowed to see. A read failure must not lock a client out
 * of their own dashboard, so the fallback is the dashboard we shipped: all on.
 */
export async function getClientModuleVisibility(userId: string): Promise<ClientModuleVisibility> {
    try {
        const [defaults, overrides] = await Promise.all([
            readClientModuleDefaults(),
            readClientModuleOverrides(userId),
        ]);
        return resolveClientModuleVisibility(defaults, overrides);
    } catch (error) {
        console.error("[client-modules] visibility lookup failed", error);
        return allClientModulesEnabled();
    }
}
