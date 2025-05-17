import HomeHero from "@/components/home-hero"
import ServiceScope from "@/components/service-scope"
import TeamSection from "@/components/team-section"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Partner With Us | CDS Spaces",
  description: "Let's partner and create magic together",
}

export default function HomePage() {
  return (
    <main className="flex flex-col min-h-screen pt-20">
      <HomeHero />
      <ServiceScope />
      <TeamSection />
    </main>
  )
}
