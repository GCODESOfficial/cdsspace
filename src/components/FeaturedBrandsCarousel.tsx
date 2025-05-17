/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
} from "@/components/ui/carousel";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

export default function FeaturedBrandsCarousel() {
	const carouselRef = useRef<HTMLDivElement | null>(null);
	const [isPaused, setIsPaused] = useState(false);
	const intervalRef = useRef<NodeJS.Timeout | null>(null);
	const [selectedWorks, setSelectedWorks] = useState<any[]>([]);
	const [isMobile, setIsMobile] = useState(false);

	// Detect screen width
	useEffect(() => {
		const checkMobile = () => setIsMobile(window.innerWidth < 768);
		checkMobile();
		window.addEventListener("resize", checkMobile);
		return () => window.removeEventListener("resize", checkMobile);
	}, []);

	useEffect(() => {
		const fetchSelectedWorks = async () => {
			try {
				const { data: brandRows, error } = await supabase
					.from("brands")
					.select("name, order")
					.eq("selected", true)
					.order("order");

				if (error) throw error;

				const titles = brandRows.map((b) => b.name);

				const { data: works, error: worksError } = await supabase
					.from("works")
					.select("*")
					.in("title", titles);

				if (worksError) throw worksError;

				const ordered = titles
					.map((title) => works.find((w) => w.title === title))
					.filter(Boolean);

				setSelectedWorks(ordered);
			} catch (e) {
				console.error("Failed to fetch featured works from Supabase", e);
				setSelectedWorks([]);
			}
		};

		fetchSelectedWorks();
	}, []);

	// Auto-scroll carousel
	useEffect(() => {
		if (isMobile) return; // skip auto-scroll on mobile

		const startAutoScroll = () => {
			if (intervalRef.current) clearInterval(intervalRef.current);
			intervalRef.current = setInterval(() => {
				if (!isPaused) {
					const nextButton = carouselRef.current?.querySelector(
						"[data-carousel-next]"
					) as HTMLButtonElement;
					nextButton?.click();
				}
			}, 4000);
		};

		startAutoScroll();

		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current);
		};
	}, [isPaused, isMobile]);

	// Pause on interaction
	useEffect(() => {
		if (isMobile) return;

		const carouselEl = carouselRef.current;
		if (!carouselEl) return;

		const pause = () => setIsPaused(true);
		const resume = () => setIsPaused(false);

		carouselEl.addEventListener("mouseenter", pause);
		carouselEl.addEventListener("mouseleave", resume);
		carouselEl.addEventListener("touchstart", pause);
		carouselEl.addEventListener("touchend", resume);

		const prevBtn = carouselEl.querySelector("[data-carousel-prev]");
		const nextBtn = carouselEl.querySelector("[data-carousel-next]");
		prevBtn?.addEventListener("click", pause);
		nextBtn?.addEventListener("click", pause);

		return () => {
			carouselEl.removeEventListener("mouseenter", pause);
			carouselEl.removeEventListener("mouseleave", resume);
			carouselEl.removeEventListener("touchstart", pause);
			carouselEl.removeEventListener("touchend", resume);
			prevBtn?.removeEventListener("click", pause);
			nextBtn?.removeEventListener("click", pause);
		};
	}, [isMobile]);

	return (
		<section className="py-32 px-6 bg-[#EDF0F6]">
			<div className="max-w-6xl mx-auto">
				<div className="md:flex justify-between items-center mb-20">
					<h2 className="md:text-5xl text-5xl font-extrabold mb-10 md:mb-0">
						Featured Brands
					</h2>
					<Link
						href="/Works"
						className="md:text-base border md:px-5 w-full md:w-auto text-center py-2 rounded-full hover:bg-black hover:text-white transition inline-block"
					>
						See more
					</Link>
				</div>

				{/* Mobile View: Vertical Stack */}
				{isMobile ? (
					<div className="space-y-4">
						{selectedWorks.map((work) => (
							<div
								key={work.id}
								className="relative w-full h-[300px] rounded-xl overflow-hidden shadow bg-white"
							>
								{work.cover_image ? (
									<Image
										src={work.cover_image}
										alt={work.title || "Featured Work"}
										fill
										className="object-cover"
									/>
								) : (
									<div className="flex items-center justify-center w-full h-full text-gray-400 text-sm">
										No Image
									</div>
								)}
							</div>
						))}
					</div>
				) : (
					// Desktop View: Carousel
					<div ref={carouselRef}>
						<Carousel opts={{ align: "start" }} className="w-full">
							<CarouselContent className="-ml-4 touch-pan-x">
								{selectedWorks.length === 0 ? (
									<div className="text-center py-4 text-gray-400 w-full">
										No featured works available
									</div>
								) : (
									selectedWorks.map((work) => (
										<CarouselItem key={work.id} className="pl-4 md:basis-1/4">
											<div className="relative w-full h-[250px] rounded-xl overflow-hidden shadow bg-white">
												{work.cover_image ? (
													<Image
														src={work.cover_image}
														alt={work.title || "Featured Work"}
														fill
														className="object-cover"
													/>
												) : (
													<div className="flex items-center justify-center w-full h-full text-gray-400 text-sm">
														No Image
													</div>
												)}
											</div>
										</CarouselItem>
									))
								)}
							</CarouselContent>
							<CarouselPrevious data-carousel-prev />
							<CarouselNext data-carousel-next />
						</Carousel>
					</div>
				)}
			</div>
		</section>
	);
}
