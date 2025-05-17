'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import Image from "next/image";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isTransparent, setIsTransparent] = useState(true);

  const toggleMenu = () => setIsOpen(!isOpen);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setIsTransparent(entry.isIntersecting),
      {
        rootMargin: '-80px 0px 0px 0px',
        threshold: 0.1,
      }
    );

    const videoSection = document.getElementById('video-section');
    if (videoSection) observer.observe(videoSection);

    return () => {
      if (videoSection) observer.unobserve(videoSection);
    };
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 w-full px-5 z-50 transition-colors duration-300 ${
        isTransparent ? 'bg-transparent' : 'bg-[#020839]'
      } text-white`}
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center">
          <Link href="/Home">
            <Image src="/images/cds-logo.svg" alt="CDS Logo" width={80} height={30} />
          </Link>
        </div>

        {/* Desktop Navigation */}
        <div className="hidden md:flex gap-6 text-gray-300 text-sm">
          <Link href="/Works" className="hover:text-white transition">WORK</Link>
          <Link href="/About" className="hover:text-white transition">ABOUT</Link>
          <Link href="/Career" className="hover:text-white transition">CAREER</Link>
          <Link href="/Contact" className="hover:text-white transition">CONTACT</Link>
        </div>

        {/* Mobile Toggle Button */}
        <button
          className="md:hidden text-gray-300 z-50 relative"
          onClick={toggleMenu}
          aria-label="Toggle menu"
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Slide-In Navigation */}
      <div
        className={`md:hidden fixed top-2 right-0 text-center py-8 pt-10 rounded-xl bg-[#020839] text-white w-1/2 transform transition-transform duration-300 z-40 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col p-6 space-y-4 text-sm">
        <Link href="/Home" className="hover:text-gray-300" onClick={toggleMenu}>HOME</Link>
          <Link href="/Works" className="hover:text-gray-300" onClick={toggleMenu}>WORK</Link>
          <Link href="/About" className="hover:text-gray-300" onClick={toggleMenu}>ABOUT</Link>
          <Link href="/Career" className="hover:text-gray-300" onClick={toggleMenu}>CAREER</Link>
          <Link href="/Contact" className="hover:text-gray-300" onClick={toggleMenu}>CONTACT</Link>
        </div>
      </div>
    </nav>
  );
}
