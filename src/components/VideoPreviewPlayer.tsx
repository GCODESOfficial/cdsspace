'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';

export default function VideoPreviewPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const trackerRef = useRef<HTMLDivElement>(null);
  const mainVideoRef = useRef<HTMLVideoElement>(null);

  const toggleSound = () => {
    setIsMuted((prev) => {
      if (mainVideoRef.current) {
        mainVideoRef.current.muted = !prev;
      }
      return !prev;
    });
  };

  const goBackToPreview = () => {
    setIsPlaying(false);
    setIsMuted(false);
    if (mainVideoRef.current) {
      mainVideoRef.current.pause();
      mainVideoRef.current.currentTime = 0;
    }
  };

  const handleWatchReelClick = () => {
    setIsPlaying(true);
    setTimeout(() => {
      if (mainVideoRef.current) {
        mainVideoRef.current.muted = false;
        mainVideoRef.current.play().catch((err) => {
          console.warn('Autoplay with sound failed:', err);
        });
      }
    }, 100);
  };

  return (
    <div id="video-section" className="relative w-full max-w-7xl mx-auto flex perspective-1000">
      <div className="relative w-full aspect-video overflow-hidden flex-grow">

        {/* Preview Video */}
<div
  className={`absolute w-full h-full object-contain z-30 transition-all duration-700 ease-in-out ${
    isPlaying ? 'opacity-0 scale-90 rotate-y-12' : 'opacity-100 scale-100 rotate-y-0'
  }`}
>
  {!isPlaying && (
    <video
      src="/CDS AGENCY.mp4"
      autoPlay
      loop
      muted
      playsInline
      className="w-full h-full object-contain"
    />
  )}
</div>

{/* Main Video */}
<div
  className={`absolute w-full h-full object-contain z-40 ${
    isPlaying
      ? 'opacity-100 scale-100 rotate-y-0'
      : 'opacity-0 scale-90 -rotate-y-12'
  } ${isPlaying ? 'animate-rotateOpen' : 'animate-rotateClose'}`}
>
  {isPlaying && (
    <video
      ref={mainVideoRef}
      src="/CDS Space Branding Agency.mp4"
      loop
      muted={isMuted}
      playsInline
      className="w-full h-full object-contain"
    />
  )}
</div>

        {/* WATCH REEL Tracker */}
        {!isPlaying && (
          <div
            className="absolute inset-0 z-50 cursor-pointer"
            onClick={handleWatchReelClick}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            onMouseMove={(e) => setMousePos({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })}
          >
            {isHovering && (
              <div
                ref={trackerRef}
                className="absolute pointer-events-none transition-opacity duration-200"
                style={{
                  left: mousePos.x,
                  top: mousePos.y,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <div className="font-semibold space-y-3 flex flex-col items-center justify-center">
                  <div className="color-cycle rounded-full shadow-md leading-tight text-center flex justify-center items-center w-28 h-28 animate-pulse font-semibold">
                    WATCH <br />
                    REEL
                  </div>
                  <div className="flex flex-col items-center mt-4 text-white">
                    <Image src="/images/cds-logo.svg" alt="CDS Logo" width={80} height={30} />
                    <div className="">2024+♾️</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      {isPlaying && (
        <div className="absolute top-1/2 transform -translate-y-1/2 right-4 flex flex-col gap-6 z-40 scale-50 md:scale-100">
          <button onClick={toggleSound} className="bg-white text-[#020839] p-3 rounded-full shadow-md">
            {isMuted ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5v14l-5-5H2V10h2l5-5zM15 9l6 6M21 9l-6 6" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5v14l-5-5H2V10h2l5-5zm7.5 1.5a9 9 0 010 12M18 8.25a5.25 5.25 0 010 7.5" />
              </svg>
            )}
          </button>

          <button onClick={goBackToPreview} className="bg-white p-3 flex justify-center items-center rounded-full shadow-md">
            <Image src="/images/download (1).jpeg" width={24} height={24} alt="Back" className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  );
}