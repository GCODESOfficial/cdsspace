/**
 * The client dashboard is not the same shape for every client. A client who
 * never orders merch, or who is not on a subscription, should not be shown a
 * section we have no intention of serving.
 *
 * This catalogue is the single description of what the client dashboard is made
 * of. Admin turns a module off platform-wide, or for one client, and the same
 * answer drives the sidebar, the overview widgets, and the route guard.
 */

export type ClientModuleKey =
    | "overview"
    | "intelligence"
    | "brand_brief"
    | "brand_identity"
    | "banners"
    | "merch"
    | "cgifts"
    | "subscription"
    | "messages"
    | "cmeet"
    | "documents"
    | "orders"
    | "invoices"
    | "book_session"
    | "settings";

export interface ClientModuleDefinition {
    key: ClientModuleKey;
    label: string;
    description: string;
    /** The sidebar section it belongs to, so admin sees the client's own grouping. */
    group: string;
    /** Dashboard route the module owns. Every path under it belongs to it too. */
    route: string;
    /** Core modules keep the dashboard usable and can never be turned off. */
    core?: boolean;
    /** Owned by a route but not shown as its own sidebar entry. */
    hiddenFromSidebar?: boolean;
}

export const CLIENT_MODULES: ClientModuleDefinition[] = [
    {
        key: "overview",
        label: "Dashboard",
        description: "The overview page every client lands on after signing in.",
        group: "Overview",
        route: "/dashboard",
        core: true,
    },
    {
        key: "intelligence",
        label: "Intelligence",
        description: "Brand intelligence publications and reports shared with the client.",
        group: "Overview",
        route: "/dashboard/intelligence",
    },
    {
        key: "brand_brief",
        label: "Brand Brief",
        description: "The brief workspace where the client defines their brand with us.",
        group: "Brand strategy",
        route: "/dashboard/brand-brief",
    },
    {
        key: "brand_identity",
        label: "Brand Identity",
        description: "Delivered identity systems, logo files, and brand guidelines.",
        group: "Brand strategy",
        route: "/dashboard/brand-identity",
    },
    {
        key: "banners",
        label: "Banners",
        description: "Banner ordering, sizes, materials, and production requests.",
        group: "Creative services",
        route: "/dashboard/banners",
    },
    {
        key: "merch",
        label: "Merch",
        description: "The merch catalogue and branded item ordering.",
        group: "Creative services",
        route: "/dashboard/merch",
    },
    {
        key: "cgifts",
        label: "cGifts",
        description: "Gift discovery, brand customization, quotations and fulfilment.",
        group: "Creative services",
        route: "/dashboard/cgifts",
    },
    {
        key: "subscription",
        label: "Subscription",
        description: "Subscription plans, design requests, and retainer feedback.",
        group: "Creative services",
        route: "/dashboard/subscription",
    },
    {
        key: "messages",
        label: "Chat",
        description: "Direct conversation with the team and project groups.",
        group: "Communication & files",
        route: "/dashboard/messages",
    },
    {
        key: "cmeet",
        label: "cMeet",
        description: "Create, schedule and join client meetings without an approval step.",
        group: "Communication & files",
        route: "/dashboard/cmeet",
    },
    {
        key: "documents",
        label: "cDrive",
        description: "Project drives, collaborative files, folders, and finished deliveries.",
        group: "Communication & files",
        route: "/dashboard/cdrive",
    },
    {
        key: "orders",
        label: "Orders",
        description: "Order history and the status of jobs in production.",
        group: "Orders & billing",
        route: "/dashboard/orders",
    },
    {
        key: "invoices",
        label: "Invoices",
        description: "Invoices, receipts, and payment history.",
        group: "Orders & billing",
        route: "/dashboard/invoices",
    },
    {
        key: "book_session",
        label: "Book a session",
        description: "The consultation booking call-to-action on the overview page.",
        group: "Orders & billing",
        route: "/dashboard/book-session",
        hiddenFromSidebar: true,
    },
    {
        key: "settings",
        label: "Account Config",
        description: "Profile, billing currency, and account settings.",
        group: "Account",
        route: "/dashboard/settings",
        core: true,
    },
];

export const CLIENT_MODULE_KEYS = CLIENT_MODULES.map((module) => module.key);

const MODULES_BY_KEY = new Map(CLIENT_MODULES.map((module) => [module.key, module]));

export function isClientModuleKey(value: unknown): value is ClientModuleKey {
    return typeof value === "string" && MODULES_BY_KEY.has(value as ClientModuleKey);
}

export function getClientModule(key: ClientModuleKey) {
    return MODULES_BY_KEY.get(key);
}

/** Module visibility as the client dashboard consumes it: every key, resolved. */
export type ClientModuleVisibility = Record<ClientModuleKey, boolean>;

export function allClientModulesEnabled(): ClientModuleVisibility {
    return CLIENT_MODULES.reduce((visibility, module) => {
        visibility[module.key] = true;
        return visibility;
    }, {} as ClientModuleVisibility);
}

/**
 * Resolve platform defaults and a single client's overrides into one answer.
 * A missing default means the module has never been touched, which is on.
 */
export function resolveClientModuleVisibility(
    defaults: Partial<Record<ClientModuleKey, boolean>>,
    overrides: Partial<Record<ClientModuleKey, boolean>> = {},
): ClientModuleVisibility {
    return CLIENT_MODULES.reduce((visibility, module) => {
        if (module.core) {
            visibility[module.key] = true;
            return visibility;
        }
        const override = overrides[module.key];
        if (typeof override === "boolean") {
            visibility[module.key] = override;
            return visibility;
        }
        visibility[module.key] = defaults[module.key] !== false;
        return visibility;
    }, {} as ClientModuleVisibility);
}

/**
 * Which module owns a dashboard path. Longest route wins so
 * /dashboard/brand-brief is not claimed by /dashboard.
 */
export function clientModuleForPath(dashboardPath: string): ClientModuleDefinition | null {
    // Keep old bookmarked delivery links governed by the renamed cDrive module.
    const normalizedPath = dashboardPath === "/dashboard/documents"
        ? "/dashboard/cdrive"
        : dashboardPath.startsWith("/dashboard/documents/")
            ? dashboardPath.replace("/dashboard/documents", "/dashboard/cdrive")
            : dashboardPath;
    let matched: ClientModuleDefinition | null = null;
    for (const candidate of CLIENT_MODULES) {
        const owns = normalizedPath === candidate.route || normalizedPath.startsWith(`${candidate.route}/`);
        if (!owns) continue;
        if (!matched || candidate.route.length > matched.route.length) matched = candidate;
    }
    return matched;
}

/** True when the client may open this dashboard path. */
export function isClientPathVisible(dashboardPath: string, visibility: ClientModuleVisibility) {
    const owner = clientModuleForPath(dashboardPath);
    if (!owner) return true;
    return visibility[owner.key] !== false;
}
