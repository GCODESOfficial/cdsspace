"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  Boxes,
  PenLine,
  Clapperboard,
  Sparkles,
  ClipboardCheck,
  Archive,
  Settings as SettingsIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const TABS: { label: string; href: string; icon: LucideIcon; exact?: boolean }[] = [
  { label: "Dashboard", href: "/admin/content-hub", icon: LayoutDashboard, exact: true },
  { label: "Calendar", href: "/admin/content-hub/calendar", icon: Calendar },
  { label: "Library", href: "/admin/content-hub/library", icon: Boxes },
  { label: "Create", href: "/admin/content-hub/create", icon: PenLine },
  { label: "BSD Studio", href: "/admin/content-hub/studio", icon: Clapperboard },
  { label: "AI Assistant", href: "/admin/content-hub/ai", icon: Sparkles },
  { label: "Approvals", href: "/admin/content-hub/approvals", icon: ClipboardCheck },
  { label: "Archived", href: "/admin/content-hub/archived", icon: Archive },
  { label: "Settings", href: "/admin/content-hub/settings", icon: SettingsIcon },
];

/**
 * Shared chrome for every Content Hub page: a branded header + a horizontal
 * tab bar mirroring the hub navigation, so the section feels like one app.
 */
export default function ContentHubShell({
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
              <Sparkles className="h-3.5 w-3.5" />
              Content Hub
            </div>
            <h1 className="mt-3 text-[24px] font-bold tracking-tight text-[#0D1B39] sm:text-[28px]">{title}</h1>
            {subtitle && <p className="mt-1 max-w-2xl text-[13.5px] leading-6 text-gray-500">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>

        <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1">
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
