import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getClientAccountState, safeClientPath } from "@/lib/client-account";
import { ClientAccountProvider } from "@/components/dashboard/ClientAccountProvider";
import { clientDashboardPath, isLegacyDashboardPath, parseScopedClientDashboardPath } from "@/lib/client-routes";
import { DashboardAutoSave } from "@/components/autosave/DashboardAutoSave";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const account = await getClientAccountState();
    const requestHeaders = await headers();
    const requestedPath = safeClientPath(requestHeaders.get("x-cds-client-path"), "/dashboard");

    if (!account) redirect(`/login?next=${encodeURIComponent(requestedPath)}`);
    if (!account.agreement) redirect(`/agreement?next=${encodeURIComponent(requestedPath)}`);
    if (!account.profile.billing_currency) redirect(`/onboarding?next=${encodeURIComponent(requestedPath)}`);

    const requestedUrl = new URL(requestedPath, "https://client.cdsspace.pro");
    const scopedRoute = parseScopedClientDashboardPath(requestedUrl.pathname);
    if (scopedRoute && scopedRoute.userId !== account.profile.public_user_id.toUpperCase()) {
        redirect(clientDashboardPath(account.profile.public_user_id, `${scopedRoute.dashboardPath}${requestedUrl.search}`));
    }
    if (isLegacyDashboardPath(requestedUrl.pathname)) {
        redirect(clientDashboardPath(account.profile.public_user_id, `${requestedUrl.pathname}${requestedUrl.search}`));
    }

    return (
        <ClientAccountProvider
            initialAccount={{
                userId: account.user.id,
                publicUserId: account.profile.public_user_id,
                email: account.user.email || account.profile.email,
                fullName: account.profile.full_name || account.user.user_metadata?.full_name || "",
                companyName: account.profile.company_name || "",
                phoneNumber: account.profile.phone_number || "",
                avatarUrl: account.profile.avatar_url || null,
                billingCurrency: account.profile.billing_currency,
                createdAt: account.profile.created_at || null,
            }}
        >
            <DashboardAutoSave scope="client" />
            <DashboardShell>{children}</DashboardShell>
        </ClientAccountProvider>
    );
}
