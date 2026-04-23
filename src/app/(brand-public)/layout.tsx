import { Footer } from "@/components/layout/Footer";

/**
 * Layout for public, token-based flows that don't want the marketing Navbar
 * (Brand Briefs, etc.). We still render the Footer so the experience doesn't
 * feel untethered from the rest of the site.
 */
export default function BrandPublicLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <>
            {children}
            <Footer />
        </>
    );
}
