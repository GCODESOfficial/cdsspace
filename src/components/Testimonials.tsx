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

const testimonials = [
  {
    logo: '/images/arbitrum.svg',
    name: 'metalmind',
    text: `Their passion, creativity, and attention to detail are contagious - they've got this incredible ability to balance bold ideas with practical know how, resulting in branding that's both beautiful and effective.`,
    emoji: '(💙💛)',
  },
  {
    logo: '/images/love12.svg',
    name: 'Constance Asuquo',
    text: 'Beautiful work from CDS Space, very prompt delivery on unique designs. Highly recommended for all branding services.',
  },
  {
    logo: '/images/citywave.svg',
    name: 'Iberedem Abiah',
    text: 'I’ve had the absolute pleasure of working with Chris John and the talented team at CDS Space on some amazing branding projects. What blows me away is how they can distill the heart and soul of a brand into a visual identity that genuinely connects with people.',
  },
  {
    logo: '/images/teeskitchen.svg',
    name: 'Mi Amor',
    text: 'I must say that I am very honored by how you effortlessly designed my food brand name and logo for me...Keep up the good work! I’m so satisfied with everything you have done for my project!✨🍱💚',
  },
  {
    logo: '/images/lifepith.svg',
    name: 'Rebecca Udom',
    text: 'Excellent service! Timely team, great attention to details and efficient communication. I like how simple yet knowledgeable the designs are.',
  },
  {
    logo: '/images/RTNM.svg',
    name: 'Evangelist Godspromise Anthony',
    text: 'Always delivering excellency.',
  },
  {
    logo: '/images/alkars.svg',
    name: 'Auslean Assams',
    text: 'Literally love their services.. Kudos to Sir Chris',
  },
  {
    logo: '/images/marogha.svg',
    name: 'Precious Oyise',
    text: 'CDS Space will always remain my only option because they give the best designs and they are fast in delivery their jobs. Kudos, CDS Space.',
  }
];

export default function Testimonials() {
  const [current, setCurrent] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isHovered) {
      intervalRef.current = setInterval(() => {
        setCurrent((prev) => (prev + 1) % testimonials.length);
      }, 4000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isHovered]);

  return (
    <section className="pt-32 bg-white">
      <div className="container mx-auto px-4 text-center">
       <div className='flex justify-between items-center mb-14 max-w-6xl mx-auto'>
       <h2 className="text-3xl md:text-5xl font-bold ">Testimonials</h2>
       

       <a
  href="https://g.page/r/CTOux0GUNmChEB0/review"
  target="_blank"
  rel="noopener noreferrer"
>
  <button className="text-sm border px-5 py-2 rounded-full bg-[#040b37] text-white cursor-pointer">
    Write a review
  </button>
</a>


       </div>
        {/* Grid layout on mobile */}
        <div className="grid gap-6 md:hidden">
          {testimonials.map((t, i) => (
            <div
              key={i}
              className="bg-muted p-6 rounded-2xl shadow text-left bg-gradient-to-b from-blue-[#FFFFFF] to-[#DFEAF8]"
            >
              {t.logo && (
                <Image
                  src={t.logo}
                  alt={t.name}
                  width={80}
                  height={80}
                  className="mb-4"
                />
              )}
              <p className="text-gray-700 text-sm mb-4">&quot;{t.text}&quot;</p>
              <p className="font-semibold text-primary">
                – {t.name} {t.emoji ?? ''}
              </p>
            </div>
          ))}
        </div>

        {/* Carousel on md and up */}
        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className="hidden md:block"
        >
          <Carousel
            opts={{ startIndex: current }}
            className="w-full max-w-5xl mx-auto transition-all"
          >
            <CarouselContent>
              {testimonials.map((t, i) => (
                <CarouselItem
                  key={i}
                  className="basis-full md:basis-1/2 lg:basis-1/3 p-4"
                >
                  <div className="bg-muted p-6 py-10 rounded-2xl h-[23rem] bg-gradient-to-b from-blue-[#FFFFFF] to-[#DFEAF8] shadow text-left">
                    {t.logo && (
                      <Image
                        src={t.logo}
                        alt={t.name}
                        width={80}
                        height={80}
                        className="mb-8"
                      />
                    )}
                    <p className="text-gray-700 text-sm mb-7 text-justify">&quot;{t.text}&quot;</p>
                    <p className="font-semibold text-primary tracking-tighter">
                      – {t.name} {t.emoji ?? ''}
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

        <button className="mt-6 inline-flex items-center bg-primary text-white py-2 px-4 rounded-full hover:bg-primary/80">
          Write a review
        </button>
      </div>
    </section>
  );
}