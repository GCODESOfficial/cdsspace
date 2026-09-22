import { LoginForm } from "@/components/marketing/LoginForm";

/**
 * LoginPage - 1:1 Figma Implementation of Login.
 * The layout is handled by app/(auth)/layout.tsx
 */
export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string; account?: string; next?: string; verified?: string }>;
}) {
    const params = await searchParams;
    const requestedNext = params.next;
    const nextPath = requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
        ? requestedNext
        : "/dashboard";

    return (
        <LoginForm
            oauthErrorParam={params.error || null}
            accountState={params.account === "closed" || params.account === "suspended" ? params.account : null}
            nextPath={nextPath}
            emailVerified={params.verified === "1"}
        />
    );
}
