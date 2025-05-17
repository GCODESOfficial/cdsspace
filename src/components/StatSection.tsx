'use client';

import CountUp from 'react-countup';
import { useInView } from 'react-intersection-observer';
import AOS from 'aos';
import 'aos/dist/aos.css';
import { useEffect } from 'react';

export default function StatSection() {
  const [ref, inView] = useInView({ triggerOnce: true });

  useEffect(() => {
    AOS.init({ duration: 800, once: true });
  }, []);

  return (
    <div
      className="flex h-40 items-center justify-around text-center bg-[#EDF0F6]"
      ref={ref}
    >
      <div data-aos="zoom-in">
        <h2 className="text-3xl font-extrabold">
          {inView ? <CountUp end={1024} duration={2} /> : 0}+
        </h2>
        <p>Brands</p>
      </div>
      <div data-aos="zoom-in" data-aos-delay="100">
        <h2 className="text-3xl font-extrabold">
          {inView ? <CountUp end={50} duration={2} /> : 0}+
        </h2>
        <p>Events</p>
      </div>
      <div data-aos="zoom-in" data-aos-delay="200">
        <h2 className="text-3xl font-extrabold">
          {inView ? <CountUp end={10} duration={2} /> : 0}+
        </h2>
        <p>Countries</p>
      </div>
    </div>
  );
}