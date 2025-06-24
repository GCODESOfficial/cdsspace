/* eslint-disable @next/next/no-img-element */
"use client"
import clsx from "clsx";


export default function ShortcutCards() {
  // Array of card images with positioning data
  const cards = [
    {
      id: 1,
      image: "/images/card1.svg",
      offset: "left-0",
      zIndex: "z-40",
    },
    {
      id: 2,
      image: "/images/card2.svg",
      offset: "left-[25%]",
      zIndex: "z-30",
    },
    {
      id: 3,
      image: "/images/card3.svg",
      offset: "left-[50%]",
      zIndex: "z-20",
    },
    {
      id: 4,
      image: "/images/card4.svg",
      offset: "left-[75%]",
      zIndex: "z-10",
    },
  ]

  return (
    <div className="relative w-full flex justify-center">
      {cards.map((card) => (
        <div
          key={card.id}
          className={`absolute ${card.offset} ${card.zIndex} rounded-2xl flex justify-center transition-all duration-300 ease-in-out hover:scale-110 hover:z-40 cursor-pointer hover:shadow-2xl`}
        >

            {/* Optional SVG glow effect */}
								{(card.id === 0 || card.id === 4) && (
									<svg
										className={clsx(
											"absolute hidden md:inline",
											card.id === 0 ? "-top-[10%]" : "-top-[110%] -left-20"
										)}
										width="406"
										height="406"
										viewBox="0 0 406 406"
										fill="none"
										xmlns="http://www.w3.org/2000/svg"
									>
										<g filter="url(#glow)">
											<circle
												cx="203.009"
												cy="203.144"
												r="78.3151"
												fill={card.id === 0 ? "#0E3997" : "#5B1AFE"}
												fillOpacity="0.5"
											/>
										</g>
										<defs>
											<filter
												id="glow"
												x="0.394"
												y="0.529"
												width="405.23"
												height="405.23"
												filterUnits="userSpaceOnUse"
												colorInterpolationFilters="sRGB"
											>
												<feFlood floodOpacity="0" result="BackgroundImageFix" />
												<feBlend
													mode="normal"
													in="SourceGraphic"
													in2="BackgroundImageFix"
													result="shape"
												/>
												<feGaussianBlur
													stdDeviation="62.15"
													result="effect1_foregroundBlur"
												/>
											</filter>
										</defs>
									</svg>
								)}
          <div className="relative overflow-hidden rounded-2xl shadow-[0_10px_60px_rgba(0,0,0,0.2)] w-[305px]">
            <img
              src={card.image || "/placeholder.svg"}
              alt={`Card ${card.id}`}
              className=""
            />
          </div>
        </div>
      ))}
    </div>
  )
}
