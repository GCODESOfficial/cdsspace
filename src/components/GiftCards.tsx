/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @next/next/no-img-element */
'use client';

import { useState } from "react";
import clsx from "clsx";

const cardImages = [
  "/images/card1.svg",
  "/images/card2.svg",
  "/images/card3.svg",
  "/images/card4.svg",
];

export default function GiftCards() {
  const [cards, setCards] = useState(cardImages);
  const [activeCard, setActiveCard] = useState<number | null>(null); // for mobile click effect

  return (
    <section className="bg-[#F5F5F5] px-[10px] md:px-[20px] py-10 md:py-32">
      <div className="px-[10px] bg-[#EDF0F6] md:px-[20px] py-10 rounded-xl max-w-[1000px] shadow-lg mx-auto">
        
        {/* Heading and Description */}
        <div className="flex flex-col gap-1 items-center justify-between">
          <h2 className="text-4xl md:text-2xl lg:text-4xl font-semibold leading-[32px] text-[#05050D]">
            Gift Cards
          </h2>
          <p className="text-md font-normal mt-4 md:mt-0 text-center w-2/3 md:w-full md:leading-[32px] text-[#05050D]">
            Get amazing discount from us anytime you patronise our brand.
          </p>
        </div>

        {/* Mobile stacked cards */}
        <div className="mt-20 md:hidden flex flex-col max-w-[90%] mx-auto">
          {cards.map((src, index) => (
            <img
              key={index}
              src={src}
              alt={`Gift Card ${index + 1}`}
              loading="lazy"
              onClick={() => setActiveCard(index === activeCard ? null : index)}
              className={clsx(
                "transition-all duration-500 ease-in-out w-full cursor-pointer -mt-16 rounded-xl",
                activeCard === index && "scale-105  z-10"
              )}
              style={{ color: "transparent" }}
            />
          ))}
        </div>

        {/* Desktop grid layout */}
        <section className="hidden md:grid w-full md:w-[90%] mx-auto grid-cols-4 my-10 md:mt-24 pt-5">
          {cards.map((src, index) => (
            <div
              key={index}
              className="relative cursor-pointer ease-in-out duration-500"
            >
              {/* Optional SVG glow effect */}
              {(index === 0 || index === 3) && (
                <svg
                  className={clsx(
                    "absolute hidden md:inline",
                    index === 0 ? "-top-[140%]" : "-top-[110%] -left-20"
                  )}
                  width="406"
                  height="406"
                  viewBox="0 0 406 406"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <g filter="url(#glow)">
                    <circle
                      cx="203.009"
                      cy="203.144"
                      r="78.3151"
                      fill={index === 0 ? "#0E3997" : "#5B1AFE"}
                      fillOpacity="0.5"
                    />
                  </g>
                  <defs>
                    <filter
                      id="glow"
                      x="0.394"
                      y="0.529"
                      width="405.23"
                      height="405.23"
                      filterUnits="userSpaceOnUse"
                      colorInterpolationFilters="sRGB"
                    >
                      <feFlood floodOpacity="0" result="BackgroundImageFix" />
                      <feBlend
                        mode="normal"
                        in="SourceGraphic"
                        in2="BackgroundImageFix"
                        result="shape"
                      />
                      <feGaussianBlur
                        stdDeviation="62.15"
                        result="effect1_foregroundBlur"
                      />
                    </filter>
                  </defs>
                </svg>
              )}

              <img
                src={src}
                alt={`Gift Card ${index + 1}`}
                loading="lazy"
                className={clsx(
                  "ease-in-out duration-500 w-full mx-auto relative",
                  {
                    "left-20 top-1 scale-[1.6] z-40": index === 0,
                    "left-10 top-0 scale-[1.6] z-30": index === 1,
                    "left-0 top-0 scale-[1.5] z-20": index === 2,
                    "-left-10 -top-1 scale-[1.6] z-10 md:-top-2": index === 3,
                  },
                  "hover:scale-[1.8] hover:z-50 cursor-pointer"
                )}
                style={{ color: "transparent" }}
              />
            </div>
          ))}
        </section>
      </div>
    </section>
  );
}