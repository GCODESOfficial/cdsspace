"use client";

import dynamic from "next/dynamic";
import { LocationHero } from "@/components/marketing";


const MapSection = dynamic(() => import("@/components/marketing/MapSection").then(mod => mod.MapSection), {
    ssr: false,
    loading: () => <div className="w-full h-[840px] bg-brand-bg/50 animate-pulse rounded-[40px] flex items-center justify-center text-brand-body/40">Loading Map...</div>
});

/**
 * LocationPage - High-fidelity implementation of the CDS Uyo maps page.
 */
export default function LocationPage() {
    return (
        <main className="min-h-screen selection:bg-brand-blue selection:text-white bg-brand-bg relative">
            <LocationHero />

            <MapSection />
        </main>
    );
}
