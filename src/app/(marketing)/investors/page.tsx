import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Building2, LineChart, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Invest in CDS Space",
  description: "Learn about the CDS Space vision, growth model and investor interest process.",
  alternates: { canonical: "https://cdsspace.pro/investors" },
};

const pillars = [
  { icon: Building2, title: "A connected brand platform", copy: "Creative services, production, commerce and collaboration live in one operating system for growing brands." },
  { icon: LineChart, title: "Built for repeat relationships", copy: "Our product direction brings recurring client workflows, fulfilment and communication into one place." },
  { icon: ShieldCheck, title: "Structured participation", copy: "Investor conversations begin with identity, suitability and document checks before any formal offer is made." },
];

export default function InvestorsPage() {
  return (
    <main className="bg-[#F4F6FA] text-[#07113F]">
      <section className="px-5 pb-24 pt-36 sm:px-8 lg:pb-32 lg:pt-48">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold text-[#0A4FE8]">Investor relations</p>
          <div className="mt-5 grid gap-10 lg:grid-cols-[1.2fr_.8fr] lg:items-end">
            <div>
              <h1 className="max-w-4xl text-5xl font-semibold leading-[.98] tracking-[-0.055em] sm:text-6xl lg:text-7xl">Own a part of what we are building.</h1>
              <p className="mt-7 max-w-2xl text-base leading-7 text-[#536075] sm:text-lg">CDS Space is building practical infrastructure for how ambitious brands create, communicate, order and grow. Register your interest to receive verified information when an opportunity is available.</p>
            </div>
            <div className="rounded-[28px] bg-[#0A4FE8] p-7 text-white shadow-[0_24px_70px_rgba(10,79,232,.22)]">
              <BadgeCheck className="h-7 w-7" />
              <h2 className="mt-8 text-2xl font-semibold">Start a private conversation</h2>
              <p className="mt-3 text-sm leading-6 text-blue-100">Tell us about your investment interests. Our team will share the appropriate next steps and documents.</p>
              <Link href="/Contact?interest=investor" className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-[#0A4FE8]">Register interest <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[#DFE5F0] bg-white px-5 py-20 sm:px-8 lg:py-28">
        <div className="mx-auto max-w-6xl">
          <p className="max-w-xl text-sm leading-6 text-[#536075]">Why CDS Space</p>
          <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">A broader relationship with every brand we serve.</h2>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {pillars.map(({ icon: Icon, title, copy }) => (
              <article key={title} className="rounded-[24px] border border-[#DFE5F0] bg-[#F8FAFD] p-7">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-[#0A4FE8]"><Icon className="h-5 w-5" /></span>
                <h3 className="mt-8 text-xl font-semibold">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#5A6579]">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-20 sm:px-8 lg:py-28">
        <div className="mx-auto max-w-4xl rounded-[30px] border border-[#DFE5F0] bg-white p-7 text-center sm:p-12">
          <h2 className="text-3xl font-semibold tracking-[-0.04em]">Interested in the journey?</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-[#5A6579]">This page is for expressions of interest only and is not an offer, solicitation or promise of returns. Any opportunity will be presented through formal, applicable documentation.</p>
          <Link href="/Contact?interest=investor" className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#0A4FE8] px-6 text-sm font-semibold text-white">Contact investor relations <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>
    </main>
  );
}
