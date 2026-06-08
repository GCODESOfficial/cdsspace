// app/admin/layout.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { getPermissionForRoute, hasPermission } from '@/lib/admin-permissions';
import { Menu } from 'lucide-react';

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
  const [denied, setDenied] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const isLoginPage = pathname === '/admin/login';

  useEffect(() => {
    if (isLoginPage) {
      setIsChecking(false);
      setIsAuthed(true);
      return;
    }

    fetch('/api/admin-check')
      .then(async (res) => {
        if (!res.ok) {
          router.replace('/admin/login');
          return;
        }
        const data: SessionData = await res.json();
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
        router.replace('/admin/login');
      })
      .finally(() => {
        setIsChecking(false);
      });
  }, [pathname, router, isLoginPage]);

  if (isChecking) return null;
  if (!isAuthed) return null;
  if (isLoginPage) return <>{children}</>;

  return (
    <div className="min-h-screen bg-[#F0F5FF]">
      <AdminSidebar mobileOpen={isSidebarOpen} onMobileClose={() => setIsSidebarOpen(false)} />
      <div className="min-h-screen lg:pl-[230px]">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/60 bg-[#F0F5FF]/95 px-4 py-3 backdrop-blur-lg lg:hidden">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#0D1B39] shadow-sm transition hover:bg-blue-50"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Image src="/images/cds-logo.svg" alt="CDS Space" width={92} height={32} className="brightness-0" />
          <div className="w-10" aria-hidden="true" />
        </header>

        <main className="min-h-[calc(100dvh-64px)]">
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
      </div>
    </div>
  );
}
