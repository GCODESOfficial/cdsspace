/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import clsx from 'clsx';

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
      <div className="max-w-7xl mx-auto relative overflow-hidden">
        {/* Carousel */}
        <div className="relative w-full h-[400px] overflow-hidden shadow">
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
                fill
                className="object-cover w-full h-full"
                priority
              />
            </a>
          )}

          {/* Dots inside image */}
          {ads.length > 1 && (
            <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex gap-2 z-20">
              {ads.map((_, index) => (
                <span
                  key={index}
                  className={clsx(
                    'h-2 rounded-full transition-all duration-300',
                    index === currentIndex ? 'w-6 bg-white' : 'w-2 bg-white/50'
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
                className="absolute left-4 top-1/2 -translate-y-1/2 z-20 px-2 py-1 text-white border border-white rounded-full hover:scale-110 transition cursor-pointer"
              >
                ←
              </button>
              <button
                onClick={goToNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-20 px-2 py-1 text-white border border-white rounded-full hover:scale-110 transition cursor-pointer"
              >
                →
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}