"use client";

import { useEffect, useRef, useState, useMemo } from "react";

/**
 * Cosmic interactive starfield - extracted from the landing CTA so it can be
 * reused as a chat background. Renders a deep-blue starry canvas with twinkling
 * stars, periodic shooting stars, and a soft nebula glow that follows the cursor.
 */
export default function CosmicStarfield({ starCount = 120 }: { starCount?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);

  const stars = useMemo(() => {
    return Array.from({ length: starCount }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 0.5,
      baseOpacity: Math.random() * 0.5 + 0.2,
      twinkleDelay: Math.random() * 5,
    }));
  }, [starCount]);

  const [shootingStars, setShootingStars] = useState<{ id: number; top: number; left: number; angle: number }[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      const id = Date.now();
      setShootingStars((prev) => [
        ...prev.slice(-3),
        { id, top: Math.random() * 60, left: Math.random() * 80, angle: 30 + Math.random() * 30 },
      ]);
      setTimeout(() => {
        setShootingStars((prev) => prev.filter((s) => s.id !== id));
      }, 1500);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMouse({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setMouse(null)}
      className="absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      {/* Top center radial glow */}
      <div
        className="absolute top-[-180px] left-1/2 -translate-x-1/2 w-[480px] h-[600px] mix-blend-plus-lighter pointer-events-none opacity-50"
        style={{
          background: "radial-gradient(50% 50% at 50% 50%, #0575FF 0%, rgba(5, 117, 255, 0) 100%)",
          filter: "blur(60px)",
        }}
      />

      {/* Cursor-follow nebula */}
      {mouse && (
        <div
          className="absolute pointer-events-none transition-opacity duration-300"
          style={{
            left: `${mouse.x}%`,
            top: `${mouse.y}%`,
            transform: "translate(-50%, -50%)",
            width: "300px",
            height: "300px",
            background: "radial-gradient(circle, rgba(91,168,255,0.15) 0%, rgba(91,168,255,0) 70%)",
            filter: "blur(20px)",
          }}
        />
      )}

      {/* Stars */}
      {stars.map((star) => {
        let glow = 0;
        let scale = 1;
        if (mouse) {
          const dx = star.x - mouse.x;
          const dy = star.y - mouse.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < 12) {
            glow = 1 - distance / 12;
            scale = 1 + glow * 1.8;
          }
        }
        const isHovered = glow > 0.05;
        return (
          <div
            key={star.id}
            className="absolute rounded-full transition-all duration-300 ease-out"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              transform: `translate(-50%, -50%) scale(${scale})`,
              background: isHovered
                ? `rgba(120, 180, 255, ${0.9 * glow + 0.5})`
                : `rgba(255, 255, 255, ${star.baseOpacity})`,
              boxShadow: isHovered
                ? `0 0 ${8 + glow * 16}px ${2 + glow * 4}px rgba(91, 168, 255, ${0.6 * glow + 0.2}), 0 0 ${4 + glow * 8}px rgba(120, 180, 255, 0.8)`
                : "none",
              animation: !isHovered ? `cosmic-twinkle 4s ease-in-out infinite` : "none",
              animationDelay: `${star.twinkleDelay}s`,
            }}
          />
        );
      })}

      {/* Shooting stars */}
      {shootingStars.map((s) => (
        <div
          key={s.id}
          className="absolute pointer-events-none"
          style={{ top: `${s.top}%`, left: `${s.left}%`, transform: `rotate(${s.angle}deg)` }}
        >
          <div className="cosmic-shooting-star" />
        </div>
      ))}

      <style jsx>{`
        @keyframes cosmic-twinkle {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        .cosmic-shooting-star {
          width: 80px;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(91,168,255,0.9), white);
          border-radius: 999px;
          box-shadow: 0 0 6px rgba(91,168,255,0.8);
          animation: cosmic-shoot 1.5s ease-out forwards;
          transform-origin: left center;
        }
        @keyframes cosmic-shoot {
          0% { opacity: 0; transform: translateX(0) scaleX(0.2); }
          20% { opacity: 1; }
          100% { opacity: 0; transform: translateX(300px) scaleX(1); }
        }
      `}</style>
    </div>
  );
}
