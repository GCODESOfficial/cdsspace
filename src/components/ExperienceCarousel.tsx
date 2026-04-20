"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { supabase } from "@/lib/supabase";
import { getSlugFromTitle } from "@/lib/utils";
import type { Work } from "@/types";

export default function ExperienceCarousel() {
  const [slides, setSlides] = useState<Work[]>([]);
  const [current, setCurrent] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch latest works from database
  useEffect(() => {
    const fetchWorks = async () => {
      try {
        const { data: works, error } = await supabase
          .from("works")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(5);

        if (error) throw error;

        if (works && works.length > 0) {
          setSlides(works);
        }
      } catch (e) {
        console.error("Failed to fetch works from Supabase", e);
        setSlides([]);
      }
    };

    fetchWorks();
  }, []);

  useEffect(() => {
    if (!isHovered && slides.length > 0) {
      intervalRef.current = setInterval(() => {
        setCurrent((prev) => (prev + 1) % slides.length);
      }, 3000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isHovered, slides.length]);
  // ⭐ End of Added Logic

  return (
    <section className="bg-white h-screen text-[#05050D] py-16 px-6 md:px-10 font-plus-jakarta-sans">
      {/* HEADER */}
      <div className="text-center mx-auto mb-12">
        <h2 className="text-3xl md:text-4xl leading-7 font-semibold">
          An{" "}
          <span
            className="bg-[linear-gradient(180deg,#1C4ED1_0%,#0046FF_100%)]
            bg-clip-text text-transparent
            font-[MonotypeCorsivaRegular]
            font-normal
            text-4xl md:text-5xl"
          >
            Unforgettable Experience,
          </span>{" "}
          <br />
          uniquely branded by CDS Space.
        </h2>
        <p className="text-[#000000] text-sm md:text-base leading-relaxed mt-3">
          From visuals to atmosphere, we shaped every detail to make the event
          unforgettable.
        </p>
      </div>

      {/* CAROUSEL */}
      <div
        className="relative max-w-[95%] mx-auto overflow-hidden"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Carousel
          opts={{
            startIndex: current, // ⭐ connects auto-slide to the component
            loop: true,
          }}
          className="w-full"
        >
          <CarouselContent
            className="flex gap-1 transition-transform duration-[900ms] ease-[cubic-bezier(0.33,1,0.68,1)]"
            style={{ transform: `translateX(-${current * 100}%)` }}
          >
            {/* duplicate loop to fake infinite scrolling */}
            {slides.length > 0 && [...Array(2)].map((_, duplicateIndex) =>
              slides.map((slide, i) => {
                const href = `/Works/work/${getSlugFromTitle(slide.title)}`;
                const imageSrc = slide.cover_image || "/placeholder.svg";
                const imageAlt = slide.title || "Work";
                
                return (
                  <CarouselItem
                    key={`${slide.id || i}-${duplicateIndex}`}
                    className="basis-full md:basis-[32%]"
                  >
                    <Link href={href} className="block w-full h-full">
                      <div className="rounded-2xl flex items-center justify-center bg-white relative p-4 aspect-square w-full overflow-hidden">
                        <Image
                          src={imageSrc}
                          alt={imageAlt}
                          fill
                          className="object-cover w-full h-full"
                          sizes="(max-width: 768px) 100vw, 32vw"
                        />
                      </div>
                    </Link>
                  </CarouselItem>
                );
              })
            )}
          </CarouselContent>
        </Carousel>
      </div>
    </section>
  );
}
