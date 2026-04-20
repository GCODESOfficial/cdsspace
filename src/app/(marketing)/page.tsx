import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Hero } from "@/components/marketing/Hero";

// Above the fold — load eagerly so the user sees content instantly.
// Everything else streams in via dynamic() with a small placeholder so
// the initial JS payload stays small and the page is interactive fast.
const SectionSkeleton = () => (
  <div className="w-full py-24 flex items-center justify-center">
    <div className="w-12 h-12 rounded-full border-2 border-brand-blue/20 border-t-brand-blue animate-spin" />
  </div>
);

const WhatWeBring = dynamic(() => import("@/components/marketing/WhatWeBring").then(m => ({ default: m.WhatWeBring })), { loading: SectionSkeleton });
const HowItWorksBig = dynamic(() => import("@/components/marketing/HowItWorksBig").then(m => ({ default: m.HowItWorksBig })), { loading: SectionSkeleton });
const HelpingBrands = dynamic(() => import("@/components/marketing/HelpingBrands").then(m => ({ default: m.HelpingBrands })), { loading: SectionSkeleton });
const Works = dynamic(() => import("@/components/marketing/Works").then(m => ({ default: m.Works })), { loading: SectionSkeleton });
const Brands = dynamic(() => import("@/components/marketing/Brands").then(m => ({ default: m.Brands })), { loading: SectionSkeleton });
const CTA = dynamic(() => import("@/components/marketing/CTA").then(m => ({ default: m.CTA })), { loading: SectionSkeleton });
const Comparison = dynamic(() => import("@/components/marketing/Comparison").then(m => ({ default: m.Comparison })), { loading: SectionSkeleton });
const Pricing = dynamic(() => import("@/components/marketing/Pricing").then(m => ({ default: m.Pricing })), { loading: SectionSkeleton });
const Testimonials = dynamic(() => import("@/components/marketing/Testimonials").then(m => ({ default: m.Testimonials })), { loading: SectionSkeleton });
const DisplayAdCarousel = dynamic(() => import("@/components/DisplayAd"), { loading: SectionSkeleton });
const Faqs = dynamic(() => import("@/components/marketing/Faqs").then(m => ({ default: m.Faqs })), { loading: SectionSkeleton });

export const metadata: Metadata = {
  title: "CDS Space — Branding Agency | Brand Identity, Web Development & Industrial Print",
  description: "CDS Space is a full-service branding agency helping forward-thinking brands build iconic identities. We offer brand identity design, UI/UX, web development, industrial print production, and brand consultancy.",
  alternates: { canonical: "https://cdsspace.pro" },
  openGraph: {
    title: "CDS Space — Full-Service Branding Agency",
    description: "From strategy to execution, we design digital brands that scale, convert, and stay consistent. Brand identity, UI/UX, web development, and industrial print.",
    url: "https://cdsspace.pro",
    type: "website",
    images: [{ url: "/navbar/CDS Logo.svg", width: 1200, height: 630, alt: "CDS Space Branding Agency" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "CDS Space — Full-Service Branding Agency",
    description: "Brand identity, UI/UX, web development, and industrial print production services.",
    images: ["/navbar/CDS Logo.svg"],
  },
};

export default function Home() {
  return (
    <main className="min-h-screen selection:bg-brand-blue selection:text-white bg-brand-bg">
      <Hero />
      <WhatWeBring />
      <HowItWorksBig />
      <HelpingBrands />
      <Works />
      <Brands />
      <CTA />
      <Comparison />
      <Pricing />
      <Testimonials />
      <DisplayAdCarousel />
      <Faqs />
    </main>
  );
}
