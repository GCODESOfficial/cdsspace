"use client";

import { Hammer, type LucideIcon } from "lucide-react";

export function ComingSoonModule({
  title,
  description,
  icon: Icon,
  bullets,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  bullets: string[];
}) {
  return (
    <div className="max-w-[900px]">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-brand-blue/10 text-brand-blue flex items-center justify-center">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-[28px] font-bold text-brand-navy tracking-tight">{title}</h1>
          <p className="text-[13px] text-brand-body/60 mt-0.5">{description}</p>
        </div>
      </div>

      <div
        className="relative rounded-3xl p-8 md:p-10 text-white overflow-hidden"
        style={{ backgroundImage: "linear-gradient(146.28deg, #040B37 8.83%, #1C4ED1 86.3%)" }}
      >
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-[10px] uppercase tracking-[0.2em] font-bold">
            <Hammer className="w-3 h-3" />
            In progress
          </span>
          <h2 className="text-[26px] font-bold mt-5 tracking-tight">Rolling out soon</h2>
          <p className="text-white/80 text-[14px] mt-3 max-w-lg leading-relaxed">
            The data model and APIs for this module are already wired up. The UI is being
            refined in the next iteration — you'll see it here when it ships.
          </p>

          <ul className="mt-8 space-y-2.5 text-[13px] text-white/85">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-white/15 flex items-center justify-center mt-0.5 shrink-0 text-[10px]">
                  →
                </span>
                {b}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
