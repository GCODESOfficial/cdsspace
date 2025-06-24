/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getSlugFromTitle } from "@/lib/utils";
import { CATEGORIES } from "@/lib/constants";


const phrases = [
	{ subject: "Your", verb: "Brand", color: "#0A4FE8" },
	{ subject: "Your", verb: "Culture", color: "#000000" },
	{ subject: "Our", verb: "Touch", color: "#10B981" },
];

export default function WorkPage() {
	const router = useRouter();
	const [categoryWorks, setCategoryWorks] = useState<Record<string, any[]>>({});
	const [loading, setLoading] = useState(true);
	const [index, setIndex] = useState(0);
	const [subIndex, setSubIndex] = useState(0);
	const [deleting, setDeleting] = useState(false);
	const [pause, setPause] = useState(false);

	const current = phrases[index];

	useEffect(() => {
		if (pause) return;

		if (!deleting && subIndex === current.verb.length) {
			setPause(true);
			setTimeout(() => {
				setPause(false);
				setDeleting(true);
			}, 1000);
			return;
		}

		if (deleting && subIndex === 0) {
			setPause(true);
			setTimeout(() => {
				setPause(false);
				setDeleting(false);
				setIndex((prev) => (prev + 1) % phrases.length);
			}, 300);
			return;
		}

		const timeout = setTimeout(
			() => {
				setSubIndex((prev) => prev + (deleting ? -1 : 1));
			},
			deleting ? 40 : 120
		);

		return () => clearTimeout(timeout);
	}, [subIndex, deleting, index, pause, current.verb.length]);

	useEffect(() => {
		fetchWorksByCategory();
	}, []);

	async function fetchWorksByCategory() {
		try {
			setLoading(true);

			const initialCategoryWorks: Record<string, any[]> = {};
			CATEGORIES.forEach((category) => {
				initialCategoryWorks[category.slug] = [];
			});

			const { data, error } = await supabase
				.from("works")
				.select("*")
				.order("created_at", { ascending: false });

			if (error) throw error;

			if (data) {
				data.forEach((work) => {
					const categoryObj = CATEGORIES.find(
						(cat) => cat.name === work.category
					);
					if (categoryObj) {
						if (!initialCategoryWorks[categoryObj.slug]) {
							initialCategoryWorks[categoryObj.slug] = [];
						}
						initialCategoryWorks[categoryObj.slug].push(work);
					}
				});
			}

			setCategoryWorks(initialCategoryWorks);
		} catch (error) {
			console.error("Error fetching works:", error);
		} finally {
			setLoading(false);
		}
	}

	const handleCategoryClick = (categorySlug: string) => {
		router.push(`/Works/categories/${categorySlug}`);
	};

	const handleWorkClick = (work: any) => {
		const titleSlug = getSlugFromTitle(work.title);
		router.push(`/Works/work/${titleSlug}`);
	};

	if (loading) {
		return (
		  <div className="min-h-screen bg-white text-black p-6 flex items-center justify-center">
			<div className="text-center">
			  <div className="mx-auto mb-4 w-28 h-28  rounded-full overflow-hidden">
				<video
				  src="/loader.mp4"  // replace with your video path
				  autoPlay
				  loop
				  muted
				  playsInline
				  className="rounded-full object-fill h-24 w-24"
				/>
			  </div>
			  <p>Loading project details...</p>
			</div>
		  </div>
		);
	  }

	const categoriesWithWorks = CATEGORIES.filter(
		(category) =>
			categoryWorks[category.slug] && categoryWorks[category.slug].length > 0
	);

	return (
		<div className="min-h-screen  bg-white text-black flex justify-center items-center relative">
			<div className="md:w-screen md:px-14 mx-auto md:pb-40 pb-20 relative z-10">
				<header className="mb-16 border-b py-44 relative z-10">
					{/* Left-side h1 */}
					<h1 className="md:text-4xl font-extrabold mb-4 flex items-center text-left">
						<span className="text-[#040b37] md:text-9xl text-7xl">•</span>
						<span className="text-[#040b37] md:text-7xl md:ml-4 text-4xl">
							{current.subject}
						</span>
						<span
							className="md:text-7xl text-4xl md:ml-4 ml-2"
							style={{ color: current.color }}
						>
							{current.verb.substring(0, subIndex)}
							<span className="animate-pulse">|</span>
						</span>
					</h1>
					<p className="md:max-w-lg max-w-xs pr-4 pl-10 md:pr-0 md:pl-0 text-sm md:text-lg mx-auto text-black md:mt-40 mt-28 text-right md:mr-0 relative z-10">
						With CDS Space, you can be confident that your brand is in good
						hands. We&apos;ll help you build a brand that is emotionally
						resonant, valuable, and truly stands out.
					</p>

					{/* Background circle */}
					<div className="md:h-[32rem] md:w-[32rem] h-[28rem] w-[28rem] rounded-full border-[28px] border-[#D9D9D9] absolute -bottom-[35rem] -left-80 z-0"></div>
				</header>

				<div className="md:space-y-24 z-20 py-24 px-6 md:px-0 space-y-20 relative">
					{categoriesWithWorks.map((category) => {
						const works = categoryWorks[category.slug]?.slice(0, 4);

						return (
							<section
								key={category.slug}
								className="category-section md:space-y-32 space-y-8 md:flex justify-between"
							>
								<div className="md:w-5/12">
									<div
										className="cursor-pointer mb-2"
										onClick={() => handleCategoryClick(category.slug)}
									>
										<h2 className="text-2xl md:text-5xl font-black max-">
											{category.name}
										</h2>
									</div>

									<p className="text-black mb-4 max-w-md whitespace-pre-line text-sm md:text-lg">
										{category.description ||
											"Explore creative work done in this category."}
									</p>

									<div className="mt-4">
										<button
											onClick={() => handleCategoryClick(category.slug)}
											className="hover:bg-blue-50 border text-black px-6 py-2 rounded-full transition cursor-pointer"
										>
											View More
										</button>
									</div>
								</div>

								{works.length > 0 && (
									<div className="grid grid-cols-2 md:w-7/12 gap-4 rounded-lg">
										{works.map((work) => (
											<div
												key={work.id}
												className="relative overflow-hidden rounded-lg cursor-pointer"
												onClick={() => handleWorkClick(work)}
											>
												<div className="md:h-60 h-28 rounded-lg w-full">
													<img
														src={
															work.cover_image ||
															"/placeholder.svg?height=300&width=400"
														}
														alt={work.title}
														className="w-full h-full object-cover rounded-lg transition-transform hover:scale-105"
													/>
												</div>

												<div className="absolute hidden inset-0 text-[#D3D3D3] bg-gradient-to-t from-black/70 to-transparent opacity-0 hover:opacity-100 transition-opacity md:flex items-end">
													<div className="p-4">
														<h3 className="text-md font-medium">
															{work.title}
														</h3>
													</div>
												</div>
											</div>
										))}
									</div>
								)}
							</section>
						);
					})}
				</div>
			</div>
		</div>
	);
}
