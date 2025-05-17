/* eslint-disable @next/next/no-img-element */
'use client';

import { useState } from 'react';
import { MapPin } from 'lucide-react';

export default function MapImageHover() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  return (
    <div className="mt-16 md:px-40 px-8 pb-32 relative">
      <a
        href="https://www.google.com/maps/place/CDS+Space+%7C+Branding+Agency+in+Nigeria+for+Africa+and+Beyond/@5.006426,7.9432224,17z"
        target="_blank"
        rel="noopener noreferrer"
        className="block relative w-full"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        }}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <img
          src="/images/cdsspacemap.svg"
          alt="CDS Space Map Location"
          className="w-full rounded-lg"
        />
        {isHovering && (
          <div
            className="absolute pointer-events-none text-[#040b37] text-xs flex items-center gap-1"
            style={{
              left: pos.x + 10,
              top: pos.y + 10,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <MapPin size={12} className="text-red-500" />
            <span>#53 General Edet Akpan Avenue, Uyo, AKS, NG (520101)</span>
          </div>
        )}
      </a>
    </div>
  );
}
