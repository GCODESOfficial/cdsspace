import { AuthLayout } from "@/components/layout/AuthLayout";
import { AuthBrandPanel } from "@/components/layout/AuthBrandPanel";

// Auth gateways must always reference the current deployment's client chunks.
// Long-lived static HTML can strand returning devices on removed build assets.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AuthRootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <AuthLayout brand={<AuthBrandPanel />}>
            {children}
        </AuthLayout>
    );
}
