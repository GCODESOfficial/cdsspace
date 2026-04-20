"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";

export default function AboutUs() {
  const images = [
    { id: 0, src: "/images/camera.svg", alt: "Camera" },
    { id: 1, src: "/images/person2.svg", alt: "People at event" },
  ];

  const [activeId, setActiveId] = useState(0);
  const [hoverId, setHoverId] = useState<number | null>(null);

  const getDisplayId = () => (hoverId !== null ? hoverId : activeId);

  return (
    <section className="min-h-screen flex flex-col md:flex-row items-center justify-center gap-12 md:gap-25 bg-[#040B37] px-6 md:px-20 py-20 md:py-14 font-plus-jakarta-sans">
      {/* LEFT TEXT SECTION */}
      <div className="w-full md:w-2/5 max-w-xl text-left space-y-4">
        <h2 className="text-xl text-white md:text-4xl font-semibold leading-none">
          Built Around{" "}
          <span className="text-[#2458E8]  text-3xl md:text-5xl font-normal font-[MonotypeCorsivaRegular]">
            People,
          </span><br />
          Driven by Design
        </h2>

        <p className="text-gray-300 text-base md:text-xl leading-relaxed">
          The CDS Space community brings together creators, thinkers, and brands
          shaping what design means today.
        </p>

        <Link
          href="/About"
          className="inline-block mt-4 px-6 py-3 bg-[#2458E8] hover:bg-[#1E47C5] text-white text-sm md:text-base font-medium rounded-full transition-all"
        >
          About Us
        </Link>
      </div>

      {/* IMAGE SECTION */}
      <div className="flex flex-col md:flex-row w-full md:w-3/5 max-w-3xl overflow-hidden gap-2 md:gap-4 h-full md:h-[350px]">
        {images.map((img) => {
          const isActive = getDisplayId() === img.id;

          return (
            <div
              key={img.id}
              className={clsx(
                "cursor-pointer overflow-hidden rounded-xl transition-all duration-700 ease-in-out",
                isActive ? "basis-1/2" : "basis-1/3"
              )}
              onMouseEnter={() => {
                if (window.innerWidth >= 768) setHoverId(img.id);
              }}
              onMouseLeave={() => {
                if (window.innerWidth >= 768) setHoverId(null);
              }}
              onClick={() => {
                if (window.innerWidth < 768) setActiveId(img.id);
              }}
            >
              <Image
                src={img.src}
                alt={img.alt}
                width={800}
                height={600}
                className="object-cover w-full h-full transition-all duration-700 ease-in-out"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
