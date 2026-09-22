import "server-only";

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/glashdb/server";
import { getGlashDbServerConfig } from "@/lib/glashdb/env";
import { applicationOrigin, publicSiteOrigin } from "@/lib/public-site";

export type DashboardOAuthProvider = "google" | "linkedin";

const PROVIDER_DETAILS: Record<DashboardOAuthProvider, {
    errorPrefix: "google" | "linkedin";
    scopes?: string;
}> = {
    google: { errorPrefix: "google" },
    // GlashDB names this provider "linkedin", not "linkedin_oidc": that is the
    // key it reports in /auth/v1/settings and the only value its authorize
    // endpoint accepts (linkedin_oidc answers 400). It runs LinkedIn's OpenID
    // Connect product underneath and already asks for these scopes; they are
    // passed explicitly because CDS Space needs a verified address to establish
    // its durable first-party client or marketer session.
    linkedin: { errorPrefix: "linkedin", scopes: "openid profile email" },
};

export function safeOAuthNext(raw: string | null): string {
    return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
}

export function oauthFailurePage(next: string): "/login" | "/marketer/login" {
    return next === "/marketer" || next.startsWith("/marketer/") ? "/marketer/login" : "/login";
}

function requestOrigin(request: NextRequest) {
    return applicationOrigin(request);
}

function fallbackOrigin() {
    return publicSiteOrigin();
}

/**
 * Read GlashDB's public auth settings before redirecting. A disabled provider
 * otherwise fails one request later on the GlashDB authorize endpoint and
 * leaves the visitor looking at a raw JSON error instead of the login page.
 * A transient settings failure returns unknown so an otherwise healthy OAuth
 * provider is not blocked by the preflight itself.
 */
async function providerEnabled(provider: DashboardOAuthProvider): Promise<boolean | null> {
    try {
        const { url, anonKey } = getGlashDbServerConfig();
        const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/settings`, {
            headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
            cache: "no-store",
            signal: AbortSignal.timeout(5_000),
        });
        if (!response.ok) return null;
        const settings = (await response.json()) as { external?: Record<string, unknown> };
        return settings.external?.[provider] === true;
    } catch {
        return null;
    }
}

/**
 * Glash can report a provider as enabled before its client credentials have
 * been saved. In that state signInWithOAuth still returns an authorize URL,
 * but opening it shows Glash's raw JSON "not configured" response. Probe the
 * generated URL server-side so visitors stay on the branded login screen.
 * Network/edge failures are deliberately treated as unknown: they must not
 * disable a healthy provider during a transient outage.
 */
async function authorizeUrlConfigured(url: string): Promise<boolean | null> {
    try {
        const response = await fetch(url, {
            redirect: "manual",
            cache: "no-store",
            signal: AbortSignal.timeout(4_000),
        });
        if (response.status >= 300 && response.status < 400) return true;
        if (response.status !== 400) return null;
        const message = await response.text();
        return /not configured|not enabled|unsupported provider/i.test(message) ? false : null;
    } catch {
        return null;
    }
}

function failureRedirect(origin: string, page: string, code: string) {
    const url = new URL(page, origin);
    url.searchParams.set("error", code);
    return NextResponse.redirect(url);
}

/** Start Google or LinkedIn login through the same GlashDB OAuth/session path. */
export async function startDashboardOAuth(request: NextRequest, provider: DashboardOAuthProvider) {
    let origin: string;
    try {
        origin = requestOrigin(request);
    } catch {
        origin = fallbackOrigin();
    }

    const details = PROVIDER_DETAILS[provider];
    const next = safeOAuthNext(request.nextUrl.searchParams.get("next"));
    const failurePage = oauthFailurePage(next);

    try {
        const enabled = await providerEnabled(provider);
        if (enabled === false) {
            return failureRedirect(origin, failurePage, `${details.errorPrefix}_disabled`);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const glash = (await createClient()) as any;
        const { data, error } = await glash.auth.signInWithOAuth({
            provider,
            options: {
                skipBrowserRedirect: true,
                ...(details.scopes ? { scopes: details.scopes } : {}),
                // This must remain bare because GlashDB matches allowed app
                // callbacks exactly, including the query string.
                redirectTo: `${origin}/auth/callback`,
            },
        });

        if (error || !data?.url) {
            const disabled = /disabled|not enabled|unsupported/i.test(error?.message || "");
            return failureRedirect(
                origin,
                failurePage,
                `${details.errorPrefix}_${disabled ? "disabled" : "start_failed"}`,
            );
        }

        // LinkedIn can be toggled on in Glash while its Client ID/Secret are
        // still absent. Catch that partial configuration before the browser is
        // sent away from CDS Space to a bare API error page.
        if (provider === "linkedin") {
            const configured = await authorizeUrlConfigured(data.url);
            if (configured === false) {
                return failureRedirect(origin, failurePage, "linkedin_disabled");
            }
        }

        const cookieStore = await cookies();
        cookieStore.set("cds_oauth_next", next, {
            httpOnly: true,
            secure: origin.startsWith("https://"),
            sameSite: "lax",
            path: "/",
            maxAge: 600,
        });

        return NextResponse.redirect(data.url);
    } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const disabled = /disabled|not enabled|unsupported/i.test(message);
        return failureRedirect(
            origin,
            failurePage,
            `${details.errorPrefix}_${disabled ? "disabled" : "start_failed"}`,
        );
    }
}
