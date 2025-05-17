'use client';

import Image from 'next/image';
import React from 'react';

const groupedLogos = [
  '/images/logos line 1.svg',
  '/images/logos line 2.svg',
  '/images/logos line 3.svg',
  '/images/logos line 4.svg',
  '/images/logos line 5.svg',
  '/images/logos line 6.svg',
];

export default function TrustedBrands() {
  return (
    <section className="md:pb-32 py-24 bg-gradient-to-b from-white to-slate-100">
      <div className="container mx-auto text-center">
        <h2 className="text-lg font-semibold mb-10 px-8 tracking-widest text-gray-700 uppercase">
          Brands and Projects That Trust Our Services
        </h2>

        <div className="space-y-8 sm:space-y-10">
          {groupedLogos.map((src, rowIdx) => (
            <div key={rowIdx} className="relative overflow-hidden w-full">
              <div
                className={`flex min-w-max gap-6 sm:gap-10 ${
                  rowIdx % 2 === 0 ? 'animate-scroll-left' : 'animate-scroll-right'
                }`}
              >
                {[...Array(2)].map((_, i) => (
                  <Image
                    key={i}
                    src={src}
                    alt={`Logo Row ${rowIdx + 1} Copy ${i + 1}`}
                    width={1500}
                    height={100}
                    className="shrink-0 w-[900px] sm:w-[1500px] h-auto"
                    priority
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}