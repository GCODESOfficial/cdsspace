"use client"

import type React from "react"

import { useEffect } from "react"
import Link from "next/link"
import AOS from "aos"

interface ContactItem {
  label: string
  value: string
  link?: string
}

interface SocialItem {
  name: string
  link: string
}

const contactItems: ContactItem[] = [
  {
    label: "Office line:",
    value: "+234-81-028-27049",
    link: "tel:+2348102827049",
  },
  {
    label: "Email:",
    value: "contact.cdsspaces@gmail.com",
    link: "mailto:contact.cdsspaces@gmail.com",
  },
  {
    label: "Office Address:",
    value: "#53 General Edet Akpan Avenue, Uyo, AKS, NG (520101)",
  },
]

const socialItems: SocialItem[] = [
  {
    name: "Instagram",
    link: "https://instagram.com",
  },
  {
    name: "Facebook",
    link: "https://facebook.com",
  },
  {
    name: "TikTok",
    link: "https://tiktok.com",
  },
  {
    name: "X",
    link: "https://x.com",
  },
  {
    name: "LinkedIn",
    link: "https://linkedin.com",
  },
]

export default function ContactInfo() {
  useEffect(() => {
    AOS.init({
      duration: 1000,
      once: true,
    })
  }, [])

  return (
    <div className="space-y-8">
      <div className="space-y-4" data-aos="fade-up">
        {contactItems.map((item, index) => (
          <div key={index} className="flex items-start gap-3">
            <div>
              <div className="text-[#0A4FE8] font-bold text-xl">{item.label}</div>
              {item.link ? (
                <Link href={item.link} className="text-navy-900 hover:text-blue-500 transition-colors">
                  {item.value}
                </Link>
              ) : (
                <div className="text-navy-900">{item.value}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2" data-aos="fade-up" data-aos-delay="200">
        <div className="text-[#0A4FE8] font-bold text-xl">Social Media:</div>
        <div className="flex flex-col gap-1">
          {socialItems.map((item, index) => (
            <Link
              key={index}
              href={item.link}
              className="hover:text-blue-500 transition-colors underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {item.name}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}