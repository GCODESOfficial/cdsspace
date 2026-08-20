import { LoginForm } from "@/components/marketing";
import { Suspense } from "react";

/**
 * LoginPage - 1:1 Figma Implementation of Login.
 * The layout is handled by app/(auth)/layout.tsx
 */
export default function LoginPage() {
    return (
        <Suspense fallback={<div className="grid min-h-[420px] w-full place-items-center"><span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-blue/30 border-t-brand-blue" /></div>}>
            <LoginForm />
        </Suspense>
    );
}
