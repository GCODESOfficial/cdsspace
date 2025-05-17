"use client"

import { useEffect } from "react"
import Image from "next/image"
import AOS from "aos"

interface TeamMember {
  name: string
  position: string
  image: string
}

const teamMembers: TeamMember[] = [
  {
    name: "Chris John",
    position: "Chief Executive Officer",
    image: "/images/team 1.svg",
  },
  {
    name: "Hepzibah Demas",
    position: "Managing Director",
    image: "/images/team-2.png",
  },
  {
    name: "Lucy Monday",
    position: "Product Manager",
    image: "/images/team-3.png",
  },
  {
    name: "Ayomide Ajayi",
    position: "Creative Director",
    image: "/images/team-4.png",
  },
  {
    name: "Godsgift  Etuk",
    position: "Web/Blockchain Developer",
    image: "/images/team-5.png",
  },
  {
    name: "Abasi-amayanga Sunday",
    position: "Sales Representative",
    image: "/images/team-5.png",
  }
]

export default function TeamSection() {
  useEffect(() => {
    AOS.init({
      duration: 1000,
      once: true,
    })
  }, [])

  return (
    <section className="pb-32 bg-[#f5f5f5] text-black">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-3xl font-extrabold text-[#040b37]  mb-4" data-aos="fade-up">
            Meet Our Team
          </h2>
          <p className="text-black max-w-3xl mx-auto" data-aos="fade-up" data-aos-delay="100">
          Meet our team of talented experts who understand that every brand is unique and requires its own identity, we offer services tailored to meet your brand&apos;s needs and objectives.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 pt-14 md:px-40 px-8" data-aos="fade-up" data-aos-delay="200">
          {teamMembers.map((member, index) => (
            <div key={index} className="text-center" data-aos="fade-up" data-aos-delay={200 + index * 100}>
              <div className="relative h-[25rem] mb-4 bg-gray-100 rounded-md overflow-hidden">
                <Image src={member.image || "/placeholder.svg"} alt={member.name} fill className="object-cover" />
              </div>
              <h3 className="font-semibold text-lg text-navy-900">{member.name}</h3>
              <p className="text-gray-600">{member.position}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}