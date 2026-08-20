import Link from "next/link";
import type { Metadata } from "next";
import { Mail, Phone, MessageCircle, MapPin, ArrowRight, Clock } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact Us - CDS Space",
  description: "Get in touch with CDS Space. Email support@cdsspace.pro or call us for branding, design, and development.",
  alternates: { canonical: "https://cdsspace.pro/Contact" },
  openGraph: {
    title: "Contact CDS Space",
    description: "Reach out for world-class branding and digital services.",
    url: "https://cdsspace.pro/Contact",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact CDS Space",
    description: "Reach out for world-class branding and digital services.",
  },
};

// Primary contact details.
const EMAIL = "support@cdsspace.pro";
const PHONE_DISPLAY = "+234 810 282 7049";
const PHONE_TEL = "+2348102827049";
const WHATSAPP_URL = "https://wa.me/2348089539834";

export default function ContactPage() {
  return (
    <main className="text-[#0D1B39]">
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#0A1033]">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-6 py-24 md:px-10 md:py-32">
          <p className="text-[13px] font-bold uppercase tracking-[0.28em] text-blue-300/80">Contact us</p>
          <h1 className="mt-4 max-w-3xl text-5xl font-extrabold leading-[1.05] text-white md:text-7xl">
            Let&apos;s build something remarkable.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
            Have a project, a question, or just want to say hello? Reach the CDS Space team directly - we usually reply within a business day.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <a href={`mailto:${EMAIL}`}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-[15px] font-bold text-[#0A1033] transition hover:bg-white/90">
              <Mail className="h-4.5 w-4.5" /> Email us
            </a>
            <Link href="/consultation"
              className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/5 px-6 py-3.5 text-[15px] font-bold text-white transition hover:bg-white/10">
              Book a consultation <ArrowRight className="h-4.5 w-4.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Contact methods */}
      <section className="mx-auto max-w-6xl px-6 py-16 md:px-10 md:py-24">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <ContactCard
            icon={<Mail className="h-5 w-5" />}
            label="Email"
            value={EMAIL}
            href={`mailto:${EMAIL}`}
            hint="Best for detailed briefs and quotes"
          />
          <ContactCard
            icon={<Phone className="h-5 w-5" />}
            label="Phone"
            value={PHONE_DISPLAY}
            href={`tel:${PHONE_TEL}`}
            hint="Mon - Fri, business hours"
          />
          <ContactCard
            icon={<MessageCircle className="h-5 w-5" />}
            label="WhatsApp"
            value="Chat with us"
            href={WHATSAPP_URL}
            external
            hint="Quick questions and updates"
          />
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div className="flex items-start gap-4 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[#0A4FE8]"><MapPin className="h-5 w-5" /></span>
            <div>
              <p className="text-[12px] font-bold uppercase tracking-wide text-gray-400">Studio</p>
              <p className="mt-1 text-[15px] font-semibold text-[#0D1B39]">CDS Space</p>
              <p className="text-[13px] text-gray-500">Nigeria - working with brands worldwide</p>
            </div>
          </div>
          <div className="flex items-start gap-4 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[#0A4FE8]"><Clock className="h-5 w-5" /></span>
            <div>
              <p className="text-[12px] font-bold uppercase tracking-wide text-gray-400">Response time</p>
              <p className="mt-1 text-[15px] font-semibold text-[#0D1B39]">Within one business day</p>
              <p className="text-[13px] text-gray-500">Faster on WhatsApp for quick questions</p>
            </div>
          </div>
        </div>

        {/* Consultation CTA */}
        <div className="mt-12 overflow-hidden rounded-[28px] bg-[#0A4FE8] p-8 md:p-12">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-extrabold text-white md:text-3xl">Ready to start a project?</h2>
              <p className="mt-2 max-w-xl text-white/75">Book a free consultation and we&apos;ll map out the fastest path from idea to launch.</p>
            </div>
            <Link href="/consultation"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-[15px] font-bold text-[#0035C1] transition hover:bg-white/90">
              Book a consultation <ArrowRight className="h-4.5 w-4.5" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function ContactCard({ icon, label, value, href, hint, external }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href: string;
  hint: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="group flex flex-col rounded-3xl border border-gray-100 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_18px_40px_rgba(10,79,232,0.10)]"
    >
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-[#0A4FE8] transition group-hover:bg-[#0A4FE8] group-hover:text-white">
        {icon}
      </span>
      <p className="mt-4 text-[12px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 break-words text-[17px] font-bold text-[#0D1B39]">{value}</p>
      <p className="mt-1 text-[13px] text-gray-500">{hint}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-[#0A4FE8]">
        {label === "Email" ? "Send an email" : label === "Phone" ? "Call now" : "Open chat"}
        <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
      </span>
    </a>
  );
}
