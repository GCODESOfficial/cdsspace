"use client";

import React from "react";

const TAGS = [
  "Logo Design",
  "Graphic Design",
  "3D Modelling AR & VR",
  "Brand Communication",
  "Brand Launch",
  "Product Development",
  "Merch Printing",
  "Event Branding",
  "Merch Packaging",
  "Brand Strategy",
];

const ROWS = [
  { id: 1, dir: "left", duration: 20 },
  { id: 2, dir: "right", duration: 26 },
  { id: 3, dir: "left", duration: 22 },
  { id: 4, dir: "right", duration: 28 },
];

export default function AnimatedTagRows() {
  return (
    <div className="flex flex-col justify-between h-full ">
      
      {/*  TEXT GROUP */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-[#0B0B0C]">Ask for Anything</h3>
        <p className="text-[#555] text-sm md:text-base leading-relaxed">
          From branding to in-real-life branding, just say the word.
        </p>
      </div>

      {/* Brand panel + tag rows */}
      <div className="space-y-4 rounded-lg bg-[#0A4FE8] py-4 text-center">
        {ROWS.map((row) => {
          const style: React.CSSProperties & Record<string, string> = {
            "--scroll-duration": `${row.duration}s`,
            "--scroll-direction": row.dir,
          };

          return (
            <div key={row.id} className="relative overflow-hidden h-12">
              <div
                className="tag-track flex items-center whitespace-nowrap gap-3"
                style={style}
              >
                {[...Array(2)].map((_, copy) => (
                  <div key={copy} className="flex gap-2 items-center">
                    {TAGS.map((tag, i) => (
                      <span
                        key={`${row.id}-${copy}-${i}`}
                        className="inline-block px-4 py-2 bg-white border border-[#E0E6FF] rounded-full text-sm text-[#020839] font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
