import { LoginForm } from "@/components/marketing";
import { Suspense } from "react";

/**
 * LoginPage - 1:1 Figma Implementation of Login.
 * The layout is handled by app/(auth)/layout.tsx
 */
export default function LoginPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <LoginForm />
        </Suspense>
    );
}
