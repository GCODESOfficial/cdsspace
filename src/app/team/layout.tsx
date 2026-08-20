"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BadgeAlert, ChevronRight, Loader2, Menu, Search } from "lucide-react";
import { I18nProvider, useTranslation } from "@/lib/i18n/context";
import { TeamSidebar } from "@/components/team/TeamSidebar";
import { NotificationBell } from "@/components/team/NotificationBell";
import { LanguageSwitcher } from "@/components/team/LanguageSwitcher";
import { WorkTracker } from "@/components/team/WorkTracker";
import { DashboardAutoSave } from "@/components/autosave/DashboardAutoSave";

interface Member {
  id: string;
  full_name: string;
  email: string;
  email_verified_at: string | null;
  username: string;
  avatar_url: string | null;
  role_title: string | null;
  department: string | null;
  is_sub_admin: boolean;
  permissions: string[];
  language: string | null;
  has_screening_assignment?: boolean;
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

  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(member.email || "");
  const emailIncomplete = !emailLooksValid || !member.email_verified_at;

  return (
    <div data-app-shell="team" className="flex min-h-[100dvh] max-w-full items-start overflow-x-clip bg-brand-bg">
      <DashboardAutoSave scope="team" />
      <WorkTracker />
      <TeamSidebar member={member} onLogout={handleLogout} mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      <div className="flex min-h-[100dvh] min-w-0 flex-1 flex-col overflow-visible">
        {/* Topbar */}
        <header className="sticky top-0 z-30 border-b border-brand-stroke/70 bg-brand-bg/95 backdrop-blur-lg">
          <div className="flex flex-col gap-3 px-3 sm:px-6 lg:px-8 py-3 sm:py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-3 min-w-0 md:flex-1 md:max-w-md">
              <div className="flex items-center justify-between gap-3 md:hidden">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => setMobileNavOpen(true)}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-stroke bg-white text-brand-navy shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-brand-blue lg:hidden"
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
                  className="hidden h-10 w-10 items-center justify-center rounded-xl border border-brand-stroke bg-white text-brand-navy shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-brand-blue lg:hidden md:flex"
                  aria-label="Open navigation"
                >
                  <Menu className="w-5 h-5" />
                </button>
                <div className="relative w-full min-w-0">
                  <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-body/40" />
                  <input
                    type="text"
                    placeholder={t("common.search")}
                    className="w-full rounded-xl border border-brand-stroke bg-white py-2.5 ps-9 pe-3 text-start text-[13px] shadow-sm placeholder:text-brand-body/40 transition focus:border-brand-blue/40 focus:outline-none focus:ring-4 focus:ring-blue-100/80"
                  />
                </div>
              </div>
            </div>

            <div className="ms-auto hidden items-center gap-2 sm:gap-3 md:flex">
              <LanguageSwitcher compact />
              <NotificationBell />
            </div>
          </div>
        </header>

        {emailIncomplete && (
          <button
            type="button"
            onClick={() => router.push("/team/settings?verify_email=1#email-verification")}
            className="mx-3 mt-3 flex w-auto shrink-0 items-center gap-3 rounded-xl border border-rose-700 bg-rose-600 px-3 py-3 text-left text-white shadow-sm transition hover:bg-rose-700 sm:mx-4 md:mx-6 lg:mx-8"
          >
            <BadgeAlert className="h-5 w-5 shrink-0" />
            <span className="min-w-0 flex-1 text-[12px] leading-5">
              <strong className="font-semibold">Incomplete information:</strong>{" "}
              {emailLooksValid ? "verify your email address to receive task updates." : "add and verify a valid email address to receive task updates."}
            </span>
            <span className="hidden shrink-0 items-center gap-1 text-[11px] font-semibold sm:inline-flex">
              Complete profile <ChevronRight className="h-4 w-4" />
            </span>
          </button>
        )}

        {/* Content */}
        <main data-app-content className="min-h-0 min-w-0 flex-1 overflow-x-clip px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 sm:px-4 sm:pt-5 md:px-6 lg:px-8 lg:pb-10 lg:pt-8">{children}</main>
      </div>
    </div>
  );
}
