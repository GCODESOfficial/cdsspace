/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { motion } from 'framer-motion';
import chroma from 'chroma-js';
import clsx from 'clsx';
import { ArrowUpRight } from 'lucide-react';

interface Work {
  id: number;
  title: string;
  description: string;
  cover_image?: string;
  created_at: string;
}

export default function LinksClonePage() {
  const [projects, setProjects] = useState<Work[]>([]);
  const [virtualIndex, setVirtualIndex] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const backgroundColors = ['#EDF0F6', '#FFF7E5', '#F0EBFF', '#FFEFEF', '#E6FFF2'];
  const [scrollBgColor, setScrollBgColor] = useState(backgroundColors[0]);

  const visibleCardCount = projects.length;
  const centerOffset = Math.floor(visibleCardCount / 2);

  useEffect(() => {
    const fetchProjects = async () => {
      const { data, error } = await supabase.from('works').select('*').order('created_at');
      if (!error && data) setProjects(data);
    };
    fetchProjects();
  }, []);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      setScrollY((prev) => prev + e.deltaY);
    };

    let touchStartY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touchY = e.touches[0].clientY;
      const deltaY = touchStartY - touchY;
      setScrollY((prev) => prev + deltaY);
      touchStartY = touchY;
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  useEffect(() => {
    const itemHeight = window.innerHeight * 0.33;
    const rawIndex = scrollY / itemHeight;
    setVirtualIndex(rawIndex);

    const base = Math.floor(rawIndex);
    const progress = rawIndex - base;
    const fromColor = backgroundColors[base % backgroundColors.length];
    const toColor = backgroundColors[(base + 1) % backgroundColors.length];

    if (!fromColor || !toColor) {
      console.error('Invalid color values:', { fromColor, toColor });
      return;
    }

    const interpolatedColor = chroma.mix(fromColor, toColor, progress, 'rgb').hex();
    setScrollBgColor(interpolatedColor);
  }, [scrollY]);

  const getCircularIndex = (index: number) => {
    const length = projects.length;
    return ((index % length) + length) % length;
  };

  const toggleMenu = () => setMenuOpen((prev) => !prev);

  // Get the current year dynamically
  const currentYear = new Date().getFullYear();

  return (
    <div
      className="relative w-full min-h-screen pt-40 text-[#020839] transition-colors duration-500 overflow-hidden"
      style={{ backgroundColor: scrollBgColor }}
    >
      {/* Current year at the top center */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center">
        <p className="text-xl font-bold">{currentYear}</p>
      </div>

      {/* Brand logo at the top left */}
      <div className="absolute top-2 left-5 z-10">
        <img src="/images/CDS Space logo.svg" alt="Brand Logo" className="w-14 h-14" />
      </div>

      {/* Center image */}
      <div className="fixed inset-0 z-30 pointer-events-none flex md:items-center md:justify-center items-start justify-end mt-14 mr-5 md:mt-0 md:mr-0">
        {projects.length > 0 && (
          <motion.img
            key={getCircularIndex(Math.round(virtualIndex))}
            src={projects[getCircularIndex(Math.round(virtualIndex))].cover_image || '/placeholder.svg'}
            alt={projects[getCircularIndex(Math.round(virtualIndex))].title}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
            className="max-h-[80vh] md:w-4/12 w-6/12 object-contain shadow-lg"
          />
        )}
      </div>

      {/* Blur overlay */}
      {menuOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]"
          onClick={toggleMenu}
        />
      )}

      {/* Menu modal */}
      {menuOpen && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-[101] flex">
          <div
            className="flex flex-col bg-white rounded-xl overflow-hidden shadow-lg"
            style={{
              width: '375px',
              height: '285px',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
            }}
          >
            {[
              ['https://www.cdsspace.com/', 'cdsspace.com'],
              ['https://www.instagram.com/cdsspace', 'Instagram'],
              ['https://linktr.ee/cdsspace', 'LinkedIn'],
              ['https://twitter.com/cdsspace_', 'X'],
              ['https://www.pinterest.com/cdsspace_/', 'Pinterest'],
              ['https://web.facebook.com/cdsspace', 'Facebook'],
            ].map(([link, label, icon]) => (
              <a
                key={label}
                href={link}
                target="_blank"
                className="flex items-center justify-between p-[15px_20px] border-b border-black/10 text-black no-underline transition-colors duration-200 hover:bg-black/5"
                rel="noreferrer"
              >
                <div className="flex items-center">
                  <h3 className="text-sm font-medium m-0">{label}</h3>
                </div>
                <ArrowUpRight size={24} className='text-[#020839]'/>
              </a>
            ))}
            <div className="h-[15px] border-b-0"></div>
          </div>
        </div>
      )}

      {/* Menu button */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[102]">
        <div
          className="flex items-center justify-between bg-[#020839] text-white rounded-full px-7 py-2.5 cursor-pointer w-[120px] h-[50px]"
          onClick={toggleMenu}
          style={{ boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)' }}
        >
          <h4 className="text-base font-medium m-0">Menu</h4>
          <h4
            className="text-xl font-medium m-0 transition-transform duration-300"
            style={{
              transform: menuOpen ? 'rotateZ(45deg)' : 'rotateZ(0deg)',
            }}
          >
            +
          </h4>
        </div>
      </div>

      {/* Right aligned vertical cards */}
      <div className="fixed right-10 top-1/2 transform -translate-y-1/2 z-20 flex flex-col items-end gap-4 h-[80vh] justify-center">
        {Array.from({ length: visibleCardCount }).map((_, i) => {
          const relativeOffset = i - centerOffset;
          const effectiveIndex = getCircularIndex(Math.round(virtualIndex) + relativeOffset);
          const project = projects[effectiveIndex];
          if (!project) return null;

          const distance = Math.abs(relativeOffset);
          const scale = 1 - distance * 0.05;
          const opacity = 1 - distance * 0.25;
          const marginTop = i === 0 ? 'mt-40' : 'mt-0';

          return (
            <motion.div
              key={`visible-${effectiveIndex}`}
              style={{
                transform: `scale(${scale})`,
                opacity,
                transition: 'transform 0.3s ease, opacity 0.3s ease',
                marginTop,
              }}
            >
              <TitleBlock project={project} isActive={relativeOffset === 0} />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function TitleBlock({
  project,
  isActive,
}: {
  project: Work;
  isActive: boolean;
}) {
  return (
    <div
      className={clsx(
        'w-72 h-28 text-center md:text-left flex flex-col justify-center px-4 transition-all duration-300 rounded-lg',
        isActive ? 'opacity-100 bg-white scale-105' : 'bg-gray-400'
      )}
    >
      <h2 className="text-3xl md:text-2xl font-bold mb-1">{project.title}</h2>
      <p className="text-lg md:text-base font-bold whitespace-pre-line">
        {project.description || 'No description.'}
      </p>
    </div>
  );
}
