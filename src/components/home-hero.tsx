"use client";

import { useEffect } from "react";
import AOS from "aos";
import StatSection from "./StatSection";


export default function HomeHero() {
	useEffect(() => {
		AOS.init({
			duration: 1000,
			once: true,
		});
	}, []);

	return (
		<section className="bg-[#f5f5f5] pt-24">
			<div className="container mx-auto px-4">
				<div className="max-w-6xl mx-auto">
					<div
						className="mb-14 mx-auto md:flex justify-between items-start"
						data-aos="fade-up"
					>
						{/* Left-side h1 */}
						<h1 className="md:text-4xl font-extrabold mb-4 flex items-center text-left">
							<span className="text-[#040b37] md:text-9xl text-7xl">•</span>
							<span className="text-[#040b37] md:text-7xl ml-2 text-6xl">You</span>
							<span className="md:text-7xl text-6xl ml-4 text-[#0A4FE8]">Dream</span>
						</h1>

						{/* Right-side paragraph */}
						<p className="text-black max-w-md md:text-right text-center md:ml-10 mt-24 px-5">
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
