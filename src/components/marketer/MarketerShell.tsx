"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BadgePercent, CreditCard, IdCard, LayoutDashboard, LogOut, UserRound } from "lucide-react";
import { marketerLogout } from "@/lib/actions/marketer-auth";

const NAV = [
  { href: "/marketer", label: "Overview", icon: LayoutDashboard },
  { href: "/marketer/earnings", label: "Earnings", icon: BadgePercent },
  { href: "/marketer/profile", label: "Profile & account", icon: UserRound },
  { href: "/marketer/id-card", label: "Marketer ID", icon: IdCard },
];

export function MarketerShell({ children, name, publicId, code }: { children: React.ReactNode; name: string; publicId: string; code: string | null }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-[#F3F6FD] text-[#040B37]">
      <header className="sticky top-0 z-30 border-b border-[#E3E8F4] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-18 max-w-[1480px] items-center gap-5 px-5 lg:px-8">
          <Link href="/marketer" className="flex shrink-0 items-center gap-3"><Image src="/navbar/CDS Logo.svg" alt="CDS Space" width={62} height={28} /><span className="hidden border-l border-[#E3E8F4] pl-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#667085] sm:block">Marketers</span></Link>
          <div className="ml-auto hidden items-center gap-3 text-right sm:flex"><div><p className="text-[13px] font-semibold">{name}</p><p className="text-[10px] text-[#98A2B3]">{code || publicId}</p></div><div className="grid size-10 place-items-center rounded-full bg-[#075BE5] text-[12px] font-bold text-white">{initials(name)}</div></div>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1480px] lg:grid-cols-[230px_1fr]">
        <aside className="hidden min-h-[calc(100vh-72px)] border-r border-[#E3E8F4] bg-white p-4 lg:flex lg:flex-col">
          <nav className="space-y-1">{NAV.map(({ href, label, icon: Icon }) => { const active = href === "/marketer" ? pathname === href : pathname.startsWith(href); return <Link key={href} href={href} className={`flex h-12 items-center gap-3 rounded-[12px] px-4 text-[13px] font-semibold transition ${active ? "bg-[#0A4FE8] text-white shadow-[0_8px_18px_rgba(5,90,230,.2)]" : "text-[#4A5578] hover:bg-[#F3F6FD]"}`}><Icon className="size-5" />{label}</Link>; })}</nav>
          <button onClick={async () => { await marketerLogout(); window.location.replace("/marketer/login"); }} className="mt-auto flex h-12 items-center gap-3 rounded-[12px] px-4 text-[13px] font-semibold text-[#667085] hover:bg-red-50 hover:text-red-600"><LogOut className="size-5" />Sign out</button>
        </aside>
        <main className="min-w-0 p-4 pb-24 sm:p-6 lg:p-8">{children}</main>
      </div>
      <nav className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-4 rounded-[16px] border border-[#E3E8F4] bg-white p-2 shadow-[0_16px_50px_rgba(4,11,55,.16)] lg:hidden">{NAV.map(({ href, label, icon: Icon }) => { const active = href === "/marketer" ? pathname === href : pathname.startsWith(href); return <Link key={href} href={href} className={`flex min-w-0 flex-col items-center gap-1 rounded-[10px] px-1 py-2 text-[9px] font-semibold ${active ? "bg-blue-50 text-[#075BE5]" : "text-[#667085]"}`}><Icon className="size-5" /><span className="truncate">{label.replace(" & account", "")}</span></Link>; })}</nav>
    </div>
  );
}

function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "BM"; }
