import HomeHero from "@/components/home-hero"
import ServiceScope from "@/components/service-scope"
import TeamSection from "@/components/team-section"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Partner With Us | CDS Space",
  description: "Let's partner and create magic together",
  openGraph: {
    title: "Partner With Us | CDS Space",
    description: "Let's partner and create magic together",
    url: "https://cdsspace.com/partner",
    type: "website",
    images: [
      {
        url: "/images/About.jpg", // 👈 your custom image here
        width: 1200,
        height: 630,
        alt: "CDSSpace Partner Banner",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Partner With Us | CDS Space",
    description: "Let's partner and create magic together",
    images: ["/images/About.jpg"], // same or optimized for Twitter
  },
};

export default function HomePage() {
  return (
    <main className="flex flex-col min-h-screen pt-20 relative overflow-hidden">
      <HomeHero />
      <ServiceScope />
      <TeamSection />
    </main>
  )
}
