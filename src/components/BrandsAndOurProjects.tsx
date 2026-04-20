'use client';

import Image from 'next/image';

const groupedLogos = [
  '/images/logos line 1.svg',
  '/images/logos line 2.svg',
  '/images/logos line 3.svg',
  '/images/logos line 4.svg',
  '/images/logos line 5.svg',
  '/images/logos line 6.svg',
];

export default function BrandsAndOurProjects() {
  return (
    <section className="md:pb-32 py-24 bg-linear-to-b from-white to-slate-100 overflow-hidden">
      <div className="text-center w-full">
        <h2 className="md:text-4xl font-semibold mb-2 px-8 text-[#111111]">
          Welcome to the <span className='text-5xl text-[#154CDC] font-[MonotypeCorsivaRegular]'>Club</span>
        </h2>
        <p className="max-w-xl mx-auto text-sm md:text-lg mb-12 px-4 md:px-0">
          A growing community of brands shaping the future with bold design and creative clarity.
        </p>

        <div className="space-y-8 md:space-y-6">
          {groupedLogos.map((src, rowIdx) => (
            <div key={rowIdx} className="overflow-hidden w-screen">
              <div
                className={`flex md:w-max gap-6 w-[350%] ${
                  rowIdx % 2 === 0 ? 'animate-scroll-left' : 'animate-scroll-right'
                }`}
              >
                {[...Array(2)].map((_, i) => (
                  <Image
                    key={i}
                    src={src}
                    alt={`Logo Row ${rowIdx + 1} Copy ${i + 1}`}
                    width={1920}
                    height={100}
                    className="shrink-0 md:w-screen md:h-auto w-[3840px] h-[40px] object-contain"
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
