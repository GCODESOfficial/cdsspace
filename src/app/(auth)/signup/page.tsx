import { SignUpForm } from "@/components/marketing";
import { Suspense } from "react";

/**
 * SignUpPage - 1:1 Figma Implementation of Create Account.
 * The layout is handled by app/(auth)/layout.tsx
 */
export default function SignUpPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <SignUpForm />
        </Suspense>
    );
}
