"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Sidebar } from "@/components/layout/Sidebar";
import { NavbarDashboard } from "@/components/layout/NavbarDashboard";

const ClientOnboardingCoach = dynamic(
  () => import("@/components/onboarding/ClientOnboardingCoach"),
  { ssr: false, loading: () => null },
);

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div data-app-shell="client" className="relative flex min-h-[100dvh] w-full max-w-full overflow-x-clip font-inter antialiased lg:h-screen lg:overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[#F5F8FF]" />
      <div className="pointer-events-none absolute right-0 top-0 -z-10 h-[480px] w-[480px] rounded-full bg-blue-300/25 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/4 -z-10 h-[400px] w-[400px] rounded-full bg-indigo-200/30 blur-3xl" />

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <NavbarDashboard onMenuClick={() => setIsSidebarOpen(true)} />
        {/* No backdrop-filter on the page surface: it would create a containing
            block that traps every `position: fixed` modal rendered by a page
            inside this scroll container, stacking them under the chrome. */}
        <main data-app-content className="min-w-0 flex-1 overflow-x-clip p-0 sm:p-4 lg:overflow-hidden lg:p-5 2xl:p-6">
          <div data-mobile-page-surface className="relative min-h-[calc(100dvh-64px)] w-full overflow-x-clip bg-white/80 sm:rounded-[20px] sm:border sm:border-white/70 sm:shadow-[0_10px_40px_rgba(15,40,90,0.06)] lg:h-full lg:min-h-0 lg:overflow-y-auto lg:rounded-3xl premium-scrollbar">
            {children}
          </div>
        </main>
      </div>
      <ClientOnboardingCoach />
    </div>
  );
}
