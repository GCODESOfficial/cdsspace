'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';

interface Testimonial {
  id: string;
  name: string;
  review: string;
  picture_url: string | null;
  created_at: string;
}

export default function Testimonials() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [current, setCurrent] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    async function fetchTestimonials() {
      const { data } = await supabase
        .from('testimonials')
        .select('*')
        .order('created_at', { ascending: true });
      if (data) setTestimonials(data);
    }
    fetchTestimonials();
  }, []);

  useEffect(() => {
    if (!isHovered && testimonials.length > 0) {
      intervalRef.current = setInterval(() => {
        setCurrent((prev) => (prev + 1) % testimonials.length);
      }, 4000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isHovered, testimonials.length]);

  if (testimonials.length === 0) return null;

  return (
    <section className="md:pt-32 pt-20 bg-white px-5 md:px-24 w-screen overflow-hidden">
      <div className="w-full text-center">
        <div className="flex md:flex-row flex-col justify-between items-center mb-14 w-full">
          <h2 className="text-5xl font-bold">Testimonials</h2>

          <a
            href="https://g.page/r/CTOux0GUNmChEB0/review"
            target="_blank"
            rel="noopener noreferrer"
          >
            <button className="w-xs md:w-auto text-sm border md:px-5 py-2 rounded-full bg-[#040b37] text-white cursor-pointer mt-4 md:mt-0">
              Write a review
            </button>
          </a>
        </div>

        {/* Grid layout on mobile */}
        <div className="grid gap-6 md:hidden">
          {testimonials.map((t) => (
            <div
              key={t.id}
              className="bg-muted p-6 rounded-2xl shadow text-left bg-gradient-to-b from-[#FFFFFF] to-[#DFEAF8]"
            >
              {t.picture_url ? (
                <Image
                  src={t.picture_url}
                  alt={t.name}
                  width={80}
                  height={80}
                  className="mb-4 rounded-full object-cover w-20 h-20"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gray-300 flex items-center justify-center text-2xl font-bold text-gray-600 mb-4">
                  {t.name.charAt(0).toUpperCase()}
                </div>
              )}
              <p className="text-gray-700 text-sm mb-4">&quot;{t.review}&quot;</p>
              <p className="font-semibold text-primary">– {t.name}</p>
            </div>
          ))}
        </div>

        {/* Carousel layout on desktop */}
        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className="hidden md:block"
        >
          <Carousel
            opts={{ startIndex: current }}
            className="w-full mx-auto transition-all"
          >
            <CarouselContent>
              {testimonials.map((t) => (
                <CarouselItem
                  key={t.id}
                  className="basis-full md:basis-1/2 lg:basis-1/3 p-4"
                >
                  <div className="bg-muted p-6 py-10 rounded-2xl h-[23rem] bg-gradient-to-b from-[#FFFFFF] to-[#DFEAF8] shadow text-left">
                    {t.picture_url ? (
                      <Image
                        src={t.picture_url}
                        alt={t.name}
                        width={80}
                        height={80}
                        className="mb-8 rounded-full object-cover w-20 h-20"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-gray-300 flex items-center justify-center text-2xl font-bold text-gray-600 mb-8">
                        {t.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <p className="text-gray-700 text-sm mb-7 text-justify">
                      &quot;{t.review}&quot;
                    </p>
                    <p className="font-semibold text-primary tracking-tighter">
                      – {t.name}
                    </p>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <div className="flex justify-center gap-4 mt-4">
              <CarouselPrevious />
              <CarouselNext />
            </div>
          </Carousel>
        </div>

        {/* Secondary CTA Button */}
        <div className="mt-6">
          <a
            href="https://g.page/r/CTOux0GUNmChEB0/review"
            target="_blank"
            rel="noopener noreferrer"
          >
            <button className="inline-flex items-center bg-primary text-white py-2 px-4 rounded-full hover:bg-primary/80">
              Write a review
            </button>
          </a>
        </div>
      </div>
    </section>
  );
}
