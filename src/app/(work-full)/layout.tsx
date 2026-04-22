import { Footer } from "@/components/layout/Footer";

/**
 * Layout for the full-page expanded work view.
 * Deliberately omits the marketing Navbar — the in-page header (title + back
 * link) is enough, and we want the project's hero to be the first thing
 * visitors see when they land on a shared link.
 */
export default function WorkFullLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <>
            {children}
            <Footer />
        </>
    );
}
