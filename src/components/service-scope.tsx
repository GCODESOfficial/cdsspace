"use client";

import { useEffect } from "react";
import AOS from "aos";

interface ServiceCategory {
	title: string;
	services: string[];
}

const serviceCategories: ServiceCategory[] = [
	{
		title: "Brand Communication Strategy",
		services: [
			"Brand Identity Development",
			"Marketing Strategy",
			"Content Strategy",
			"Social Media Management",
			"Public Relations",
			"Crisis Management",
			"Market Research",
			"Competitive Analysis",
		],
	},
	{
		title: "Design & Development",
		services: [
			"UI/UX Design",
			"Web Development",
			"Mobile App Development",
			"Graphic Design",
			"Motion Graphics",
			"3D Visualization",
			"Prototyping",
			"E-commerce Solutions",
		],
	},
	{
		title: "Print Production",
		services: [
			"Brochure Design",
			"Business Cards",
			"Packaging Design",
			"Large Format Printing",
			"Promotional Materials",
			"Annual Reports",
			"Catalogs",
			"Custom Print Solutions",
		],
	},
];

export default function ServiceScope() {
	useEffect(() => {
		AOS.init({
			duration: 1000,
			once: true,
		});
	}, []);

	return (
		<section className="py-24 bg-[#f5f5f5]  text-[#040b37]">
			<div className="container mx-auto px-4">
				<h2
					className="text-3xl md:text-5xl font-extrabold md:text-left text-center px-14 mb-12"
					data-aos="fade-up"
				>
					Our Service Scope
				</h2>
			</div>

      <div className="flex justify-center items-center bg-white py-24 mx-0">
					<div
						className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl px-4"
						data-aos="fade-up"
						data-aos-delay="200"
					>
						{serviceCategories.map((category, index) => (
							<div
								key={index}
								className="space-y-4 border border-[#0A4FE8] p-6 rounded-2xl shadow-sm"
							>
								<h3 className="font-semibold text-black text-lg">
									{category.title}
								</h3>
								<hr className="border-t border-[#0A4FE8]" />
								<ul className="space-y-2 list-disc px-6 text-black">
									{category.services.map((service, serviceIndex) => (
										<li key={serviceIndex}>{service}</li>
									))}
								</ul>
							</div>
						))}
					</div>
				</div>
		</section>
	);
}
