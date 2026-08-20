import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { MarketingAssetProtection } from "@/components/marketing/MarketingAssetProtection";

export default function MarketingLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <>
            <MarketingAssetProtection />
            <Navbar />
            {children}
            <Footer />
        </>
    );
}
