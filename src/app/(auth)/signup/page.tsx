import { SignUpForm } from "@/components/marketing/SignUpForm";

/**
 * SignUpPage - 1:1 Figma Implementation of Create Account.
 * The layout is handled by app/(auth)/layout.tsx
 */
export default async function SignUpPage({
    searchParams,
}: {
    searchParams: Promise<{ next?: string; email?: string; client_invite?: string }>;
}) {
    const params = await searchParams;
    const requestedNext = params.next;
    const nextPath = requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
        ? requestedNext
        : "/dashboard";

    return (
        <SignUpForm
            nextPath={nextPath}
            invitedEmail={params.email || ""}
            clientInvite={params.client_invite || null}
        />
    );
}
