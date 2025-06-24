/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import clsx from "clsx";
import ShortcutCards from "./shortcut-cards";

const cardImages = [
	"/images/card1.svg",
	"/images/card2.svg",
	"/images/card3.svg",
	"/images/card4.svg",
];

export default function GiftCards() {
	const [cards, setCards] = useState(cardImages);
	const [activeCard, setActiveCard] = useState<number | null>(null); // for mobile click effect

	return (
		<section className="bg-[#F5F5F5] md:px-28 px-5 py-28 md:py-32">
			<div className=" bg-[#EDF0F6]  py-10 md:py-20 rounded-xl shadow-lg md:h-[480px] md:max-w-5xl mx-auto">
				{/* Heading and Description */}
				<div className="flex flex-col gap-1 items-center justify-between">
					<h2 className="text-5xl md:text-2xl lg:text-4xl font-semibold leading-[32px] text-[#05050D]">
						Gift Cards
					</h2>
					<p className="text-md font-normal mt-4 md:mt-0 text-center md:w-full md:leading-[32px] text-[#05050D]">
						Get amazing discount from us anytime you patronise our brand.
					</p>
				</div>

				{/* Mobile stacked cards */}
				<div className="mt-20 md:hidden flex flex-col px-5">
					{cards.map((src, index) => (
						<img
							key={index}
							src={src}
							alt={`Gift Card ${index + 1}`}
							loading="lazy"
							onClick={() => setActiveCard(index === activeCard ? null : index)}
							className={clsx(
								"transition-all duration-500 ease-in-out cursor-pointer -mt-8 rounded-xl",
								activeCard === index && "scale-105  z-10"
							)}
							style={{ color: "transparent" }}
						/>
					))}
				</div>

				{/* Desktop grid layout */}
        <div className="max-w-4xl pt-20 mx-6 hidden md:block">
  <ShortcutCards />
</div>

			</div>
		</section>
	);
}
