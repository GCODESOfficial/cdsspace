"use client";


import AOS from "aos";
import StatSection from "./StatSection";

import { useEffect, useState } from 'react'

const phrases = [
	{ subject: 'You', verb: 'Dream', color: '#0A4FE8' },
	{ subject: 'We', verb: 'Envision', color: '#D97706' },
	{ subject: 'We', verb: 'Deliver', color: '#10B981' },
  ]


export default function HomeHero() {
	useEffect(() => {
		AOS.init({
			duration: 1000,
			once: true,
		});
	}, []);

	const [index, setIndex] = useState(0)
	const [subIndex, setSubIndex] = useState(0)
	const [deleting, setDeleting] = useState(false)
	const [pause, setPause] = useState(false)
  
	const current = phrases[index]
  
	useEffect(() => {
	  if (pause) return
  
	  if (!deleting && subIndex === current.verb.length) {
		setPause(true)
		setTimeout(() => {
		  setPause(false)
		  setDeleting(true)
		}, 1000)
		return
	  }
  
	  if (deleting && subIndex === 0) {
		setPause(true)
		setTimeout(() => {
		  setPause(false)
		  setDeleting(false)
		  setIndex((prev) => (prev + 1) % phrases.length)
		}, 300)
		return
	  }
  
	  const timeout = setTimeout(() => {
		setSubIndex((prev) => prev + (deleting ? -1 : 1))
	  }, deleting ? 40 : 120)
  
	  return () => clearTimeout(timeout)
	}, [subIndex, deleting, index, pause, current.verb.length])

	return (
		<section className="bg-[#f5f5f5] pt-24 relative">
			           <div className="md:h-[32rem] md:w-[32rem] h-[28rem] w-[28rem] rounded-full border-28 border-[#D9D9D9] absolute top-0 -right-80"></div>

			<div className="container mx-auto md:px-4 px-2">
				<div className="max-w-6xl mx-auto">
					<div
						className="mb-14 mx-auto md:flex justify-between items-start"
						data-aos="fade-up"
					>
						{/* Left-side h1 */}
						<h1 className="md:text-4xl font-extrabold mb-4 flex items-center text-left">
      <span className="text-[#040b37] md:text-9xl text-7xl">•</span>
      <span className="text-[#040b37] md:text-7xl md:ml-4 text-4xl">{current.subject}</span>
      <span
        className="md:text-7xl text-4xl md:ml-4 ml-2"
        style={{ color: current.color }}
      >
        {current.verb.substring(0, subIndex)}
        <span className="animate-pulse">|</span>
      </span>
    </h1>

						{/* Right-side paragraph */}
						<p className="text-black max-w-md text-right md:ml-10 md:mt-60 mt-28 md:px-5 px-4 text-sm md:text-base">
							At CDS Spaces, we help turn your dreams into reality with our
							expert team and comprehensive services. We&apos;ve delivered
							exceptional results across multiple countries and industries for
							over a decade.
						</p>
					</div>
				</div>
			</div>
            <StatSection />
		</section>
	);
}
