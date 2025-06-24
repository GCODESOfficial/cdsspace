/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import Image from 'next/image';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isTransparent, setIsTransparent] = useState(true);
  const pathname = usePathname();

  const isHomePage = pathname === '/' || pathname.toLowerCase() === '/home';

  const toggleMenu = () => setIsOpen(!isOpen);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);
  

  useEffect(() => {
    let intersectionObserver: IntersectionObserver | null = null;
    let mutationObserver: MutationObserver | null = null;

    const observeVideoSection = () => {
      const videoSection = document.getElementById('video-section');
      if (!videoSection) return;

      intersectionObserver = new IntersectionObserver(
        ([entry]) => setIsTransparent(entry.isIntersecting),
        {
          rootMargin: '-80px 0px 0px 0px',
          threshold: 0.1,
        }
      );

      intersectionObserver.observe(videoSection);
    };

    if (!isHomePage) {
      setIsTransparent(false);
      return;
    }

    // If video-section is already in DOM, observe it
    if (document.getElementById('video-section')) {
      observeVideoSection();
    } else {
      // Wait until it's added to the DOM
      mutationObserver = new MutationObserver(() => {
        if (document.getElementById('video-section')) {
          observeVideoSection();
          if (mutationObserver) mutationObserver.disconnect(); // stop watching
        }
      });

      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      if (intersectionObserver) intersectionObserver.disconnect();
      if (mutationObserver) mutationObserver.disconnect();
    };
  }, [pathname]);

  return (
    <nav
      className={`fixed top-0 left-0 w-full px-5 z-50 transition-colors duration-300 ${
        isTransparent ? 'md:bg-transparent bg-[#020839]' : 'bg-[#020839]'
      } text-white`}
    >
      <div className="mx-auto md:px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center z-[999]">
          <Link href="/Home">
            <Image
              src="/images/cds-logo.svg"
              alt="CDS Logo"
              width={80}
              height={30}
              priority
            />
          </Link>
        </div>

        {/* Desktop Navigation */}
        <div className="hidden md:flex gap-6 text-gray-300 text-sm">
          <Link href="/Works" className="hover:text-white transition">WORK</Link>
          <Link href="/About" className="hover:text-white transition">ABOUT</Link>
          <Link href="/Career" className="hover:text-white transition">CAREER</Link>
          <Link href="/Links" className="hover:text-white transition">LINKS</Link>
          <Link href="/Contact" className="hover:text-white transition">CONTACT</Link>
        </div>

        {/* Mobile Toggle Button */}
        <button
          className="md:hidden text-white z-50 relative"
          onClick={toggleMenu}
          aria-label="Toggle menu"
        >
          {isOpen ? <X size={24} className='border-2 border-white p-1 rounded-full'/> : <Menu size={24} />}
        </button>
      </div>

      {/* Background Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 transition-opacity duration-300"
          onClick={toggleMenu}
        />
      )}

      {/* Mobile Dropdown Menu */}
      <div
  className={`md:hidden fixed top-0 left-0 w-screen h-screen bg-[#020839] text-white font-bold px-5 z-40 transition-all duration-300 flex flex-col justify-between pb-20 pt-28 space-y-2 ${
    isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10 pointer-events-none'
  }`}
>
  

    <div className='h-[80%] justify-between flex flex-col gap-2'>
    <Link href="/Home" className="hover:text-gray-300" onClick={toggleMenu}>
<div className="rounded-lg p-3 text-center transition bg-gradient-to-t from-[#020839] via-[#020936] to-[#051b63] hover:bg-[#0000FF] hover:bg-none">
  HOME
</div>
</Link>
<Link href="/Works" className="hover:text-gray-300" onClick={toggleMenu}>
  <div className="rounded-lg p-3 bg-gradient-to-t from-[#020839] via-[#020936] to-[#051b63] text-center transition">
  WORK
  </div>
  </Link>
  <Link href="/About" className="hover:text-gray-300" onClick={toggleMenu}>
  <div className="rounded-lg p-3 bg-gradient-to-t from-[#020839] via-[#020936] to-[#051b63] text-center transition">
  ABOUT
  </div>
  </Link>
  <Link href="/Career" className="hover:text-gray-300" onClick={toggleMenu}>
  <div className="rounded-lg p-3 bg-gradient-to-t from-[#020839] via-[#020936] to-[#051b63] text-center transition">
 CAREER
  </div>
  </Link>
  <Link href="/Contact" className="hover:text-gray-300" onClick={toggleMenu}>
  <div className="rounded-lg p-3 bg-gradient-to-t from-[#020839] via-[#020936] to-[#051b63] text-center transition">
 CONTACT
  </div>
  </Link>
  <Link href="/" className="hover:text-gray-300" onClick={toggleMenu}>
  <div className="rounded-lg p-3 bg-gradient-to-t from-[#020839] via-[#020936] to-[#051b63] text-center transition">
  CSCN
  </div>
  </Link>
  <Link href="/Links" className="hover:text-gray-300" onClick={toggleMenu}>
  <div className="rounded-lg p-3 bg-gradient-to-t from-[#020839] via-[#020936] to-[#051b63] text-center transition">
  LINKS
  </div>
  </Link>
  </div>
<div className='flex justify-center items-center w-full '>
  <p className="font-normal text-center text-sm text-white/50">© {new Date().getFullYear()} CDS Space | Branding Agency.</p>
  </div>
  </div>


    </nav>
  );
}
