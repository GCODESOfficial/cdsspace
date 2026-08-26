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
  HelpCircle,
  Wallet,
  CreditCard,
  Landmark,
  Target,
  Lock,
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
  Wand2,
  Images,
  Briefcase as BriefcaseIcon,
  Award,
  UserPlus,
  Calendar,
  Clock,
  KanbanSquare,
  Scale,
  Video,
  PenLine,
  UserRound,
  LayoutGrid,
  ArrowRightLeft,
  Brain,
  X,
  Megaphone,
  Newspaper,
  Bot,
  Archive,
  Settings as SettingsIcon,
  Clapperboard,
  GraduationCap,
  PanelLeftClose,
  PanelLeftOpen,
  PackageCheck,
  Rocket,
  Handshake,
  Mail,
  Loader2,
} from "lucide-react";

const topLevelItems = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard, permission: "dashboard" },
];

const communicationNavItems = [
  { label: "Team Chat", href: "/admin/chat", icon: MessageSquare, permission: "team_chat" },
  { label: "Announcements", href: "/admin/announcements", icon: Megaphone, permission: "team_chat.broadcast" },
];

const contentWebNavItems = [
  { label: "Upload Works", href: "/admin/upload-works", icon: Upload, permission: "upload_works" },
  { label: "FAQs", href: "/admin/faqs", icon: HelpCircle, permission: "dashboard" },
];

const clientEngagementNavItems = [
  { label: "Overview", href: "/admin/clients", icon: BarChart3, permission: "clients" },
  { label: "Chat/Meet", href: "/admin/messages", icon: MessageSquare, permission: "messages" },
  { label: "Consultations", href: "/admin/consultations", icon: Calendar, permission: "consultations" },
  { label: "Client mailings", href: "/admin/clients/mailings", icon: Mail, permission: "clients.mailings.view" },
  { label: "Brand Briefs", href: "/admin/brand-briefs", icon: FileText, permission: "dashboard" },
  { label: "Banner Commerce", href: "/admin/clients/banners", icon: Images, permission: "clients.banners.view" },
  { label: "Merch Commerce", href: "/admin/clients/merch", icon: PackageCheck, permission: "clients.merch.view" },
  { label: "Subscription settings", href: "/admin/pricing", icon: CreditCard, permission: "pricing.view" },
  { label: "Sales Settings", href: "/admin/clients/sales-settings", icon: SettingsIcon, permission: "clients.sales_settings.view" },
  { label: "Client Orders", href: "/admin/orders", icon: ShoppingBag, permission: "orders" },
  { label: "Deliveries", href: "/admin/clients/deliveries", icon: PackageCheck, permission: "deliveries" },
];

const dealsNavItems = [
  { label: "Overview", href: "/admin/deals", icon: LayoutDashboard, permission: "deals" },
  { label: "Growth Engine", href: "/admin/deals/growth", icon: Rocket, permission: "clients.growth.view" },
  { label: "Proposals", href: "/admin/deals/proposals", icon: FileText, permission: "deals.proposals" },
  { label: "Brand audits", href: "/admin/deals/brand-audits", icon: ClipboardCheck, permission: "deals.audits" },
  { label: "Prospect checklist", href: "/admin/deals/prospects", icon: Users, permission: "deals.prospects" },
];

const executiveBoardNavItems = [
  { label: "Overview", href: "/admin/executive-board", icon: LayoutDashboard, permission: "executive_board.view" },
  { label: "Budgets", href: "/admin/executive-board/budgets", icon: Wallet, permission: "executive_board.view" },
  { label: "Targets", href: "/admin/executive-board/targets", icon: Target, permission: "executive_board.view" },
  { label: "Revenue models", href: "/admin/executive-board/revenue-models", icon: Rocket, permission: "executive_board.view" },
  { label: "Document vault", href: "/admin/executive-board/vault", icon: Lock, permission: "executive_board.view" },
];

const complianceNavItems = [
  { label: "Audit & Report", href: "/admin/audit-report", icon: ClipboardCheck, permission: "audit_report" },
  { label: "Legal Documents", href: "/admin/legal", icon: Scale, permission: "legal" },
];

// CREATE is its own product, not a Content Hub feature, so it gets its own group.
const createNavItems = [
  { label: "CREATE Studio", href: "/create", icon: Wand2, permission: "content_hub" },
  { label: "CREATE Management", href: "/admin/create", icon: Wand2, permission: "create.view" },
];

const contentHubNavItems = [
  { label: "Dashboard", href: "/admin/content-hub", icon: LayoutDashboard, permission: "content_hub" },
  { label: "Content Calendar", href: "/admin/content-hub/calendar", icon: Calendar, permission: "content_hub.calendar" },
  { label: "Content Library", href: "/admin/content-hub/library", icon: Boxes, permission: "content_hub" },
  { label: "Visual Library", href: "/admin/content-hub/visual-library", icon: Images, permission: "content_hub.visual_library" },
  { label: "Create Content", href: "/admin/content-hub/create", icon: PenLine, permission: "content_hub.create" },
  { label: "BSD Studio", href: "/admin/content-hub/studio", icon: Clapperboard, permission: "content_hub.studio" },
  { label: "AI Assistant", href: "/admin/content-hub/ai", icon: Bot, permission: "content_hub.ai" },
  { label: "Approval Queue", href: "/admin/content-hub/approvals", icon: ClipboardCheck, permission: "content_hub.approve" },
  { label: "Archived", href: "/admin/content-hub/archived", icon: Archive, permission: "content_hub" },
  { label: "Settings", href: "/admin/content-hub/settings", icon: SettingsIcon, permission: "content_hub.settings" },
];

const intelligenceNavItems = [
  { label: "Dashboard", href: "/admin/intelligence", icon: LayoutDashboard, permission: "blog" },
  { label: "Publications", href: "/admin/intelligence/library", icon: Boxes, permission: "blog.view" },
  { label: "Create Publication", href: "/admin/intelligence/create", icon: PenLine, permission: "blog.create" },
  { label: "Private Reports", href: "/admin/intelligence/private", icon: ShieldCheck, permission: "blog.view" },
  { label: "Comments", href: "/admin/intelligence/comments", icon: MessageSquare, permission: "blog.view" },
  { label: "Analytics", href: "/admin/intelligence/analytics", icon: BarChart3, permission: "blog.view" },
  { label: "Authors", href: "/admin/intelligence/authors", icon: Users, permission: "blog.authors" },
  { label: "Taxonomy", href: "/admin/intelligence/taxonomy", icon: Tag, permission: "blog.create" },
  { label: "Archive", href: "/admin/intelligence/archive", icon: Archive, permission: "blog.view" },
  { label: "Settings", href: "/admin/intelligence/settings", icon: SettingsIcon, permission: "blog.settings" },
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
  { label: "Attendance", href: "/admin/timebook", icon: Clock, permission: "timebook" },
  { label: "Work Activity", href: "/admin/work-tracking", icon: Activity, permission: "work_tracking" },
  { label: "Team Reports", href: "/admin/team-reports", icon: BarChart3, permission: "team_reports" },
  { label: "Departments", href: "/admin/departments", icon: Building2, permission: "departments" },
  { label: "Sub-admins", href: "/admin/sub-admins", icon: ShieldCheck, permission: "sub_admins" },
  { label: "Applications", href: "/admin/applications", icon: Users, permission: "applicants" },
  { label: "Screening", href: "/admin/screening", icon: GraduationCap, permission: "applicants.screening" },
  { label: "Open Roles", href: "/admin/hrm/roles", icon: BriefcaseIcon, permission: "applicants" },
  { label: "Certifications", href: "/admin/hrm/certifications", icon: Award, permission: "applicants" },
];

const financeNavItems = [
  { label: "Overview", href: "/admin/finance", icon: BarChart3, permission: "finance" },
  { label: "Invoice", href: "/admin/finance/invoices", icon: FileText, permission: "finance_invoices" },
  { label: "Quotation", href: "/admin/finance/quotations", icon: FileText, permission: "finance_quotations" },
  { label: "Pricelists", href: "/admin/finance/pricelists", icon: Tag, permission: "finance_pricelist" },
  { label: "Expenditure", href: "/admin/finance/expenditures", icon: Receipt, permission: "finance_expenditures" },
  { label: "Payroll", href: "/admin/finance/payroll", icon: Wallet, permission: "finance_payroll" },
  { label: "Team Payroll", href: "/admin/team-payroll", icon: Wallet, permission: "team_payroll" },
  { label: "Financial Audit", href: "/admin/finance/audit", icon: ClipboardCheck, permission: "finance_audit" },
];

const projectsNavItems = [
  { label: "Overview", href: "/admin/projects", icon: BarChart3, permission: "projects" },
  { label: "Projects", href: "/admin/projects/list", icon: Briefcase, permission: "projects" },
  { label: "Sub-contractors", href: "/admin/projects/contractors", icon: UserCog, permission: "projects" },
  { label: "Inflow", href: "/admin/projects/subscriptions", icon: Repeat, permission: "projects" },
];

const clientsNavItems = [
  { label: "Overview", href: "/admin/clients", icon: BarChart3, permission: "clients" },
  { label: "Client / Brand List", href: "/admin/clients/list", icon: Building2, permission: "clients" },
  { label: "Vendors", href: "/admin/vendors", icon: UserCog, permission: "clients" },
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
  // When the desktop rail is collapsed we render an icon-only trigger that
  // asks the shell to expand before opening the group.
  collapsed?: boolean;
  onExpandRequest?: () => void;
  badges?: Record<string, number>;
}

// Remembers which nav groups are expanded, keyed by label. Module-level so the
// state survives the sidebar re-mounting on navigation (same reason the scroll
// position is persisted) - so an expanded menu stays open after you click into
// one of its items instead of collapsing.
const OPEN_NAV_GROUPS = new Set<string>();

function NavGroup({ label, icon: GroupIcon, items, pathname, permissions, isSuperAdmin, onNavigate, collapsed = false, onExpandRequest, badges = {} }: NavGroupProps) {
  const exactRoutes = ["/admin/finance", "/admin/projects", "/admin/clients", "/admin/deals", "/admin/hrm", "/admin/content-hub", "/admin/intelligence", "/admin/executive-board"];

  // Filter sub-items by per-item permission. "super_admin_only" is a
  // reserved key that only renders when the session role is super_admin.
  const visibleItems = items.filter((item) => {
    if (item.permission === "super_admin_only") return isSuperAdmin;
    return isSuperAdmin || hasPermission(permissions, item.permission);
  });

  const isAnyActive = visibleItems.some((i) =>
    exactRoutes.includes(i.href) ? pathname === i.href : pathname?.startsWith(i.href)
  );
  // Start open if the user had it open, or the current route lives in this group.
  const [open, setOpen] = useState(() => OPEN_NAV_GROUPS.has(label) || isAnyActive);
  const groupBadge = visibleItems.reduce((total, item) => total + Math.max(0, badges[item.href] || 0), 0);

  // Navigating into this group auto-expands it and remembers that.
  useEffect(() => {
    if (isAnyActive) {
      OPEN_NAV_GROUPS.add(label);
      setOpen(true);
    }
  }, [isAnyActive, label]);

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next) OPEN_NAV_GROUPS.add(label);
      else OPEN_NAV_GROUPS.delete(label);
      return next;
    });
  };

  // Hide the entire group if no sub-items survive the permission filter
  if (visibleItems.length === 0) return null;

  // Collapsed rail: single icon trigger. Clicking expands the shell and opens
  // this group so the sub-items are visible right away.
  if (collapsed) {
    return (
      <div className="pt-1">
        <button
          onClick={() => {
            OPEN_NAV_GROUPS.add(label);
            setOpen(true);
            onExpandRequest?.();
          }}
          title={label}
          aria-label={label}
          className={`relative flex min-h-11 w-full items-center justify-center rounded-xl py-2.5 transition-all ${
            isAnyActive
              ? "bg-blue-50 text-[#0A4FE8]"
              : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
          }`}
        >
          <GroupIcon className="w-[20px] h-[20px] flex-shrink-0" strokeWidth={1.8} />
          {groupBadge > 0 && (
            <span className="absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-none text-white">
              {groupBadge > 99 ? "99+" : groupBadge}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="pt-1">
      <button
        onClick={toggleOpen}
        className={`flex min-h-11 items-center justify-between w-full gap-3 px-4 py-2.5 rounded-xl text-[13.5px] font-medium transition-all ${
          isAnyActive && !open
            ? "bg-blue-50 text-[#0A4FE8]"
            : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
        }`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <GroupIcon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.8} />
          <span>{label}</span>
          {groupBadge > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold leading-none text-white">
              {groupBadge > 99 ? "99+" : groupBadge}
            </span>
          )}
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
                className={`flex min-h-10 items-center gap-2.5 px-3 py-2 rounded-lg text-[12.5px] font-medium transition-all ${
                  isActive
                    ? "bg-[#0A4FE8] text-white shadow-sm shadow-blue-200"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                }`}
              >
                <sub.icon className="w-[15px] h-[15px] flex-shrink-0" strokeWidth={1.8} />
                <span className="min-w-0 flex-1 truncate">{sub.label}</span>
                {(badges[sub.href] || 0) > 0 && (
                  <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-bold leading-none ${isActive ? "bg-white text-[#0A4FE8]" : "bg-rose-500 text-white"}`}>
                    {badges[sub.href] > 99 ? "99+" : badges[sub.href]}
                  </span>
                )}
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
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function AdminSidebar({ mobileOpen = false, onMobileClose, collapsed = false, onToggleCollapse }: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { session } = useAdminSession();
  const desktopNavRef = useRef<HTMLElement | null>(null);
  const [clientUnreadCount, setClientUnreadCount] = useState(0);
  const [isSwitchingPortal, setIsSwitchingPortal] = useState(false);
  const [portalSwitchError, setPortalSwitchError] = useState(false);
  const unreadInitialLoad = useRef(true);
  const newestUnreadAt = useRef<string | null>(null);
  const unreadRequestActive = useRef(false);

  const permissions = session?.permissions || [];
  const isSuperAdmin = session?.role === "super_admin";
  const canViewClientMessages = isSuperAdmin || hasPermission(permissions, "messages");

  useEffect(() => {
    if (!session || !canViewClientMessages) return;

    const fetchUnread = async () => {
      if (unreadRequestActive.current) return;
      unreadRequestActive.current = true;
      try {
        const response = await fetch("/api/chat/unread-summary", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        const count = Number(payload.unreadCount || 0);
        const latest = typeof payload.newestUnreadAt === "string" ? payload.newestUnreadAt : null;
        const isNewMessage = !unreadInitialLoad.current && latest && latest !== newestUnreadAt.current &&
          (!newestUnreadAt.current || new Date(latest).getTime() > new Date(newestUnreadAt.current).getTime());

        if (isNewMessage && count > 0) {
          const audio = new Audio("/special-notification.mp3");
          audio.volume = 0.8;
          void audio.play().catch(() => {});
        }

        unreadInitialLoad.current = false;
        newestUnreadAt.current = latest;
        setClientUnreadCount(count);
      } catch {
        // Keep the last known count during a transient network error.
      } finally {
        unreadRequestActive.current = false;
      }
    };

    void fetchUnread();
    const interval = window.setInterval(() => {
      if (!document.hidden) void fetchUnread();
    }, 8_000);
    return () => window.clearInterval(interval);
  }, [canViewClientMessages, session]);

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

  // Collapsed rail group icons ask the shell to expand before opening.
  const requestExpand = useCallback(() => {
    if (collapsed) onToggleCollapse?.();
  }, [collapsed, onToggleCollapse]);

  const signOut = async () => {
    await fetch("/api/admin-logout", { method: "POST" });
    router.push("/admin/login");
    onMobileClose?.();
  };

  const openTeamPortal = async () => {
    if (isSwitchingPortal) return;
    setIsSwitchingPortal(true);
    setPortalSwitchError(false);
    onMobileClose?.();
    try {
      const response = await fetch("/api/admin/team-bridge", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        setPortalSwitchError(true);
        return;
      }
      window.location.assign("/team");
    } catch {
      setPortalSwitchError(true);
    } finally {
      setIsSwitchingPortal(false);
    }
  };

  const visibleTopLevel = topLevelItems.filter(
    (item) => isSuperAdmin || hasPermission(permissions, item.permission)
  );

  const renderSidebarContent = (mobile = false) => {
    const isCollapsed = !mobile && collapsed;
    const onNavigate = mobile ? handleMobileNavigate : handleDesktopNavigate;

    const navGroupCommon = {
      pathname,
      permissions,
      isSuperAdmin,
      onNavigate,
      collapsed: isCollapsed,
      onExpandRequest: requestExpand,
    };

    return (
    <div className="flex h-full flex-col bg-white">
      {/* Header: logo + collapse toggle (desktop) / close (mobile) */}
      <div
        className={`border-b border-[#EEF2F8] ${
          mobile ? "px-4 py-4" : isCollapsed ? "px-2 pt-6 pb-4" : "px-6 pt-7 pb-5"
        }`}
      >
        {isCollapsed ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={onToggleCollapse}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 transition hover:bg-blue-50 hover:text-[#0A4FE8]"
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <PanelLeftOpen className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <Image src="/images/cds-logo.svg" alt="CDS Space" width={112} height={40} className="brightness-0" />
            {mobile ? (
              <button
                type="button"
                onClick={onMobileClose}
                className="flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="hidden lg:flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition hover:bg-blue-50 hover:text-[#0A4FE8]"
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
              >
                <PanelLeftClose className="h-5 w-5" />
              </button>
            )}
          </div>
        )}
      </div>

      {session && !isCollapsed && (
        <div className={mobile ? "px-4 pb-4 pt-4" : "px-6 pb-4"}>
          <div className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-[#0A4FE8] ring-1 ring-blue-100">
            <ShieldCheck className="w-3 h-3" />
            <span className="truncate">{isSuperAdmin ? "CDS Space Super Admin" : session.name}</span>
          </div>
        </div>
      )}
      {session && isCollapsed && (
        <div className="px-2 pb-3 pt-3 flex justify-center">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-[#0A4FE8] ring-1 ring-blue-100"
            title={isSuperAdmin ? "CDS Space Super Admin" : session.name}
          >
            <ShieldCheck className="w-4 h-4" />
          </div>
        </div>
      )}

      <nav
        ref={mobile ? undefined : desktopNavRef}
        onScroll={mobile ? undefined : rememberSidebarScroll}
        className={`flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden pb-4 ${isCollapsed ? "px-2" : "px-3"}`}
      >
        {visibleTopLevel.map((item) => {
          const isActive = item.href === "/admin"
            ? pathname === "/admin"
            : pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              title={isCollapsed ? item.label : undefined}
              aria-label={isCollapsed ? item.label : undefined}
              className={`flex min-h-11 items-center rounded-xl text-[13.5px] font-medium transition-all ${
                isCollapsed ? "justify-center py-2.5" : "gap-3 px-4 py-2.5"
              } ${
                isActive
                  ? "bg-[#0A4FE8] text-white shadow-md shadow-blue-200"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
              }`}
            >
              <item.icon className={`${isCollapsed ? "w-[20px] h-[20px]" : "w-[18px] h-[18px]"} flex-shrink-0`} />
              {!isCollapsed && item.label}
            </Link>
          );
        })}

        <NavGroup label="Chat" icon={MessageSquare} items={communicationNavItems} {...navGroupCommon} />
        <NavGroup label="Web Content" icon={Newspaper} items={contentWebNavItems} {...navGroupCommon} />
        <NavGroup label="Deals" icon={Handshake} items={dealsNavItems} {...navGroupCommon} />
        <NavGroup label="Sales Hub" icon={Briefcase} items={clientEngagementNavItems} badges={{ "/admin/messages": clientUnreadCount }} {...navGroupCommon} />
        <NavGroup label="Executive Board" icon={Landmark} items={executiveBoardNavItems} {...navGroupCommon} />
        <NavGroup label="Compliance" icon={Scale} items={complianceNavItems} {...navGroupCommon} />

        {isCollapsed ? (
          <div className="my-2 flex justify-center">
            <span className="h-px w-8 bg-gray-100" />
          </div>
        ) : (
          <div className="pt-4 pb-1 px-4">
            <p className="text-[10px] font-bold text-gray-300 uppercase tracking-[0.12em]">Operations</p>
          </div>
        )}

        {(isSuperAdmin || hasPermission(permissions, "team_today")) && (
          <Link
            href="/admin/taskboard"
            onClick={onNavigate}
            title={isCollapsed ? "Taskboard" : undefined}
            aria-label={isCollapsed ? "Taskboard" : undefined}
            className={`flex min-h-11 items-center rounded-xl text-[13.5px] font-medium transition-all ${
              isCollapsed ? "justify-center py-2.5" : "gap-3 px-4 py-2.5"
            } ${
              pathname?.startsWith("/admin/taskboard")
                ? "bg-[#0A4FE8] text-white shadow-md shadow-blue-200"
                : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
            }`}
          >
            <KanbanSquare className={`${isCollapsed ? "w-[20px] h-[20px]" : "w-[18px] h-[18px]"} flex-shrink-0`} />
            {!isCollapsed && "Taskboard"}
          </Link>
        )}

        <NavGroup label="CREATE" icon={Wand2} items={createNavItems} {...navGroupCommon} />
        <NavGroup label="Content Hub" icon={LayoutGrid} items={contentHubNavItems} {...navGroupCommon} />
        <NavGroup label="Intelligence" icon={Newspaper} items={intelligenceNavItems} {...navGroupCommon} />
        <NavGroup label="Finance" icon={Wallet} items={financeNavItems} {...navGroupCommon} />
        <NavGroup label="Projects" icon={Boxes} items={projectsNavItems} {...navGroupCommon} />
        <NavGroup label="CRM" icon={Building2} items={clientsNavItems} {...navGroupCommon} />
        <NavGroup label="HRM" icon={UserPlus} items={hrmNavItems} {...navGroupCommon} />
        <NavGroup label="Workspace" icon={LayoutGrid} items={workspaceNavItems} {...navGroupCommon} />
      </nav>

      <div className={`pb-6 pt-2 border-t border-gray-50 space-y-1 ${isCollapsed ? "px-2" : "px-3"}`}>
        <button
          type="button"
          onClick={openTeamPortal}
          disabled={isSwitchingPortal}
          className={`group flex min-h-11 w-full items-center rounded-xl bg-[#0A4FE8] text-[13.5px] font-semibold text-white shadow-[0_8px_22px_rgba(10,79,232,0.22)] transition hover:bg-[#083FC0] disabled:cursor-wait disabled:opacity-70 ${
            isCollapsed ? "justify-center py-2.5" : "gap-3 px-4 py-2.5"
          }`}
          title="Switch to the Team Portal"
          aria-label="Open Team Portal"
        >
          {isSwitchingPortal
            ? <Loader2 className="h-[18px] w-[18px] flex-shrink-0 animate-spin" />
            : <ArrowRightLeft className="h-[18px] w-[18px] flex-shrink-0" />}
          {!isCollapsed && (isSwitchingPortal ? "Opening team portal…" : "Open team portal")}
        </button>
        {portalSwitchError && !isCollapsed && (
          <p className="px-2 text-[11px] leading-4 text-rose-600" role="status">
            Team portal is temporarily unavailable. Your admin session is still active.
          </p>
        )}
        <button
          onClick={signOut}
          className={`flex min-h-11 items-center rounded-xl text-[13.5px] font-medium text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all w-full ${
            isCollapsed ? "justify-center py-2.5" : "gap-3 px-4 py-2.5"
          }`}
          title={isCollapsed ? "Logout" : undefined}
          aria-label="Logout"
        >
          <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
          {!isCollapsed && "Logout"}
        </button>
      </div>
    </div>
    );
  };

  return (
    <>
      <aside
        className={`fixed start-0 top-0 z-40 hidden h-screen border-e border-gray-100 bg-white transition-[width] duration-200 lg:block ${
          collapsed ? "w-[76px]" : "w-[230px]"
        }`}
      >
        {renderSidebarContent()}
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
              initial={{ x: "var(--drawer-offset)" }}
              animate={{ x: 0 }}
              exit={{ x: "var(--drawer-offset)" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="fixed inset-y-0 start-0 z-50 w-[86vw] max-w-[320px] border-e border-gray-100 bg-white shadow-2xl [--drawer-offset:-100%] rtl:[--drawer-offset:100%] lg:hidden"
            >
              {renderSidebarContent(true)}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
