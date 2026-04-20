/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import clsx from 'clsx';
import { ArrowLeft, ArrowRight } from 'lucide-react';

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
      className="relative w-full bg-brand-bg px-4 py-8 md:px-6 md:py-12"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleMouseEnter}
      onTouchEnd={handleMouseLeave}
    >
      <div className="mx-auto w-full max-w-[1320px]">
        <div className="relative overflow-hidden rounded-[24px] border border-[#D9E1F2] bg-white p-2 shadow-[0_24px_60px_rgba(4,11,55,0.08)] md:rounded-[32px] md:p-3">
          {/* Carousel */}
          <div className="relative h-[180px] w-full overflow-hidden rounded-[20px] bg-[#0A1246] md:h-[400px] md:rounded-[28px]">
            {ads.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-gray-400">No ads available</div>
            ) : (
              <a
                href={ads[currentIndex].link}
                target="_blank"
                rel="noopener noreferrer"
                className="block h-full w-full"
              >
                <Image
                  src={ads[currentIndex].image_path}
                  alt={`Ad ${currentIndex + 1}`}
                  width={800}
                  height={200}
                  className="h-full w-full object-cover"
                  priority
                />
              </a>
            )}

            {/* Dots inside image */}
            {ads.length > 1 && (
              <div className="absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 gap-2 md:bottom-5">
                {ads.map((_, index) => (
                  <span
                    key={index}
                    className={clsx(
                      'h-1 rounded-full transition-all duration-300 md:h-2',
                      index === currentIndex ? 'w-3 bg-[#D3D3D3] md:w-6' : 'w-1 bg-white/50 md:w-2'
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
                  className="absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/40 bg-[#08103D]/35 p-1 text-white backdrop-blur-sm transition hover:scale-105 md:left-5 md:px-2 md:py-2"
                >
                  <ArrowLeft className="h-2 w-2 md:h-4 md:w-4" />
                </button>
                <button
                  onClick={goToNext}
                  className="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/40 bg-[#08103D]/35 p-1 text-white backdrop-blur-sm transition hover:scale-105 md:right-5 md:px-2 md:py-2"
                >
                  <ArrowRight className="h-2 w-2 md:h-4 md:w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
