"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/lib/i18n/context";
import { initials } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  CalendarCheck,
  Clock,
  Briefcase,
  MessageSquare,
  ShieldCheck,
  Video,
  FileText,
  PenLine,
  UserRound,
  Settings,
  LogOut,
  ExternalLink,
  GraduationCap,
  X,
} from "lucide-react";

interface TeamSidebarProps {
  member: {
    full_name: string;
    avatar_url: string | null;
    role_title: string | null;
    is_sub_admin: boolean;
    has_screening_assignment?: boolean;
  };
  onLogout: () => void;
  mobileOpen?: boolean;
  onClose?: () => void;
}

export function TeamSidebar({ member, onLogout, mobileOpen = false, onClose }: TeamSidebarProps) {
  const pathname = usePathname();
  const { t } = useTranslation();

  const mainItems = [
    { label: t("nav.overview"), href: "/team", icon: LayoutDashboard, exact: true },
    { label: "My Day", href: "/team/my-day", icon: CalendarCheck },
    { label: "Attendance", href: "/team/timebook", icon: Clock },
    { label: t("nav.work"), href: "/team/work", icon: Briefcase },
    { label: "Weekly Report", href: "/team/work-tracking", icon: FileText },
    { label: t("nav.chat"), href: "/team/chat", icon: MessageSquare },
    { label: t("nav.protectDocs"), href: "/team/protect-docs", icon: ShieldCheck },
    { label: t("nav.cmeet"), href: "/team/cmeet", icon: Video },
    { label: t("nav.cdocs"), href: "/team/cdocs", icon: FileText },
    { label: t("nav.csign"), href: "/team/csign", icon: PenLine },
    { label: t("nav.cresume"), href: "/team/cresume", icon: UserRound },
  ];

  const SidebarInner = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex h-full flex-col bg-white">
      <div className="px-5 sm:px-6 py-5 sm:py-6 border-b border-brand-stroke/20 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Image src="/navbar/CDS Logo.svg" alt="CDS Space" width={36} height={36} />
          <div>
            <p className="text-[15px] font-bold text-brand-navy tracking-tight">CDS Space</p>
            <p className="text-[10px] uppercase tracking-[0.15em] text-brand-body/50 font-semibold">
              Team Portal
            </p>
          </div>
        </div>
        {mobile && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-brand-body transition hover:bg-brand-bg"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {mainItems.map((item) => {
          const Icon = item.icon;
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] transition ${
                active
                  ? "bg-brand-blue text-white font-semibold shadow-[0_6px_18px_rgba(28,78,209,0.25)]"
                  : "text-brand-body hover:bg-brand-bg/70 hover:text-brand-navy"
              }`}
            >
              <Icon className="w-[18px] h-[18px]" />
              <span>{item.label}</span>
            </Link>
          );
        })}

        {member.has_screening_assignment && (
          <Link
            href="/team/screening"
            onClick={onClose}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] transition ${
              pathname === "/team/screening" || pathname?.startsWith("/team/screening/")
                ? "bg-brand-blue text-white font-semibold shadow-[0_6px_18px_rgba(28,78,209,0.25)]"
                : "text-brand-body hover:bg-brand-bg/70 hover:text-brand-navy"
            }`}
          >
            <GraduationCap className="w-[18px] h-[18px]" />
            <span>Screening Questions</span>
          </Link>
        )}

        {member.is_sub_admin && (
          <>
            <div className="pt-4 pb-1 px-3">
              <p className="text-[10px] uppercase tracking-[0.15em] text-brand-body/40 font-semibold">
                Staff
              </p>
            </div>
            <Link
              href="/admin"
              onClick={onClose}
              className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[13.5px] text-brand-body hover:bg-brand-bg/70 hover:text-brand-navy transition"
            >
              <span className="inline-flex items-center gap-3">
                <ShieldCheck className="w-[18px] h-[18px]" />
                {t("nav.adminDashboard")}
              </span>
              <ExternalLink className="w-3.5 h-3.5 opacity-50" />
            </Link>
          </>
        )}
      </nav>

      <div className="p-3 border-t border-brand-stroke/20 space-y-1">
        <Link
          href="/team/settings"
          onClick={onClose}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] transition ${
            pathname?.startsWith("/team/settings")
              ? "bg-brand-bg text-brand-navy font-semibold"
              : "text-brand-body hover:bg-brand-bg/70 hover:text-brand-navy"
          }`}
        >
          <Settings className="w-[18px] h-[18px]" />
          {t("nav.settings")}
        </Link>
        <button
          onClick={() => {
            onClose?.();
            onLogout();
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] text-rose-600 hover:bg-rose-50 transition"
        >
          <LogOut className="w-[18px] h-[18px]" />
          {t("nav.logout")}
        </button>

        <div className="mt-2 px-3 py-3 rounded-xl bg-brand-bg/60 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-brand-blue text-white text-[13px] font-bold flex items-center justify-center">
            {initials(member.full_name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-brand-navy truncate">
              {member.full_name}
            </p>
            {member.role_title && (
              <p className="text-[11px] text-brand-body/60 truncate">{member.role_title}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:flex w-[260px] shrink-0 h-screen sticky top-0 bg-white border-r border-brand-stroke/30 flex-col">
        <SidebarInner />
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 z-40 bg-[#040B37]/25 backdrop-blur-[2px] lg:hidden"
              aria-label="Close navigation overlay"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="fixed inset-y-0 left-0 z-50 w-[86vw] max-w-[320px] border-r border-brand-stroke/30 bg-white shadow-2xl lg:hidden"
            >
              <SidebarInner mobile />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
