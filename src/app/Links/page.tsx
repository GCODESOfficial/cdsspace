/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import chroma from 'chroma-js';
import clsx from 'clsx';
import { ArrowUpRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getSlugFromTitle } from '@/lib/utils'; // Adjust this import path to where your function lives



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

  const backgroundColors = ['#E3F9FF', '#DCE5FF', '#A6D3FF', '#D4D5FF', '#FFE5E5', '#D9ECFF', '#EEE2FF', '#DAEDFF', '#FDFDFE'];
  const [scrollBgColor, setScrollBgColor] = useState(backgroundColors[0]);

  // Use a safe fallback for projects array to avoid undefined errors
  const safeProjects = projects || [];
  const router = useRouter();


  const handleWorkClick = (work: Work) => {
    const titleSlug = getSlugFromTitle(work.title);
    router.push(`/Works/work/${titleSlug}`);
  };
  

  useEffect(() => {
    const fetchProjects = async () => {
      const { data, error } = await supabase.from('works').select('*').order('created_at');
      if (!error && data) setProjects(data);
    };
    fetchProjects();
  }, []);

  useEffect(() => {
    let touchStartY = 0;
    let isTouching = false;
    let velocity = 0;
    let animationFrame: number;
  
    const applyInertia = () => {
      if (Math.abs(velocity) < 0.5) return; // Stop earlier
  
      setScrollY(prev => prev + velocity);
      velocity *= 0.82; // More resistance
      animationFrame = requestAnimationFrame(applyInertia);
    };
  
    const handleTouchStart = (e: TouchEvent) => {
      isTouching = true;
      touchStartY = e.touches[0].clientY;
      cancelAnimationFrame(animationFrame);
      velocity = 0;
    };
  
    const handleTouchMove = (e: TouchEvent) => {
      if (!isTouching) return;
  
      const currentY = e.touches[0].clientY;
      const deltaY = touchStartY - currentY;
  
      // Cap the velocity to prevent skipping too many projects
      velocity = Math.max(-25, Math.min(25, deltaY * 1.5)); // more responsive
// Max movement per frame
  
      setScrollY(prev => prev + velocity);
      touchStartY = currentY;
    };

    
  
    const handleTouchEnd = () => {
      isTouching = false;
      animationFrame = requestAnimationFrame(applyInertia);
    };
  
    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: false });
  
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);
  
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      setScrollY(prev => prev + e.deltaY);
    };
  
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', handleWheel);
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
    const length = safeProjects.length;
    return ((index % length) + length) % length;
  };

  const toggleMenu = () => setMenuOpen((prev) => !prev);

  const currentYear = new Date().getFullYear();

  // Active index rounded
  const activeIdx = Math.round(virtualIndex);

  // Calculate top pile indices - 2 previous cards
  const topPileIndices = [activeIdx - 1, activeIdx - 2].map(getCircularIndex);

 // Bottom pile is next 3 upcoming cards after active, wrapped circularly
const bottomPileIndices = [];
for (let i = activeIdx + 1; i <= activeIdx + 3; i++) {
  bottomPileIndices.push(getCircularIndex(i));
}


 



  return (
    <div
      className="md:relative fixed w-full min-h-screen md:pt-40 pt-3 text-[#020839] transition-colors duration-500 overflow-hidden"
      style={{ backgroundColor: scrollBgColor }}
    >

<div className="fixed md:static flex justify-between w-full items-center px-3 md:px-0">
  {/* Logo */}
  <div className="md:absolute top-5 left-5 z-10">
    <img src="/images/Links.svg" alt="Brand Logo" className="md:w-40 w-28" />
  </div>

  {/* Year */}
  <div className="md:absolute top-5 left-1/2 md:-translate-x-1/2 z-10 flex flex-col items-center">
    <p className="text-xl font-bold">{currentYear}</p>
  </div>
</div>


      {/* Center Image */}
      <div className="fixed inset-0 z-30 pointer-events-none flex md:items-center justify-center items-start  mt-24 md:mt-0">
        {safeProjects.length > 0 && (
          <motion.img
          key={getCircularIndex(activeIdx)}
          src={`${safeProjects[getCircularIndex(activeIdx)].cover_image}?width=800`}
          srcSet={`
            ${safeProjects[getCircularIndex(activeIdx)].cover_image}?width=800 800w,
            ${safeProjects[getCircularIndex(activeIdx)].cover_image}?width=1600 1600w,
            ${safeProjects[getCircularIndex(activeIdx)].cover_image}?width=2400 2400w
          `}
          sizes="(max-width: 768px) 90vw, 50vw"
          alt={safeProjects[getCircularIndex(activeIdx)].title}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          className="md:max-h-[80vh] md:h-full h-52 md:w-4/12 w-9/12 md:object-contain object-cover"
        />
        
        )}
      </div>

      {/* Menu overlay */}
      {menuOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]"
          onClick={toggleMenu}
        />
      )}

      {/* Menu modal */}
      <AnimatePresence>
  {menuOpen && (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1, transition: { type: 'spring', stiffness: 500, damping: 30 } }}
      exit={{ y: 100, opacity: 0, transition: { duration: 0.2 } }}
      className="fixed bottom-16 left-1/2 -translate-x-1/2 z-[101] flex px-8 w-screen md:w-auto md:px-0"
    >
      <div
        className="flex flex-col bg-white rounded-xl overflow-hidden shadow-lg md:w-[375px] w-screen"
        style={{
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        }}
      >
        {[
          ['https://www.cdsspace.com/', 'cdsspace.com'],
          ['https://www.instagram.com/cdsspace', 'Instagram'],
          ['https://linktr.ee/cdsspace', 'LinkedIn'],
          ['https://twitter.com/cdsspace_', 'X'],
          ['https://web.facebook.com/cdsspace', 'Facebook'],
          ['https://www.tiktok.com/@cdsspace_', 'TikTok'],
          ['https://www.youtube.com/@cdsspacelive', 'Youtube'],
          ['https://wa.me/message/V7K4SBQW7METG1', 'WhatsApp'],
        ].map(([link, label]) => (
          <a
            key={label}
            href={link}
            target="_blank"
            className="flex items-center justify-between p-[10px_20px] border-b border-black/10 text-black no-underline transition-colors duration-200 hover:bg-black/5"
            rel="noreferrer"
          >
            <div className="flex items-center">
              <h3 className="text-sm font-medium m-0">{label}</h3>
            </div>
            <ArrowUpRight size={24} className="text-[#020839]" />
          </a>
        ))}
      </div>
    </motion.div>
  )}
</AnimatePresence>


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


      <div className='flex w-full justify-center'>

      {/* Right side stacked piles */}
      <div
        className="fixed md:right-10  md:top-1/2 top-3/4 z-20 flex flex-col md:items-end justify-center"
        style={{ height: '90vh', transform: 'translateY(-50%)', position: 'fixed' }}
      >

        {/* TOP PILE - stacked above active */} 
        <div className="relative w-72 h-32 md:mb-24 mb-10 md:flex justify-center hidden">
          <AnimatePresence initial={false}>
            {topPileIndices.map((idx, i) => {
              const project = safeProjects[idx];
              if (!project) return null;

              const isTopCard = i === 0;
  const zIndex = isTopCard ? 10 : i; // i = 0 should be visually on top
  const topOffset = isTopCard ? 20 : 0; // i = 0 is visually lower

              return (
                <motion.div
                  key={`top-pile-${project.id}`}
                  onClick={() => handleWorkClick(project)}
                  className={clsx(
                    'absolute md:w-72 w-11/12 h-28 rounded-lg shadow-lg cursor-pointer hover:opacity-90 transition-opacity',
                    isTopCard
                      ? 'bg-[#faf7ffde] text-black md:-left-4'
                      : 'bg-gray-300/4 text-black/1',
                  )}
                  style={{
                    top: `${topOffset}px`,
                    zIndex,
                    filter: 'drop-shadow(0 2px 6px rgb(0 0 0 / 0.15))',
                  }}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.5 }}
                >
                  <h4 className="font-bold text-lg line-clamp-1 px-4 pt-4 opacity-50">{project.title}</h4>
                  <p className="px-4 pt-2 text-sm line-clamp-2 opacity-50">{project.description}</p>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>



<AnimatePresence mode="wait">

  <motion.div
    key={safeProjects[getCircularIndex(activeIdx)]?.id}
    onClick={() => handleWorkClick(safeProjects[getCircularIndex(activeIdx)])}
    className="relative w-72 md:h-32 h-28 bg-white rounded-lg shadow-lg px-4 py-4 text-black  z-50 cursor-pointer hover:opacity-90 transition-opacity"
    initial={{ opacity: 0, y: 35 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -100 }}
    transition={{ duration: 0.4, ease: 'easeInOut' }}
  >
    
      <h4 className="font-bold text-lg line-clamp-1">
        {safeProjects[getCircularIndex(activeIdx)]?.title}
      </h4>
      <p className="text-sm line-clamp-2 pt-2">
        {safeProjects[getCircularIndex(activeIdx)]?.description}
      </p>
    </motion.div>

</AnimatePresence>



        {/* BOTTOM PILE - stacked below active */}
<div className="relative w-72 md:h-[180px] mt-14">
  <AnimatePresence initial={false}>
    {bottomPileIndices.map((idx, i) => {
      const project = safeProjects[idx];
      if (!project) return null;

      const totalBottomCards = bottomPileIndices.length;
      const bottomOffset = 20 * (totalBottomCards - i);
      const zIndex = totalBottomCards - i;

      const isBottomTopCard = i === 0;

      return (
        <motion.div
          key={`bottom-pile-${project.id}`}
          onClick={() => handleWorkClick(project)}
          className={clsx(
            'absolute w-72 h-28 rounded-lg shadow-lg cursor-pointer hover:opacity-90 transition-opacity',
            isBottomTopCard
            ? 'bg-[#faf7ffde] text-black'
            : 'bg-gray-300/4 text-black/1',
          )}
          style={{
            bottom: `${bottomOffset}px`,
            zIndex,
            filter: 'drop-shadow(0 2px 6px rgb(0 0 0 / 0.15))',
          }}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.5 }}
        >
          <h4 className="font-bold text-lg line-clamp-1 px-4 pt-4 opacity-50">{project.title}</h4>
          <p className="px-4 pt-2 text-sm line-clamp-2 opacity-50">{project.description}</p>
        </motion.div>
      );
    })}
  </AnimatePresence>
</div>

</div>


      </div>
    </div>
  );
}
