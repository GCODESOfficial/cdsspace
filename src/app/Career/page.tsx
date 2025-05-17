/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import { getCarrierLink, type CarrierLink } from "@/lib/storage-service";

export default function CareerPage() {
	const [carrierLink, setCarrierLink] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(true);

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
		<div className="min-h-screen px-6 md:px-20 lg:px-32 py-40 text-[#040b37] bg-white flex flex-col-reverse lg:flex-row items-center justify-between gap-10">
			{/* Left Text Section */}
			<div className="w-full max-w-lg text-center lg:text-left">
				<h1 className="text-6xl md:text-7xl font-extrabold leading">
					Unlock <br />
					Your <span className="text-[#0A4FE8]">Full</span> <br />
                    <span className="text-[#0A4FE8]">Potential</span>
				</h1>
				<p className="mt-6 md:w-md px-8 md:px-0 mb-4 md:mb-0 leading-relaxed">
					At CDS Space, we collaborate with brands worldwide and we&apos;re eager to
					connect with people with bright minds and are eager to grow. <br />
					To join us <br />
					<span className="text-[#0A4FE8] ">click the link below</span>
				</p>

				{isLoading ? (
					<p className="mt-4 md:text-sm text-gray-500">Loading application link...</p>
				) : carrierLink ? (
					<a href={carrierLink} target="_blank" rel="noopener noreferrer">
						<button className="mt-6 px-5 py-2 md:text-sm rounded-full border border-[#0A4FE8] text-[#0A4FE8] hover:bg-blue-50 transition">
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
			<div className="w-full max-w-sm">
				<img
					src="/images/career.svg"
					alt="Career at CDS Space"
					className="w-full h-auto rounded-xl shadow-lg object-cover"
				/>
			</div>
		</div>
	);
}