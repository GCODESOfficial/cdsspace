import Image from "next/image"
import type { Metadata } from "next"
import ContactInfo from "@/components/contact-info"
import MapSection from "@/components/map-section"

export const metadata: Metadata = {
  title: "Contact Us | CDS Spaces",
  description: "Get in touch with our team",
}

export default function ContactPage() {
  return (
    <main className="flex flex-col min-h-screen text-[#040b37]">
      <div className="container mx-auto py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center md:px-40 px-8 border-b-2 py-32 border-gray-400">
          <div className="space-y-4" data-aos="fade-right" data-aos-duration="1000">
            <div className="md:text-8xl text-7xl font-extrabold">
              <h1>Let&apos;s</h1>
              <h1 className="">Partner</h1>
            </div>
            <p className="text-xl text-blue-500">and create magic together</p>
          </div>
          <div className="relative h-[300px] md:h-[400px]" data-aos="fade-left" data-aos-duration="1000">
            <Image src="/images/contacts.svg" alt="Partner banners" fill className="object-cover rounded-md" />
          </div>
        </div>

        <div className="mt-20 md:px-40 px-8">
          <ContactInfo />
        </div>

        <div className="mt-16">
          <MapSection />
        </div>
      </div>
    </main>
  )
}