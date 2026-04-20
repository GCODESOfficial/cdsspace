"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useAdminSession } from "@/hooks/use-admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import {
  LayoutDashboard,
  Upload,
  KeyRound,
  Eye,
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
  Scale,
} from "lucide-react";

const topLevelItems = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard, permission: "dashboard" },
  { label: "Upload Works", href: "/admin/upload-works", icon: Upload, permission: "upload_works" },
  { label: "Generate Codes", href: "/admin/generate-code", icon: KeyRound, permission: "generate_codes" },
  { label: "View Codes", href: "/admin/viewcodes", icon: Eye, permission: "view_codes" },
  { label: "Messages", href: "/admin/messages", icon: MessageSquare, permission: "messages" },
  { label: "Consultations", href: "/admin/consultations", icon: Calendar, permission: "consultations" },
  { label: "Portfolio", href: "/admin/portfolio-designs", icon: ImagePlus, permission: "dashboard" },
  { label: "FAQs", href: "/admin/faqs", icon: HelpCircle, permission: "dashboard" },
  { label: "Legal Documents", href: "/admin/legal", icon: Scale, permission: "legal" },
];

const hrmNavItems = [
  { label: "Overview", href: "/admin/hrm", icon: BarChart3 },
  { label: "Sub-admins", href: "/admin/sub-admins", icon: ShieldCheck },
  { label: "Applications", href: "/admin/applications", icon: Users },
  { label: "Open Roles", href: "/admin/hrm/roles", icon: BriefcaseIcon },
  { label: "Certifications", href: "/admin/hrm/certifications", icon: Award },
];

const financeNavItems = [
  { label: "Overview", href: "/admin/finance", icon: BarChart3 },
  { label: "Invoice", href: "/admin/finance/invoices", icon: FileText },
  { label: "Pricelist", href: "/admin/finance/price-list", icon: Tag },
  { label: "Expenditure", href: "/admin/finance/expenditures", icon: Receipt },
  { label: "Payroll", href: "/admin/finance/payroll", icon: Wallet },
  { label: "Financial Audit", href: "/admin/finance/audit", icon: ClipboardCheck },
];

const projectsNavItems = [
  { label: "Overview", href: "/admin/projects", icon: BarChart3 },
  { label: "Projects", href: "/admin/projects/list", icon: Briefcase },
  { label: "Sub-contractors", href: "/admin/projects/contractors", icon: UserCog },
  { label: "Subscriptions", href: "/admin/projects/subscriptions", icon: Repeat },
];

const clientsNavItems = [
  { label: "Overview", href: "/admin/clients", icon: BarChart3 },
  { label: "Client / Brand List", href: "/admin/clients/list", icon: Building2 },
  { label: "Client Orders", href: "/admin/orders", icon: ShoppingBag },
  { label: "Testimonials", href: "/admin/testimonials", icon: Quote },
];

interface NavGroupProps {
  label: string;
  icon: React.ElementType;
  items: { label: string; href: string; icon: React.ElementType }[];
  pathname: string | null;
  permissionKey: string;
  permissions: string[];
  isSuperAdmin: boolean;
}

function NavGroup({ label, icon: GroupIcon, items, pathname, permissionKey, permissions, isSuperAdmin }: NavGroupProps) {
  const canSee = isSuperAdmin || hasPermission(permissions, permissionKey);
  const exactRoutes = ["/admin/finance", "/admin/projects", "/admin/clients", "/admin/hrm"];
  const isAnyActive = items.some(i => exactRoutes.includes(i.href)
    ? pathname === i.href
    : pathname?.startsWith(i.href));
  const [open, setOpen] = useState(isAnyActive);

  if (!canSee) return null;

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
          {items.map((sub) => {
            const subExactRoutes = ["/admin/finance", "/admin/projects", "/admin/clients", "/admin/hrm"];
            const isActive = subExactRoutes.includes(sub.href)
              ? pathname === sub.href
              : pathname?.startsWith(sub.href);
            return (
              <Link
                key={sub.href}
                href={sub.href}
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

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { session } = useAdminSession();

  const permissions = session?.permissions || [];
  const isSuperAdmin = session?.role === "super_admin";

  const signOut = async () => {
    await fetch("/api/admin-logout", { method: "POST" });
    router.push("/admin/login");
  };

  const visibleTopLevel = topLevelItems.filter(
    (item) => isSuperAdmin || hasPermission(permissions, item.permission)
  );

  return (
    <aside className="fixed left-0 top-0 h-screen w-[230px] bg-white border-r border-gray-100 flex flex-col z-40">
      {/* Logo */}
      <div className="px-6 pt-7 pb-4">
        <Image src="/images/cds-logo.svg" alt="CDS Space" width={100} height={36} className="brightness-0" />
      </div>

      {/* Role badge */}
      {session && (
        <div className="px-6 pb-4">
          <div className={`px-3 py-1.5 rounded-lg text-[11px] font-medium inline-flex items-center gap-1.5 ${
            isSuperAdmin ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-[#0A4FE8]"
          }`}>
            <ShieldCheck className="w-3 h-3" />
            {isSuperAdmin ? "Super Admin" : session.name}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto pb-4">
        {/* Top-level items */}
        {visibleTopLevel.map((item) => {
          const isActive = item.href === "/admin"
            ? pathname === "/admin"
            : pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
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

        {/* Section divider */}
        <div className="pt-4 pb-1 px-4">
          <p className="text-[10px] font-bold text-gray-300 uppercase tracking-[0.12em]">Operations</p>
        </div>

        {/* FINANCE Group */}
        <NavGroup
          label="Finance"
          icon={Wallet}
          items={financeNavItems}
          pathname={pathname}
          permissionKey="finance"
          permissions={permissions}
          isSuperAdmin={isSuperAdmin}
        />

        {/* PROJECTS Group */}
        <NavGroup
          label="Projects"
          icon={Boxes}
          items={projectsNavItems}
          pathname={pathname}
          permissionKey="finance"
          permissions={permissions}
          isSuperAdmin={isSuperAdmin}
        />

        {/* CLIENTS Group */}
        <NavGroup
          label="Clients"
          icon={Building2}
          items={clientsNavItems}
          pathname={pathname}
          permissionKey="orders"
          permissions={permissions}
          isSuperAdmin={isSuperAdmin}
        />

        {/* HRM Group */}
        <NavGroup
          label="HRM"
          icon={UserPlus}
          items={hrmNavItems}
          pathname={pathname}
          permissionKey="applicants"
          permissions={permissions}
          isSuperAdmin={isSuperAdmin}
        />
      </nav>

      {/* Logout */}
      <div className="px-3 pb-6 pt-2 border-t border-gray-50">
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13.5px] font-medium text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all w-full"
        >
          <LogOut className="w-[18px] h-[18px]" />
          Logout
        </button>
      </div>
    </aside>
  );
}
