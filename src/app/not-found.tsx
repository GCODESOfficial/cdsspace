import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Home } from "lucide-react";

export default function NotFound() {
  return (
    <main className="relative min-h-[100svh] overflow-hidden bg-[#F5EFE5] text-[#0D1B39]">
      <Image
        src="/images/404-arabian-desert-horses.jpg"
        alt=""
        fill
        priority
        quality={90}
        sizes="100vw"
        className="object-cover object-[72%_center] md:object-center"
      />

      <div
        aria-hidden="true"
        className="absolute inset-0 hidden md:block"
        style={{
          background: "linear-gradient(90deg, rgba(255,253,248,.98) 0%, rgba(255,253,248,.91) 31%, rgba(255,253,248,.52) 53%, rgba(255,253,248,.08) 78%)",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 md:hidden"
        style={{
          background: "linear-gradient(180deg, rgba(255,253,248,.98) 0%, rgba(255,253,248,.92) 43%, rgba(255,253,248,.48) 68%, rgba(255,253,248,.12) 100%)",
        }}
      />

      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-5 sm:px-8 sm:py-7 lg:px-12">
        <Link
          href="/"
          aria-label="CDS Space home"
          className="inline-flex items-center rounded-2xl border border-white/70 bg-white/65 px-4 py-3 shadow-sm backdrop-blur-md transition hover:bg-white/90"
        >
          <Image src="/navbar/CDS Logo.svg" alt="CDS Space" width={82} height={32} priority />
        </Link>
        <span className="rounded-full border border-[#0D1B39]/10 bg-white/40 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#0D1B39]/55 backdrop-blur-sm">
          Error 404
        </span>
      </header>

      <section className="relative z-[1] flex min-h-[100svh] items-start px-6 pb-28 pt-36 sm:px-10 sm:pt-40 md:items-center md:px-16 md:pb-24 md:pt-28 lg:px-24 xl:px-[9vw]">
        <div className="max-w-[590px]">
          <p className="mb-5 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.2em] text-[#A56B30]">
            <span className="h-px w-9 bg-[#A56B30]/60" />
            The trail went quiet
          </p>

          <p className="select-none text-[clamp(6rem,13vw,11rem)] font-black leading-[0.72] tracking-[-0.08em] text-[#0D1B39]">
            404
          </p>
          <h1 className="mt-8 max-w-[540px] text-[clamp(2rem,4vw,4.1rem)] font-bold leading-[1.02] tracking-[-0.045em] text-[#0D1B39]">
            This path ends here.
            <span className="block text-[#A56B30]">Your journey doesn&apos;t.</span>
          </h1>
          <p className="mt-6 max-w-[490px] text-[15px] leading-7 text-[#40506A] sm:text-[16px]">
            The page you&apos;re looking for may have moved or no longer exists. Return home, or continue exploring the work shaping ambitious brands.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/"
              className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#0A4FE8] px-6 py-3 text-[13px] font-bold text-white shadow-[0_12px_28px_rgba(10,79,232,.2)] transition hover:-translate-y-0.5 hover:bg-[#083FC1]"
            >
              <Home className="h-4 w-4" />
              Return home
            </Link>
            <Link
              href="/work"
              className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[#0D1B39]/15 bg-white/65 px-6 py-3 text-[13px] font-bold text-[#0D1B39] backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-white"
            >
              Explore our work
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          <Link
            href="/intelligence"
            className="mt-7 inline-flex items-center gap-2 text-[12px] font-semibold text-[#0D1B39]/55 transition hover:text-[#0A4FE8]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Visit CDS Space Intelligence
          </Link>
        </div>
      </section>

      <footer className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between px-6 py-5 text-[9px] font-bold uppercase tracking-[0.16em] text-[#0D1B39]/45 sm:px-10 lg:px-12">
        <span>CDS Space</span>
        <span className="hidden sm:inline">Branding beyond borders</span>
      </footer>
    </main>
  );
}
