/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import { getCarrierLink, type CarrierLink } from "@/lib/storage-service";


const imageList = [
  '/images/career1.jpeg',
  '/images/career2.svg',
  '/images/career3.svg',
  '/images/career4.svg',
  '/images/career5.jpeg',
  '/images/career6.jpeg',
  '/images/career7.jpeg',
]

export default function CareerPage() {
	const [carrierLink, setCarrierLink] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [currentIndex, setCurrentIndex] = useState(0)

	useEffect(() => {
	  const interval = setInterval(() => {
		setCurrentIndex((prevIndex) => (prevIndex + 1) % imageList.length)
	  }, 3000)
  
	  return () => clearInterval(interval)
	}, [])

	useEffect(() => {
		const fetchLink = async () => {
			try {
				const link: CarrierLink | null = await getCarrierLink();
				if (link) {
					setCarrierLink(link.url);
				}
			} catch (error) {
				console.error("Failed to fetch carrier link:", error);
			} finally {
				setIsLoading(false);
			}
		};
		fetchLink();
	}, []);

	return (
		<div className="min-h-screen px-6 md:px-20 py-40 text-[#040b37] bg-white flex flex-col-reverse lg:flex-row items-center justify-between gap-10">
			
			<div className="w-full max-w-sm md:hidden">
      <img
        src={imageList[currentIndex]}
        alt="Career at CDS Space"
        className="w-full h-[20rem] rounded-xl shadow-lg object-cover transition duration-700 ease-in-out transform hover:scale-105 hover:opacity-90"
      />
    </div>
			
			
			{/* Left Text Section */}
			<div className="w-full max-w-lg text-left">
				<h1 className="text-5xl md:text-7xl font-extrabold leading">
					Unlock <br />
					Your <span className="text-[#0A4FE8]">Full</span> <br />
                    <span className="text-[#0A4FE8]">Potential</span>
				</h1>
				<p className="mt-20 md:w-md px-3 md:px-0 mb-4 md:mb-0 leading">
					At CDS Space, we collaborate with brands worldwide and we&apos;re eager to
					connect with people with bright minds and are eager to grow. <br />
					To join us <br />
					<span className="text-[#0A4FE8] ">click the link below</span>
				</p>

				{isLoading ? (
					<p className="mt-4 md:text-sm text-gray-500">Loading application link...</p>
				) : carrierLink ? (
					<a href={carrierLink} target="_blank" rel="noopener noreferrer">
						<button className="md:mt-6 px-5 py-2 md:text-sm rounded-full border border-[#0A4FE8] text-[#0A4FE8] hover:bg-blue-50 transition">
							Apply Here
						</button>
					</a>
				) : (
					<p className="mt-4 md:text-sm text-red-500">
						Application link is currently unavailable. Please check back later.
					</p>
				)}
			</div>

			{/* Right Image Section */}
			

			<div className="w-full max-w-lg hidden md:block">
      <img
        src={imageList[currentIndex]}
        alt="Career at CDS Space"
        className="w-full h-[32rem] rounded-xl shadow-lg object-cover transition duration-700 ease-in-out transform hover:scale-105 hover:opacity-90"
      />
    </div>
		</div>
	);
}