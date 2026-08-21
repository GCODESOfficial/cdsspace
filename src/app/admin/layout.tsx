// app/admin/layout.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { getPermissionForRoute, hasPermission } from '@/lib/admin-permissions';
import { Loader2, Menu } from 'lucide-react';
import AdminActivityLayer from '@/components/admin/AdminActivityLayer';
import { DashboardAutoSave } from '@/components/autosave/DashboardAutoSave';
import AdminNotificationBell from '@/components/notifications/admin-notification-bell';

interface SessionData {
  authenticated: boolean;
  role: "super_admin" | "sub_admin";
  permissions: string[];
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const [sessionUnavailable, setSessionUnavailable] = useState(false);
  const [authCheckVersion, setAuthCheckVersion] = useState(0);
  const [denied, setDenied] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Desktop rail starts collapsed by default; the user's choice is remembered.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  const isLoginPage = pathname === '/admin/login';

  useEffect(() => {
    const stored = window.localStorage.getItem('cds.admin.sidebar.collapsed');
    if (stored !== null) setSidebarCollapsed(stored === 'true');
  }, []);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem('cds.admin.sidebar.collapsed', String(next));
      return next;
    });
  };

  useEffect(() => {
    if (isLoginPage) {
      setIsChecking(false);
      setIsAuthed(true);
      return;
    }

    let cancelled = false;
    setIsChecking(true);
    setSessionUnavailable(false);

    fetch('/api/admin-check', { credentials: 'include', cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            setIsAuthed(false);
            router.replace('/admin/login');
          } else if (!cancelled) {
            setSessionUnavailable(true);
          }
          return;
        }
        const data: SessionData = await res.json();
        if (cancelled) return;
        setIsAuthed(true);

        // Super admin can access everything
        if (data.role === "super_admin") {
          setDenied(false);
          return;
        }

        // Sub-admin route check
        const requiredPerm = getPermissionForRoute(pathname || "");
        if (pathname === "/admin") {
          setDenied(false);
          return;
        }

        // Sub-admins page is super-admin only. `team_members.promote`
        // (granted via a role) also unlocks role management for delegated
        // admins who need to create new team members.
        if (pathname === "/admin/sub-admins") {
          setDenied(
            !(
              data.permissions.includes("all") ||
              data.permissions.includes("team_members.promote")
            ),
          );
          return;
        }
        if (requiredPerm && !hasPermission(data.permissions, requiredPerm)) {
          setDenied(true);
        } else {
          setDenied(false);
        }
      })
      .catch(() => {
        if (!cancelled) setSessionUnavailable(true);
      })
      .finally(() => {
        if (!cancelled) setIsChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, router, isLoginPage, authCheckVersion]);

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F0F5FF]">
        <Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]" />
      </div>
    );
  }
  if (sessionUnavailable) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F0F5FF] px-4">
        <div className="w-full max-w-sm rounded-2xl border border-[#E4EAF5] bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-[#0D1B39]">Admin portal temporarily unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Your session is still active. Try the secure portal handoff again.
          </p>
          <button
            type="button"
            onClick={() => setAuthCheckVersion((value) => value + 1)}
            className="mt-5 min-h-11 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white transition hover:bg-[#083FC0]"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (!isAuthed) return null;
  if (isLoginPage) return <>{children}</>;

  return (
    <div data-app-shell="admin" className="min-h-[100dvh] overflow-x-clip bg-[#F0F5FF]">
      <DashboardAutoSave scope="admin" />
      <AdminSidebar
        mobileOpen={isSidebarOpen}
        onMobileClose={() => setIsSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapsed}
      />
      <div className={`min-h-screen transition-[padding] duration-200 ${sidebarCollapsed ? "lg:ps-[76px]" : "lg:ps-[230px]"}`}>
        <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b border-[#E4EAF5] bg-white/95 px-4 py-3 backdrop-blur-lg lg:hidden">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E4EAF5] bg-white text-[#0D1B39] shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#0A4FE8]"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Image src="/images/cds-logo.svg" alt="CDS Space" width={92} height={32} className="brightness-0" />
          <span className="h-10 w-10" aria-hidden="true" />
        </header>

        <div className="fixed end-4 top-3 z-40 rounded-xl border border-gray-100 bg-white shadow-sm">
          <AdminNotificationBell />
        </div>

        <main data-app-content className="min-h-[calc(100dvh-64px)] min-w-0 overflow-x-clip lg:min-h-screen">
          {denied ? (
            <div className="flex items-center justify-center min-h-[calc(100dvh-64px)] px-4">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-[#0D1B39] mb-2">Access Denied</h2>
              <p className="text-gray-400 text-sm">You don&apos;t have permission to view this page.</p>
              <button
                onClick={() => router.push("/admin")}
                className="mt-6 px-5 py-2.5 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition"
              >
                Go to Dashboard
              </button>
            </div>
            </div>
          ) : children}
        </main>
        {!denied && <AdminActivityLayer />}
      </div>
    </div>
  );
}
