import { AuthLayout } from "@/components/layout/AuthLayout";

export default function AuthRootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <AuthLayout>
            {children}
        </AuthLayout>
    );
}
