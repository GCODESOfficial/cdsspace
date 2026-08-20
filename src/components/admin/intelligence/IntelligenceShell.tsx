"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive,
  BarChart3,
  BookOpen,
  FilePlus2,
  LayoutDashboard,
  MessageSquare,
  Newspaper,
  Settings,
  ShieldCheck,
  Tags,
  Users2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const TABS: { label: string; href: string; icon: LucideIcon; exact?: boolean }[] = [
  { label: "Dashboard", href: "/admin/intelligence", icon: LayoutDashboard, exact: true },
  { label: "Publications", href: "/admin/intelligence/library", icon: BookOpen },
  { label: "Create", href: "/admin/intelligence/create", icon: FilePlus2 },
  { label: "Private Reports", href: "/admin/intelligence/private", icon: ShieldCheck },
  { label: "Comments", href: "/admin/intelligence/comments", icon: MessageSquare },
  { label: "Analytics", href: "/admin/intelligence/analytics", icon: BarChart3 },
  { label: "Authors", href: "/admin/intelligence/authors", icon: Users2 },
  { label: "Taxonomy", href: "/admin/intelligence/taxonomy", icon: Tags },
  { label: "Archive", href: "/admin/intelligence/archive", icon: Archive },
  { label: "Settings", href: "/admin/intelligence/settings", icon: Settings },
];

/** Shared module chrome, intentionally aligned with the Content Hub shell. */
export default function IntelligenceShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "";

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#0A4FE8] ring-1 ring-blue-100">
              <Newspaper className="h-3.5 w-3.5" />
              Intelligence
            </div>
            <h1 className="mt-3 text-[24px] font-bold tracking-tight text-[#0D1B39] sm:text-[28px]">{title}</h1>
            {subtitle && <p className="mt-1 max-w-2xl text-[13.5px] leading-6 text-gray-500">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>

        <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1" aria-label="Intelligence sections">
          {TABS.map((tab) => {
            const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-semibold transition ${
                  active
                    ? "bg-[#0A4FE8] text-white shadow-sm"
                    : "text-gray-500 hover:bg-gray-50 hover:text-[#0D1B39]"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {children}
    </div>
  );
}
