"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useAdminSession } from "@/hooks/use-admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  LayoutDashboard,
  Upload,
  Users,
  MessageSquare,
  ShoppingBag,
  Quote,
  LogOut,
  ShieldCheck,
  ImagePlus,
  HelpCircle,
  Wallet,
  ChevronDown,
  Briefcase,
  Tag,
  FileText,
  Repeat,
  UserCog,
  Receipt,
  BarChart3,
  ClipboardCheck,
  Building2,
  Boxes,
  Briefcase as BriefcaseIcon,
  Award,
  UserPlus,
  Calendar,
  Clock,
  Scale,
  Video,
  PenLine,
  UserRound,
  LayoutGrid,
  ArrowRightLeft,
  Brain,
  X,
  Megaphone,
} from "lucide-react";

const topLevelItems = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard, permission: "dashboard" },
  { label: "Upload Works", href: "/admin/upload-works", icon: Upload, permission: "upload_works" },
  { label: "Client Conversation", href: "/admin/messages", icon: MessageSquare, permission: "messages" },
  { label: "Team Chat", href: "/admin/chat", icon: MessageSquare, permission: "team_chat" },
  { label: "Announcements", href: "/admin/announcements", icon: Megaphone, permission: "team_chat.broadcast" },
  { label: "Consultations", href: "/admin/consultations", icon: Calendar, permission: "consultations" },
  { label: "Portfolio", href: "/admin/portfolio-designs", icon: ImagePlus, permission: "dashboard" },
  { label: "FAQs", href: "/admin/faqs", icon: HelpCircle, permission: "dashboard" },
  { label: "Legal Documents", href: "/admin/legal", icon: Scale, permission: "legal" },
  { label: "Brand Briefs", href: "/admin/brand-briefs", icon: FileText, permission: "dashboard" },
];

const workspaceNavItems = [
  { label: "AI System", href: "/admin/ai-system", icon: Brain, permission: "workspace.ai_system" },
  { label: "Protect Docs", href: "/admin/protect-docs", icon: ShieldCheck, permission: "workspace" },
  { label: "cMeet", href: "/admin/cmeet", icon: Video, permission: "workspace" },
  { label: "cDocs", href: "/admin/cdocs", icon: FileText, permission: "workspace" },
  { label: "cSign", href: "/admin/csign", icon: PenLine, permission: "workspace" },
  { label: "cResume", href: "/admin/cresume", icon: UserRound, permission: "workspace" },
];

const hrmNavItems = [
  { label: "Overview", href: "/admin/hrm", icon: BarChart3, permission: "applicants" },
  { label: "Team Members", href: "/admin/team-members", icon: UserPlus, permission: "team_members" },
  { label: "Timebook", href: "/admin/timebook", icon: Clock, permission: "timebook" },
  { label: "Work Tracking", href: "/admin/work-tracking", icon: Activity, permission: "work_tracking" },
  { label: "Departments", href: "/admin/departments", icon: Building2, permission: "departments" },
  { label: "Sub-admins", href: "/admin/sub-admins", icon: ShieldCheck, permission: "sub_admins" },
  { label: "Applications", href: "/admin/applications", icon: Users, permission: "applicants" },
  { label: "Open Roles", href: "/admin/hrm/roles", icon: BriefcaseIcon, permission: "applicants" },
  { label: "Certifications", href: "/admin/hrm/certifications", icon: Award, permission: "applicants" },
];

const financeNavItems = [
  { label: "Overview", href: "/admin/finance", icon: BarChart3, permission: "finance" },
  { label: "Invoice", href: "/admin/finance/invoices", icon: FileText, permission: "finance_invoices" },
  { label: "Pricelist", href: "/admin/finance/price-list", icon: Tag, permission: "finance_pricelist" },
  { label: "Expenditure", href: "/admin/finance/expenditures", icon: Receipt, permission: "finance_expenditures" },
  { label: "Payroll", href: "/admin/finance/payroll", icon: Wallet, permission: "finance_payroll" },
  { label: "Team Payroll", href: "/admin/team-payroll", icon: Wallet, permission: "team_payroll" },
  { label: "Financial Audit", href: "/admin/finance/audit", icon: ClipboardCheck, permission: "finance_audit" },
];

const projectsNavItems = [
  { label: "Overview", href: "/admin/projects", icon: BarChart3, permission: "projects" },
  { label: "Projects", href: "/admin/projects/list", icon: Briefcase, permission: "projects" },
  { label: "Sub-contractors", href: "/admin/projects/contractors", icon: UserCog, permission: "projects" },
  { label: "Subscriptions", href: "/admin/projects/subscriptions", icon: Repeat, permission: "projects" },
];

const clientsNavItems = [
  { label: "Overview", href: "/admin/clients", icon: BarChart3, permission: "clients" },
  { label: "Client / Brand List", href: "/admin/clients/list", icon: Building2, permission: "clients" },
  { label: "Client Orders", href: "/admin/orders", icon: ShoppingBag, permission: "orders" },
  { label: "Testimonials", href: "/admin/testimonials", icon: Quote, permission: "testimonials" },
];

const ADMIN_SIDEBAR_SCROLL_KEY = "cds.admin.sidebar.scrollTop";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  permission: string;
}

interface NavGroupProps {
  label: string;
  icon: React.ElementType;
  items: NavItem[];
  pathname: string | null;
  permissions: string[];
  isSuperAdmin: boolean;
  onNavigate?: () => void;
}

function NavGroup({ label, icon: GroupIcon, items, pathname, permissions, isSuperAdmin, onNavigate }: NavGroupProps) {
  const exactRoutes = ["/admin/finance", "/admin/projects", "/admin/clients", "/admin/hrm"];

  // Filter sub-items by per-item permission. "super_admin_only" is a
  // reserved key that only renders when the session role is super_admin.
  const visibleItems = items.filter((item) => {
    if (item.permission === "super_admin_only") return isSuperAdmin;
    return isSuperAdmin || hasPermission(permissions, item.permission);
  });

  const isAnyActive = visibleItems.some((i) =>
    exactRoutes.includes(i.href) ? pathname === i.href : pathname?.startsWith(i.href)
  );
  const [open, setOpen] = useState(isAnyActive);

  // Hide the entire group if no sub-items survive the permission filter
  if (visibleItems.length === 0) return null;

  return (
    <div className="pt-1">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center justify-between w-full gap-3 px-4 py-2.5 rounded-xl text-[13.5px] font-medium transition-all ${
          isAnyActive && !open
            ? "bg-blue-50 text-[#0A4FE8]"
            : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
        }`}
      >
        <div className="flex items-center gap-3">
          <GroupIcon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.8} />
          {label}
        </div>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-1 ml-3 pl-3 border-l border-gray-100 space-y-0.5">
          {visibleItems.map((sub) => {
            const isActive = exactRoutes.includes(sub.href)
              ? pathname === sub.href
              : pathname?.startsWith(sub.href);
            return (
              <Link
                key={sub.href}
                href={sub.href}
                onClick={onNavigate}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12.5px] font-medium transition-all ${
                  isActive
                    ? "bg-[#0A4FE8] text-white shadow-sm shadow-blue-200"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                }`}
              >
                <sub.icon className="w-[15px] h-[15px] flex-shrink-0" strokeWidth={1.8} />
                {sub.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface AdminSidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function AdminSidebar({ mobileOpen = false, onMobileClose }: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { session } = useAdminSession();
  const desktopNavRef = useRef<HTMLElement | null>(null);

  const permissions = session?.permissions || [];
  const isSuperAdmin = session?.role === "super_admin";

  const rememberSidebarScroll = useCallback(() => {
    if (typeof window === "undefined") return;
    const node = desktopNavRef.current;
    if (!node) return;
    window.sessionStorage.setItem(ADMIN_SIDEBAR_SCROLL_KEY, String(node.scrollTop));
  }, []);

  const restoreSidebarScroll = useCallback(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(ADMIN_SIDEBAR_SCROLL_KEY);
    if (!raw) return;
    const scrollTop = Number(raw);
    if (!Number.isFinite(scrollTop)) return;
    window.requestAnimationFrame(() => {
      if (desktopNavRef.current) desktopNavRef.current.scrollTop = scrollTop;
    });
  }, []);

  useEffect(() => {
    restoreSidebarScroll();
  }, [pathname, restoreSidebarScroll]);

  const handleDesktopNavigate = useCallback(() => {
    rememberSidebarScroll();
  }, [rememberSidebarScroll]);

  const handleMobileNavigate = useCallback(() => {
    onMobileClose?.();
  }, [onMobileClose]);

  const signOut = async () => {
    await fetch("/api/admin-logout", { method: "POST" });
    router.push("/admin/login");
    onMobileClose?.();
  };

  const visibleTopLevel = topLevelItems.filter(
    (item) => isSuperAdmin || hasPermission(permissions, item.permission)
  );

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex h-full flex-col bg-white">
      <div className={`border-b border-gray-100 ${mobile ? "px-4 py-4" : "px-6 pt-7 pb-4"}`}>
        <div className="flex items-center justify-between gap-3">
          <Image src="/images/cds-logo.svg" alt="CDS Space" width={100} height={36} className="brightness-0" />
          {mobile && (
            <button
              type="button"
              onClick={onMobileClose}
              className="flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {session && (
        <div className={mobile ? "px-4 pb-4 pt-4" : "px-6 pb-4"}>
          <div className={`px-3 py-1.5 rounded-lg text-[11px] font-medium inline-flex items-center gap-1.5 ${
            isSuperAdmin ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-[#0A4FE8]"
          }`}>
            <ShieldCheck className="w-3 h-3" />
            {isSuperAdmin ? "Super Admin" : session.name}
          </div>
        </div>
      )}

      <nav
        ref={mobile ? undefined : desktopNavRef}
        onScroll={mobile ? undefined : rememberSidebarScroll}
        className={`flex-1 space-y-0.5 overflow-y-auto pb-4 ${mobile ? "px-3" : "px-3"}`}
      >
        {visibleTopLevel.map((item) => {
          const isActive = item.href === "/admin"
            ? pathname === "/admin"
            : pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={mobile ? handleMobileNavigate : handleDesktopNavigate}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13.5px] font-medium transition-all ${
                isActive
                  ? "bg-[#0A4FE8] text-white shadow-md shadow-blue-200"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
              }`}
            >
              <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
              {item.label}
            </Link>
          );
        })}

        <div className="pt-4 pb-1 px-4">
          <p className="text-[10px] font-bold text-gray-300 uppercase tracking-[0.12em]">Operations</p>
        </div>

        <NavGroup
          label="Finance"
          icon={Wallet}
          items={financeNavItems}
          pathname={pathname}
          permissions={permissions}
          isSuperAdmin={isSuperAdmin}
          onNavigate={mobile ? handleMobileNavigate : handleDesktopNavigate}
        />
        <NavGroup
          label="Projects"
          icon={Boxes}
          items={projectsNavItems}
          pathname={pathname}
          permissions={permissions}
          isSuperAdmin={isSuperAdmin}
          onNavigate={mobile ? handleMobileNavigate : handleDesktopNavigate}
        />
        <NavGroup
          label="Clients"
          icon={Building2}
          items={clientsNavItems}
          pathname={pathname}
          permissions={permissions}
          isSuperAdmin={isSuperAdmin}
          onNavigate={mobile ? handleMobileNavigate : handleDesktopNavigate}
        />
        <NavGroup
          label="HRM"
          icon={UserPlus}
          items={hrmNavItems}
          pathname={pathname}
          permissions={permissions}
          isSuperAdmin={isSuperAdmin}
          onNavigate={mobile ? handleMobileNavigate : handleDesktopNavigate}
        />
        <NavGroup
          label="Workspace"
          icon={LayoutGrid}
          items={workspaceNavItems}
          pathname={pathname}
          permissions={permissions}
          isSuperAdmin={isSuperAdmin}
          onNavigate={mobile ? handleMobileNavigate : handleDesktopNavigate}
        />
      </nav>

      <div className="px-3 pb-6 pt-2 border-t border-gray-50 space-y-1">
        <button
          type="button"
          onClick={async () => {
            onMobileClose?.();
            if (isSuperAdmin) {
              const res = await fetch("/api/admin/team-bridge", {
                method: "POST",
                credentials: "include",
              });
              if (res.ok) {
                router.push("/team");
                return;
              }
            }
            router.push("/team");
          }}
          className="group flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13.5px] font-semibold text-white transition-all w-full shadow-[0_6px_18px_rgba(28,78,209,0.18)]"
          style={{ backgroundImage: "linear-gradient(146.28deg, #0035C1 8.83%, #0575FF 86.3%)" }}
          title="Switch to the Team Portal"
        >
          <ArrowRightLeft className="w-[18px] h-[18px]" />
          Open Team Portal
        </button>
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13.5px] font-medium text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all w-full"
        >
          <LogOut className="w-[18px] h-[18px]" />
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="fixed left-0 top-0 hidden h-screen w-[230px] border-r border-gray-100 bg-white z-40 lg:block">
        <SidebarContent />
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onMobileClose}
              className="fixed inset-0 z-40 bg-[#040B37]/30 backdrop-blur-[2px] lg:hidden"
              aria-label="Close navigation overlay"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="fixed inset-y-0 left-0 z-50 w-[86vw] max-w-[320px] border-r border-gray-100 bg-white shadow-2xl lg:hidden"
            >
              <SidebarContent mobile />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
