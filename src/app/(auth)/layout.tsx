import { AuthLayout } from "@/components/layout/AuthLayout";
import { AuthBrandPanel } from "@/components/layout/AuthBrandPanel";

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
