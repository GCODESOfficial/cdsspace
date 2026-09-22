"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Compass,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  LayoutDashboard,
  MessageSquare,
  Newspaper,
  Package,
  Palette,
  ReceiptText,
  Settings,
  ShoppingBag,
  UserRound,
  X,
} from "lucide-react";
import { useClientAccount } from "@/components/dashboard/ClientAccountProvider";

const NEW_ACCOUNT_WINDOW_MS = 21 * 24 * 60 * 60 * 1000;

const modules = [
  { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard, description: "Your overview for recent deliveries, current activity and the next useful action." },
  { name: "Intelligence", path: "/dashboard/intelligence", icon: Newspaper, description: "Read CDS Space research, case studies, audits and practical market insights." },
  { name: "Brand Brief", path: "/dashboard/brand-brief", icon: FileText, description: "Tell our team about your brand, audience, goals, references and project scope." },
  { name: "Brand Identity", path: "/dashboard/brand-identity", icon: Palette, description: "Review the completed identity systems, guidelines and final brand assets delivered to you." },
  { name: "Banners", path: "/dashboard/banners", icon: ImageIcon, description: "Configure print banners, upload artwork, request a design and follow production." },
  { name: "Merch", path: "/dashboard/merch", icon: Package, description: "Order branded merchandise, share print files and track fulfilment from one place." },
  { name: "Chat/Meet", path: "/dashboard/messages", icon: MessageSquare, description: "Message the CDS Space team, share files and join project calls without leaving the portal." },
  { name: "Orders", path: "/dashboard/orders", icon: ShoppingBag, description: "See every request and its progress from draft and payment through delivery." },
  { name: "Invoices", path: "/dashboard/invoices", icon: ReceiptText, description: "Review invoices, submit transfer evidence, follow verification and download receipts." },
  { name: "cDrive", path: "/dashboard/cdrive", icon: FolderOpen, description: "Create project drives, collaborate on files, and open finished deliveries securely." },
  { name: "Account Config", path: "/dashboard/settings", icon: Settings, description: "Complete your profile, photo, security details, currency and payment preferences." },
] as const;

type NoticeKey = "profile" | "welcome" | "tour";

export default function ClientOnboardingCoach() {
  const { account, dashboardPath } = useClientAccount();
  const pathname = usePathname();
  const router = useRouter();
  const storagePrefix = `cds.client.onboarding.${account.userId}`;
  const [mounted, setMounted] = useState(false);
  const [hidden, setHidden] = useState<Record<NoticeKey, boolean>>({ profile: false, welcome: false, tour: false });
  const [tourOpen, setTourOpen] = useState(false);
  const [tourIndex, setTourIndex] = useState(0);

  const isNewAccount = useMemo(() => {
    if (!account.createdAt) return false;
    const created = new Date(account.createdAt).getTime();
    return Number.isFinite(created) && Date.now() - created <= NEW_ACCOUNT_WINDOW_MS;
  }, [account.createdAt]);

  const profileIncomplete = !account.fullName.trim() || !account.companyName.trim() || !account.phoneNumber.trim() || !account.avatarUrl;
  const activeModule = modules[tourIndex];
  const ActiveIcon = activeModule.icon;

  useEffect(() => {
    setMounted(true);
    const stored = (key: NoticeKey) => window.localStorage.getItem(`${storagePrefix}.${key}`) === "done";
    setHidden({ profile: stored("profile"), welcome: stored("welcome"), tour: stored("tour") });
  }, [storagePrefix]);

  useEffect(() => {
    if (!tourOpen) return;
    const currentModule = modules.findIndex(
      (module) => pathname?.endsWith(module.path) || pathname === dashboardPath(module.path),
    );
    if (currentModule >= 0) setTourIndex(currentModule);
  }, [dashboardPath, pathname, tourOpen]);

  useEffect(() => {
    if (!tourOpen) return;

    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(`[data-onboarding-module="${activeModule.path}"]`),
    );
    const target = candidates.find((element) => element.offsetParent !== null);
    if (!target) return;

    target.classList.add("ring-2", "ring-[#5EA2FF]", "ring-offset-2");
    target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return () => target.classList.remove("ring-2", "ring-[#5EA2FF]", "ring-offset-2");
  }, [activeModule.path, tourOpen]);

  const complete = (key: NoticeKey) => {
    window.localStorage.setItem(`${storagePrefix}.${key}`, "done");
    setHidden((current) => ({ ...current, [key]: true }));
  };

  const openProfile = () => {
    complete("profile");
    router.push(dashboardPath("/dashboard/settings"));
  };

  const openWelcome = () => {
    complete("welcome");
    router.push(dashboardPath("/dashboard/messages"));
  };

  const startTour = () => {
    setTourOpen(true);
    setHidden((current) => ({ ...current, tour: true }));
  };

  const finishTour = () => {
    complete("tour");
    setTourOpen(false);
  };

  if (!mounted || !isNewAccount) return null;

  const notices = [
    profileIncomplete && !hidden.profile ? { key: "profile" as const, icon: UserRound, title: "Complete your account", body: "Add the details and profile photo our team should use when working with you.", action: "Complete setup", onAction: openProfile } : null,
    !hidden.welcome ? { key: "welcome" as const, icon: MessageSquare, title: "A welcome is waiting", body: "Open Chat/Meet to read your welcome message and meet the CDS Space team.", action: "Open message", onAction: openWelcome } : null,
    !hidden.tour ? { key: "tour" as const, icon: Compass, title: "Take a quick portal tour", body: "Learn what every CDS Space module does on desktop or mobile.", action: "Start tour", onAction: startTour } : null,
  ].filter(Boolean) as Array<{ key: NoticeKey; icon: typeof Compass; title: string; body: string; action: string; onAction: () => void }>;

  return (
    <>
      {notices.length > 0 && !tourOpen && (
        <div className="pointer-events-none fixed inset-x-3 bottom-4 z-[85] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:bottom-6 sm:end-6 sm:w-[380px]" aria-live="polite">
          {notices.map((notice) => {
            const Icon = notice.icon;
            return (
              <section key={notice.key} className="pointer-events-auto rounded-2xl border border-blue-100 bg-white p-3.5 shadow-[0_18px_60px_rgba(15,45,105,0.18)] sm:p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8]"><Icon className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1 text-start">
                    <h2 className="text-[13px] font-bold text-[#0D1B39]">{notice.title}</h2>
                    <p className="mt-1 text-[11px] leading-4.5 text-slate-500">{notice.body}</p>
                    <button type="button" onClick={notice.onAction} className="mt-2.5 rounded-lg bg-[#0A4FE8] px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-[#083FC0] active:scale-[0.98]">{notice.action}</button>
                  </div>
                  <button type="button" onClick={() => complete(notice.key)} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label={`Dismiss ${notice.title}`}><X className="h-3.5 w-3.5" /></button>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {tourOpen && (
        <div className="fixed inset-0 z-[90] bg-[#071337]/35 backdrop-blur-[2px] sm:bg-[#071337]/20" role="dialog" aria-modal="true" aria-label="CDS Space portal tour">
          <div className="absolute inset-x-0 bottom-0 rounded-t-[26px] border border-blue-100 bg-white p-5 shadow-[0_-24px_80px_rgba(15,45,105,0.22)] sm:inset-x-auto sm:bottom-6 sm:end-6 sm:w-[410px] sm:rounded-[24px] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[#0A4FE8]"><ActiveIcon className="h-6 w-6" /></span>
              <button type="button" onClick={finishTour} className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close tour"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-5 text-[10px] font-semibold text-[#0A4FE8]">Module {tourIndex + 1} of {modules.length}</p>
            <h2 className="mt-1 text-[20px] font-bold tracking-tight text-[#0D1B39]">{activeModule.name}</h2>
            <p className="mt-2 text-[13px] leading-6 text-slate-500">{activeModule.description}</p>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#0A4FE8] transition-[width] duration-300" style={{ width: `${((tourIndex + 1) / modules.length) * 100}%` }} /></div>
            <div className="mt-5 flex items-center gap-2">
              <button type="button" disabled={tourIndex === 0} onClick={() => setTourIndex((current) => Math.max(0, current - 1))} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-35" aria-label="Previous module"><ArrowLeft className="h-4 w-4 rtl:rotate-180" /></button>
              <button type="button" onClick={() => router.push(dashboardPath(activeModule.path))} className="h-11 flex-1 rounded-xl border border-blue-200 px-4 text-[12px] font-semibold text-[#0A4FE8] transition hover:bg-blue-50">Open {activeModule.name}</button>
              {tourIndex === modules.length - 1 ? (
                <button type="button" onClick={finishTour} className="h-11 rounded-xl bg-[#0A4FE8] px-4 text-[12px] font-semibold text-white hover:bg-[#083FC0]">Finish</button>
              ) : (
                <button type="button" onClick={() => setTourIndex((current) => Math.min(modules.length - 1, current + 1))} className="grid h-11 w-11 place-items-center rounded-xl bg-[#0A4FE8] text-white hover:bg-[#083FC0]" aria-label="Next module"><ArrowRight className="h-4 w-4 rtl:rotate-180" /></button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
