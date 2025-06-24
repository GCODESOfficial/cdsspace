/* eslint-disable @typescript-eslint/no-unused-vars */
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
    name: "Edidiong Emmanuel",
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
]

export default function TeamSection() {
  useEffect(() => {
    AOS.init({
      duration: 1000,
      once: true,
    })
  }, [])

  return (
    <section className="pb-32 bg-[#f5f5f5] text-black relative">
			           <div className="md:h-[32rem] md:w-[32rem] h-[28rem] w-[28rem] rounded-full border-28 border-[#D9D9D9] absolute top-0 -left-80"></div>

      <div className="container mx-auto px-4">
        <div className="text-center  mb-12">
          <h2 className="md:text-5xl text-2xl font-extrabold text-[#040b37]  mb-4" data-aos="fade-up">
            Meet Our Team
          </h2>
          <p className="text-black max-w-3xl mx-auto text-sm md:text-base" data-aos="fade-up" data-aos-delay="100">
          Meet our team of talented experts who understand that every brand is unique and requires its own identity, we offer services tailored to meet your brand&apos;s needs and objectives.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 md:gap-12 pt-28 md:px-32 px-8" data-aos="fade-up" data-aos-delay="200">
          {teamMembers.map((member, index) => (
            <div key={index} className="text-center md:text-left" data-aos="fade-up" data-aos-delay={200 + index * 100}>
              <div className="relative h-[23rem] mb-4 bg-black rounded-md overflow-hidden">
                {/* <Image src={member.image || "/placeholder.svg"} alt={member.name} fill className="object-cover" /> */}
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