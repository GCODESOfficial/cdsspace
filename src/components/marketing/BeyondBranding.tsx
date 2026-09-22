import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

type Card = {
  id: "create" | "cmeet" | "cgifts" | "investors";
  title: string;
  description: string;
  action: string;
  href: string;
  desktop: string;
  mobile: string;
  className: string;
};

const assetRoot = "/extra-section";
const cards: Card[] = [
  {
    id: "create",
    title: "Letter-head & Barcodes",
    description: "Create official letter-heads on the go and generate barcodes for your product, business or events.",
    action: "Start creating",
    href: "/create?workspace=client",
    desktop: `${assetRoot}/web/❇️ Landing page/w.frame.04.png`,
    mobile: `${assetRoot}/mobile/❇️ Landing page/m.frame.04.png`,
    className: "order-1 aspect-[361/712] lg:row-span-2 lg:aspect-auto",
  },
  {
    id: "cmeet",
    title: "Conference Call Inference",
    description: "Experience clearer conversations with smarter call inference.",
    action: "Start a cMeet",
    href: "/dashboard/cmeet",
    desktop: `${assetRoot}/web/❇️ Landing page/w.frame.03.png`,
    mobile: `${assetRoot}/mobile/❇️ Landing page/m.frame.01.png`,
    className: "order-4 aspect-[361/314] lg:order-2 lg:col-span-2 lg:aspect-auto",
  },
  {
    id: "cgifts",
    title: "Corporate Gifts",
    description: "Premium, custom-branded gifts that leave a lasting impression.",
    action: "Explore cGifts",
    href: "/dashboard/cgifts",
    desktop: `${assetRoot}/web/❇️ Landing page/w.frame.02.png`,
    mobile: `${assetRoot}/mobile/❇️ Landing page/m.frame.03.png`,
    className: "order-2 aspect-[361/386] lg:order-3 lg:aspect-auto",
  },
  {
    id: "investors",
    title: "Own a part of CDS Space",
    description: "Invest early and grow with us.",
    action: "Learn more",
    href: "/investors",
    desktop: `${assetRoot}/web/❇️ Landing page/w.frame.01.png`,
    mobile: `${assetRoot}/mobile/❇️ Landing page/m.frame.02.png`,
    className: "order-3 aspect-[361/386] lg:order-4 lg:aspect-auto",
  },
];

function BentoCard({ card }: { card: Card }) {
  return (
    <Link
      href={card.href}
      aria-label={`${card.action}: ${card.title}`}
      className={`group relative isolate block min-h-0 overflow-hidden rounded-[24px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0A4FE8]/25 ${card.className}`}
    >
      <Image src={card.mobile} alt="" fill sizes="(max-width: 1023px) calc(100vw - 32px), 1px" className="object-fill lg:hidden" />
      <Image src={card.desktop} alt="" fill sizes="(min-width: 1024px) 40vw, 1px" className="hidden object-fill lg:block" />

      <div className={`absolute z-10 ${card.id === "cmeet" ? "left-[8%] top-[9%] max-w-[43%] lg:left-[4%] lg:top-[10%] lg:max-w-[35%]" : "left-[8%] top-[5%] max-w-[70%] lg:left-[7%] lg:top-[5%] lg:max-w-[67%]"}`}>
        <h3 className="text-[clamp(1rem,5.3vw,1.35rem)] font-semibold leading-[1.08] tracking-[-0.035em] text-[#07113F] lg:text-[clamp(1.15rem,1.55vw,1.75rem)]">
          {card.title}
        </h3>
        <p className="mt-2 text-[clamp(.63rem,2.65vw,.78rem)] leading-[1.25] text-[#4D586D] lg:text-[clamp(.68rem,.82vw,.9rem)]">
          {card.description}
        </p>
      </div>

      <span className="absolute bottom-[5%] left-[8%] z-10 inline-flex items-center gap-2 text-[clamp(.65rem,2.8vw,.8rem)] font-medium text-[#3F4B62] transition-colors group-hover:text-[#0A4FE8] lg:left-[7%] lg:text-sm">
        {card.action}<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
      </span>

      {/* The supplied artwork contains decorative bursts. These flat patches
          keep the requested artwork while following the product's restrained
          visual language. */}
      {card.id === "create" && <span aria-hidden className="absolute left-[72%] top-[68%] z-[5] h-[5%] w-[8%] rounded-full bg-[#F2F5FC] lg:left-[70%] lg:top-[68%]" />}
      {card.id === "investors" && <span aria-hidden className="absolute left-[88%] top-[51%] z-[5] h-[7%] w-[8%] rounded-full bg-white" />}
      {card.id === "cmeet" && <><span aria-hidden className="absolute left-[48%] top-[65%] z-[5] h-[8%] w-[7%] rounded-full bg-[#F2F5FC]" /><span aria-hidden className="absolute left-[92%] top-[65%] z-[5] h-[8%] w-[7%] rounded-full bg-[#F2F5FC]" /></>}
    </Link>
  );
}

export function BeyondBranding() {
  return (
    <section className="bg-[#F3F5FA] px-4 py-20 sm:px-6 lg:py-28" aria-labelledby="beyond-branding-title">
      <div className="mx-auto max-w-[1240px]">
        <header className="mx-auto max-w-3xl text-center">
          <h2 id="beyond-branding-title" className="text-[clamp(2rem,4vw,3.5rem)] font-semibold leading-tight tracking-[-0.045em] text-[#07113F]">
            We are beyond branding
          </h2>
          <p className="mt-4 text-sm text-[#536075] sm:text-base lg:text-lg">
            Useful tools, services, and opportunities, all in one space.
          </p>
        </header>

        <div className="mt-14 grid grid-cols-1 gap-4 lg:mt-20 lg:grid-cols-[minmax(300px,418px)_minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-[314px_386px] lg:gap-3">
          {cards.map((card) => <BentoCard key={card.id} card={card} />)}
        </div>
      </div>
    </section>
  );
}
