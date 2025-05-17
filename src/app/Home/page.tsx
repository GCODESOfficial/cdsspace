/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import AOS from "aos";
import "aos/dist/aos.css";
import Image from "next/image";
import { useState, useEffect } from "react";
import { getAdvertisements } from "@/lib/storage-service"; // Ensure this imports correctly
import DisplayAd from "@/components/DisplayAd";

import VideoPreviewPlayer from "@/components/VideoPreviewPlayer";
import FeaturedBrandsCarousel from "@/components/FeaturedBrandsCarousel";
import GiftCards from "@/components/GiftCards";
import Testimonials from "@/components/Testimonials";
import TrustedBrands from "@/components/TrustedBrands";
import clsx from "clsx";
import StatSection from "@/components/StatSection";
import Link from "next/link";

interface Advertisement {
	id: string;
	imageUrl: string;
	link: string;
}

const images = [
	{ id: 0, src: "/images/camera.svg", alt: "Camera" },
	{ id: 1, src: "/images/person1.svg", alt: "Man in suit" },
	{ id: 2, src: "/images/person2.svg", alt: "People at event" },
];

const Home = () => {
	const [ads, setAds] = useState<Advertisement[]>([]);
	const [activeId, setActiveId] = useState(0);
	const [hoverId, setHoverId] = useState<number | null>(null);

	const getDisplayId = () => (hoverId !== null ? hoverId : activeId);

	useEffect(() => {
		const fetchAds = async () => {
			const data = await getAdvertisements();
			setAds(data);
		};
		fetchAds();
	}, []);

	useEffect(() => {
		AOS.init({ duration: 800, once: true });
		AOS.refresh();
	}, []);

	return (
		<div className="bg-white text-[#020839]">
			<VideoPreviewPlayer />

			<StatSection />

			<div
				className="p-8 rounded-lg my-32 flex flex-col items-center justify-between gap-8"
				data-aos="fade-in"
			>
				<div className="flex-1 space-y-4" data-aos="fade-right">
					<div className="flex flex-col md:flex-row items-center justify-between md:gap-64 gap-28">
						<div className="flex flex-col gap-6 w-sm">
							<p className="text-black" data-aos="fade-up">
								We are a branding and digital design agency that connects
								people, brands, and cultures.
							</p>
							<p
								className="text-black text-sm"
								data-aos="fade-up"
								data-aos-delay="100"
							>
								Our service scope includes web3 & web2 product development,
								Brand Identity Design, Industrial Print Production, Brand
								Communications and Marketing, Environmental Branding, Brand
								Consultancy
							</p>

							<Link
								href="/Works"
								className=" py-2 md:w-40 w-full border border-gray-800 rounded-full hover:bg-gray-100 transition text-center"
								data-aos="fade-up"
								data-aos-delay="200"
							>
								See Our Project
							</Link>
						</div>

						<div
							className="flex-1 flex justify-center items-center"
							data-aos="fade-left"
						>
							<div className="text-center">
								<Image
									src="/images/CDS Space logo.svg"
									alt="CDS Logo"
									width={400}
									height={400}
									className="mx-auto"
								/>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div>
				<DisplayAd />
			</div>

			<div className="min-h-screen flex flex-col md:flex-row items-center justify-center gap-12 md:gap-44 bg-gray-100 px-6 md:px-10 py-20 md:py-32">
				{/* Text Section */}
				<div className="text-center md:text-left mb-10 md:mb-0">
					<h1 className="text-7xl md:text-7xl font-extrabold mb-6 leading-tight">
						<span className="text-blue-600 block">People</span>
						<span className="text-black block">Brands</span>
						<span className="text-orange-600 block">Identities</span>
					</h1>

					<Link
						href="/About"
						className="px-20 py-2 md:px-6 md:py-2 border rounded-full md:text-sm hover:bg-black hover:text-white transition"
					>
						ABOUT US
					</Link>
				</div>

				{/* Image Section - remains horizontal on all screen sizes */}
				<div className="flex flex-row w-full max-w-7xl overflow-hidden gap-2 md:gap-4 h-[180px] md:h-[400px]">
					{images.map((img) => {
						const isActive = getDisplayId() === img.id;

						return (
							<div
								key={img.id}
								className={clsx(
									"cursor-pointer overflow-hidden rounded-xl transition-all duration-700 ease-in-out",
									isActive ? "basis-2/3" : "basis-1/3"
								)}
								onMouseEnter={() => {
									if (window.innerWidth >= 768) setHoverId(img.id);
								}}
								onMouseLeave={() => {
									if (window.innerWidth >= 768) setHoverId(null);
								}}
								onClick={() => {
									if (window.innerWidth < 768) setActiveId(img.id);
								}}
							>
								<Image
									src={img.src}
									alt={img.alt}
									width={800}
									height={600}
									className="object-cover w-full h-full transition-all duration-700 ease-in-out"
								/>
							</div>
						);
					})}
				</div>
			</div>

			<FeaturedBrandsCarousel />

			<GiftCards />
			<Testimonials />
			<TrustedBrands />
		</div>
	);
};

export default Home;
