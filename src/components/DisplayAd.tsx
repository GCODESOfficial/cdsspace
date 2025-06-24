/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import clsx from 'clsx';
import { ArrowLeft, ArrowRight } from 'lucide-react'

interface Ad {
  id: string;
  image_path: string;
  link: string;
}

export default function DisplayAdCarousel() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const fetchAds = async () => {
      const { data, error } = await supabase.from('advertisements').select('*');
      if (error) {
        console.error('Failed to fetch ads:', error);
      } else {
        setAds(data || []);
      }
    };
    fetchAds();
  }, []);

  useEffect(() => {
    if (ads.length === 0) return;
    intervalRef.current = setInterval(() => {
      if (!isPaused) goToNext();
    }, 4000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [ads, isPaused]);

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? ads.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % ads.length);
  };

  const handleMouseEnter = () => setIsPaused(true);
  const handleMouseLeave = () => setIsPaused(false);

  return (
    <section
      className="relative w-full bg-[#EDF0F6]"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleMouseEnter}
      onTouchEnd={handleMouseLeave}
    >
      <div className="mx-auto relative overflow-hidden">
        {/* Carousel */}
        <div className="relative w-full md:h-[400px] h-[180px] overflow-hidden shadow">
          {ads.length === 0 ? (
            <div className="text-center text-gray-400 py-12">No ads available</div>
          ) : (
            <a
              href={ads[currentIndex].link}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full h-full"
            >
              <Image
                src={ads[currentIndex].image_path}
                alt={`Ad ${currentIndex + 1}`}
                width={800} // Set actual width and height (or aspect ratio)
  height={200}
                className="object-cover h-full md:w-screen"
                priority
              />
            </a>
          )}

          {/* Dots inside image */}
          {ads.length > 1 && (
            <div className="absolute md:bottom-5 bottom-2 left-1/2 -translate-x-1/2 flex gap-2 z-20">
              {ads.map((_, index) => (
                <span
                  key={index}
                  className={clsx(
                    'md:h-2 h-1 rounded-full transition-all duration-300',
                    index === currentIndex ? 'md:w-6 w-3 bg-[#D3D3D3]' : 'md:w-2 w-1 bg-white/50'
                  )}
                />
              ))}
            </div>
          )}

          {/* Arrows */}
          {ads.length > 1 && (
            <>
              <button
                onClick={goToPrevious}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-20 md:px-2 md:py-2 p-1 text-[#D3D3D3]  border border-[#D3D3D3] rounded-full hover:scale-110 transition cursor-pointer"
              >
               <ArrowLeft className="md:w-4 md:h-4 w-2 h-2" />
              </button>
              <button
                onClick={goToNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-20 md:px-2 md:py-2 p-1 text-[#D3D3D3] border border-[#D3D3D3] rounded-full hover:scale-110 transition cursor-pointer"
              >
               <ArrowRight className="md:w-4 md:h-4 w-2 h-2" />
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}