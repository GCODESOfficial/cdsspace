"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Menu, Search } from "lucide-react";
import { I18nProvider, useTranslation } from "@/lib/i18n/context";
import { TeamSidebar } from "@/components/team/TeamSidebar";
import { NotificationBell } from "@/components/team/NotificationBell";
import { LanguageSwitcher } from "@/components/team/LanguageSwitcher";

interface Member {
  id: string;
  full_name: string;
  email: string;
  username: string;
  avatar_url: string | null;
  role_title: string | null;
  department: string | null;
  is_sub_admin: boolean;
  permissions: string[];
  language: string | null;
}

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <TeamLayoutInner>{children}</TeamLayoutInner>
    </I18nProvider>
  );
}

function TeamLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [member, setMember] = useState<Member | null>(null);
  const [checking, setChecking] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { t } = useTranslation();

  const isLoginPage = pathname === "/team/login" || pathname?.includes("/login");
  const isInvitePage = pathname?.includes("/team/invite") || pathname?.includes("/invite/");

  const loadSession = useCallback(async () => {
    // Never load session or redirect if we are obviously on an auth/invite page
    if (isLoginPage || isInvitePage) {
      setChecking(false);
      return;
    }

    try {
      const res = await fetch("/api/team/session", { credentials: "include" });
      if (!res.ok) {
        // Double check we haven't navigated to an invite page while the fetch was in flight
        if (!window.location.pathname.includes("/login") && !window.location.pathname.includes("/invite")) {
          router.replace("/team/login");
        }
        setChecking(false);
        return;
      }
      const json = await res.json();
      setMember(json.member);
    } catch {
      if (!window.location.pathname.includes("/login") && !window.location.pathname.includes("/invite")) {
        router.replace("/team/login");
      }
    } finally {
      setChecking(false);
    }
  }, [isInvitePage, isLoginPage, router]);

  useEffect(() => {
    if (!pathname) return; // Wait for pathname to settle
    
    if (isLoginPage || isInvitePage) {
      setChecking(false);
      return;
    }
    loadSession();

    // Listen for custom "refresh-team-session" events from sub-pages
    const handleRefresh = () => loadSession();
    window.addEventListener("refresh-team-session", handleRefresh);
    return () => window.removeEventListener("refresh-team-session", handleRefresh);
  }, [isInvitePage, isLoginPage, loadSession]);

  const handleLogout = useCallback(async () => {
    await fetch("/api/team/logout", { method: "POST", credentials: "include" });
    router.replace("/team/login");
  }, [router]);

  if (isLoginPage || isInvitePage) return <>{children}</>;

  if (checking) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-brand-blue animate-spin" />
      </div>
    );
  }

  if (!member) return null;

  return (
    <div className="min-h-screen bg-brand-bg flex">
      <TeamSidebar member={member} onLogout={handleLogout} mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 bg-brand-bg/80 backdrop-blur-md border-b border-brand-stroke/30">
          <div className="flex flex-col gap-3 px-3 sm:px-6 lg:px-8 py-3 sm:py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-3 min-w-0 md:flex-1 md:max-w-md">
              <div className="flex items-center justify-between gap-3 md:hidden">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => setMobileNavOpen(true)}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-brand-navy shadow-sm transition hover:bg-brand-bg lg:hidden"
                    aria-label="Open navigation"
                  >
                    <Menu className="w-5 h-5" />
                  </button>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-brand-navy truncate">
                      {member.full_name.split(" ")[0]}
                    </p>
                    <p className="text-[11px] text-brand-body/60">Team portal</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <LanguageSwitcher compact />
                  <NotificationBell />
                </div>
              </div>

              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(true)}
                  className="hidden h-10 w-10 items-center justify-center rounded-full bg-white text-brand-navy shadow-sm transition hover:bg-brand-bg lg:hidden md:flex"
                  aria-label="Open navigation"
                >
                  <Menu className="w-5 h-5" />
                </button>
                <div className="relative w-full min-w-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-body/40" />
                  <input
                    type="text"
                    placeholder={t("common.search")}
                    className="w-full pl-9 pr-3 py-2.5 rounded-2xl bg-white border border-brand-stroke/40 text-[13px] placeholder:text-brand-body/40 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue/40 transition"
                  />
                </div>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-2 sm:gap-3 ml-auto">
              <LanguageSwitcher compact />
              <NotificationBell />
              <div className="hidden md:flex flex-col text-right">
                <span className="text-[11px] text-brand-body/60">Signed in as</span>
                <span className="text-[13px] font-semibold text-brand-navy">
                  {member.full_name}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-5 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
