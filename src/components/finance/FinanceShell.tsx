'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowDownToLine, ArrowLeft, BarChart3, Briefcase, FileText, Receipt, ScrollText, Tag, Tags, Users, Wallet } from "lucide-react";
import { ReactNode } from "react";

const NAV = [
  { href: "/admin/finance", label: "Overview", icon: BarChart3, exact: true },
  { href: "/admin/finance/projects", label: "Projects", icon: Briefcase },
  { href: "/admin/finance/price-list", label: "Price List", icon: Tag },
  { href: "/admin/finance/pricelists", label: "Pricelists", icon: Tags },
  { href: "/admin/finance/invoices", label: "Invoices", icon: FileText },
  { href: "/admin/finance/quotations", label: "Quotations", icon: ScrollText },
  { href: "/admin/finance/subscriptions", label: "Inflow", icon: ArrowDownToLine },
  { href: "/admin/finance/contractors", label: "Contractors", icon: Users },
  { href: "/admin/finance/expenditures", label: "Expenditures", icon: Receipt },
  { href: "/admin/finance/payroll", label: "Payroll", icon: Wallet },
];

export default function FinanceShell({
  title,
  subtitle,
  back,
  actions,
  children,
  hideNav = false,
}: {
  title: string;
  subtitle?: string;
  back?: { href: string; label: string };
  actions?: ReactNode;
  children: ReactNode;
  // Hide the finance sub-nav pill bar for pages that aren't finance panels
  // (e.g. Brand Briefs) but still want the shell's look and header.
  hideNav?: boolean;
}) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen relative -m-0">
      {/* gradient backdrop */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-blue-100 via-white to-blue-50" />
      <div className="absolute top-0 right-0 -z-10 h-[420px] w-[420px] rounded-full bg-blue-300/30 blur-3xl" />
      <div className="absolute bottom-0 left-1/3 -z-10 h-[360px] w-[360px] rounded-full bg-indigo-200/30 blur-3xl" />

      <div className="px-4 pt-4 pb-12 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8 lg:pb-16 max-w-[1500px] mx-auto">
        {/* sub-nav pill bar */}
        {!hideNav && (
        <nav className="mb-8 flex items-center gap-1.5 overflow-x-auto rounded-2xl bg-white/60 backdrop-blur-xl border border-white/70 shadow-[0_8px_30px_rgba(15,40,90,0.06)] p-1.5">
          {NAV.map((n) => {
            const active = n.exact ? pathname === n.href : pathname?.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition ${
                  active
                    ? "bg-gradient-to-b from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/30"
                    : "text-gray-600 hover:bg-white/70 hover:text-gray-900"
                }`}
              >
                <n.icon className="w-4 h-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>

        {/* header */}
        <div className="flex flex-col gap-4 mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {back && (
              <Link href={back.href} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mb-2">
                <ArrowLeft className="w-4 h-4" /> {back.label}
              </Link>
            )}
            <h1 className="text-3xl sm:text-[34px] leading-tight font-bold text-gray-900 tracking-tight">{title}</h1>
            {subtitle && <p className="text-gray-500 mt-1">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>

        {children}
      </div>
    </div>
  );
}

/* Reusable surface tokens */
export const glassCard =
  "rounded-2xl bg-white/70 backdrop-blur-xl border border-white/70 shadow-[0_10px_40px_rgba(15,40,90,0.06)]";
export const solidCard =
  "rounded-2xl bg-white border border-gray-100 shadow-[0_8px_30px_rgba(15,40,90,0.05)]";
