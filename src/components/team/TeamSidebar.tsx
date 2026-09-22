"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/lib/i18n/context";
import { initials } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  KanbanSquare,
  Clock,
  Briefcase,
  MessageSquare,
  ShieldCheck,
  Video,
  FileText,
  PenLine,
  Settings,
  LogOut,
  ArrowRightLeft,
  GraduationCap,
  X,
  ClipboardCheck,
  PackageCheck,
  MonitorCog,
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
    { label: "Taskboard", href: "/team/taskboard", icon: KanbanSquare },
    { label: "Attendance", href: "/team/timebook", icon: Clock },
    { label: "Projects", href: "/team/work", icon: Briefcase },
    { label: "Delivery drafts", href: "/team/deliveries", icon: PackageCheck },
    { label: "Work Reports", href: "/team/work-tracking", icon: FileText },
    { label: "Team compliance", href: "/team/compliance", icon: ClipboardCheck },
    { label: "My equipment", href: "/team/equipment", icon: MonitorCog },
    { label: t("nav.chat"), href: "/team/chat", icon: MessageSquare },
    { label: t("nav.protectDocs"), href: "/team/protect-docs", icon: ShieldCheck },
    { label: t("nav.cmeet"), href: "/team/cmeet", icon: Video },
    { label: t("nav.cdocs"), href: "/team/cdocs", icon: FileText },
    { label: t("nav.csign"), href: "/team/csign", icon: PenLine },
    { label: "Create Studio", href: "/create?workspace=team", icon: PenLine },
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
              className={`flex min-h-11 items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] transition ${
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
            className={`flex min-h-11 items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] transition ${
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
          <Link
            href="/admin"
            onClick={onClose}
            className="mt-4 flex min-h-11 items-center gap-3 rounded-xl bg-[#0A4FE8] px-3 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_8px_22px_rgba(10,79,232,0.2)] transition hover:bg-[#083FC0]"
          >
            <ArrowRightLeft className="h-[18px] w-[18px]" />
            Open admin portal
          </Link>
        )}
      </nav>

      <div className="p-3 border-t border-brand-stroke/20 space-y-1">
        {/* Account element doubles as the entry to Settings, so the standalone
            Settings nav item is retired in favour of this single account link. */}
        <Link
          href="/team/settings"
          onClick={onClose}
          title={t("nav.settings")}
          aria-label={t("nav.settings")}
          className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
            pathname?.startsWith("/team/settings")
              ? "bg-brand-bg ring-1 ring-brand-stroke/40"
              : "hover:bg-brand-bg/70"
          }`}
        >
          {member.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={member.avatar_url}
              alt={member.full_name}
              className="w-9 h-9 rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-brand-blue text-white text-[13px] font-bold flex items-center justify-center shrink-0">
              {initials(member.full_name)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-brand-navy truncate">
              {member.full_name}
            </p>
            {member.role_title && (
              <p className="text-[11px] text-brand-body/60 truncate">{member.role_title}</p>
            )}
          </div>
          <Settings className="w-4 h-4 shrink-0 text-brand-body/40 transition group-hover:text-brand-body/70" />
        </Link>
        <button
          onClick={() => {
            onClose?.();
            onLogout();
          }}
          className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] text-rose-600 transition hover:bg-rose-50"
        >
          <LogOut className="w-[18px] h-[18px]" />
          {t("nav.logout")}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 flex-col border-e border-brand-stroke/30 bg-white lg:flex">
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
              initial={{ x: "var(--drawer-offset)" }}
              animate={{ x: 0 }}
              exit={{ x: "var(--drawer-offset)" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="fixed inset-y-0 start-0 z-50 w-[86vw] max-w-[320px] border-e border-brand-stroke/30 bg-white shadow-2xl [--drawer-offset:-100%] rtl:[--drawer-offset:100%] lg:hidden"
            >
              <SidebarInner mobile />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
