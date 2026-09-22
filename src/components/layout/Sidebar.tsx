"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, LayoutDashboard, Newspaper, FileText, Image as ImageIcon, Package, MessageSquare, ShoppingBag, Settings, ReceiptText, FolderOpen, Palette, CalendarRange, ChevronDown, PenLine, Gift, Video } from "lucide-react";
import { useClientAccount, type ClientAccountSnapshot } from "@/components/dashboard/ClientAccountProvider";
import type { ClientModuleKey, ClientModuleVisibility } from "@/lib/client-modules";

type NavigationItem = {
    name: string;
    href: string;
    icon: typeof LayoutDashboard;
    comingSoon?: boolean;
    /** Admin can switch this entry off from Admin > CRM > Dashboard Modules. */
    module: ClientModuleKey;
};

const navigationSections: { name: string; items: NavigationItem[] }[] = [
    {
        name: "Overview",
        items: [
            { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, module: "overview" },
            { name: "Intelligence", href: "/dashboard/intelligence", icon: Newspaper, module: "intelligence" },
        ],
    },
    {
        name: "Brand strategy",
        items: [
            { name: "Brand Brief", href: "/dashboard/brand-brief", icon: FileText, module: "brand_brief" },
            { name: "Brand Identity", href: "/dashboard/brand-identity", icon: Palette, module: "brand_identity" },
        ],
    },
    {
        name: "Creative services",
        items: [
            { name: "Create Studio", href: "/create?workspace=client", icon: PenLine, module: "documents" },
            { name: "Banners", href: "/dashboard/banners", icon: ImageIcon, module: "banners" },
            { name: "Merch", href: "/dashboard/merch", icon: Package, module: "merch" },
            { name: "cGifts", href: "/dashboard/cgifts", icon: Gift, module: "cgifts" },
            { name: "Subscription", href: "/dashboard/subscription", icon: CalendarRange, module: "subscription" },
        ],
    },
    {
        name: "Communication & files",
        items: [
            { name: "Chat", href: "/dashboard/messages", icon: MessageSquare, module: "messages" },
            { name: "cMeet", href: "/dashboard/cmeet", icon: Video, module: "cmeet" },
            { name: "cDrive", href: "/dashboard/cdrive", icon: FolderOpen, module: "documents" },
        ],
    },
    {
        name: "Orders & billing",
        items: [
            { name: "Orders", href: "/dashboard/orders", icon: ShoppingBag, module: "orders" },
            { name: "Invoices", href: "/dashboard/invoices", icon: ReceiptText, module: "invoices" },
        ],
    },
    {
        name: "Account",
        items: [
            { name: "Account Config", href: "/dashboard/settings", icon: Settings, module: "settings" },
        ],
    },
];

interface SidebarProps {
    isOpen?: boolean;
    onClose?: () => void;
}

/** Drop every entry, and then every emptied section, admin has switched off. */
function visibleSections(modules: ClientModuleVisibility) {
    return navigationSections
        .map((section) => ({ ...section, items: section.items.filter((item) => modules[item.module] !== false) }))
        .filter((section) => section.items.length > 0);
}

export const Sidebar = ({ isOpen = false, onClose }: SidebarProps) => {
    const pathname = usePathname();
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
    const { account, dashboardPath, modules } = useClientAccount();
    const sections = useMemo(() => visibleSections(modules), [modules]);
    const userName = account.fullName || account.email.split("@")[0] || "User";
    const userCompany = account.companyName || "Client";
    const parts = userName.trim().split(/\s+/).filter(Boolean);
    const userInitials = parts.length > 1
        ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
        : userName.substring(0, 2).toUpperCase();

    useEffect(() => {
        const activeSection = sections.find((section) =>
            section.items.some((item) => {
                const href = dashboardPath(item.href);
                return pathname === href || (href !== dashboardPath("/dashboard") && pathname.startsWith(`${href}/`));
            }),
        );
        if (!activeSection) return;
        setCollapsedSections((current) => current[activeSection.name]
            ? { ...current, [activeSection.name]: false }
            : current);
    }, [dashboardPath, pathname, sections]);

    const toggleSection = (name: string) => {
        setCollapsedSections((current) => ({ ...current, [name]: !current[name] }));
    };

    const handleLogout = async () => {
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => null);
        window.location.replace("/login");
        if (onClose) onClose();
    };

    return (
        <>
            {/* Desktop */}
            <aside className="hidden lg:block h-screen bg-white sticky top-0">
                <SidebarContent
                    onClose={onClose}
                    account={account}
                    userName={userName}
                    userCompany={userCompany}
                    userInitials={userInitials}
                    collapsedSections={collapsedSections}
                    toggleSection={toggleSection}
                    handleLogout={handleLogout}
                    dashboardPath={dashboardPath}
                    pathname={pathname}
                    sections={sections}
                />
            </aside>

            {/* Mobile Drawer */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
                            className="fixed inset-0 bg-black/20 backdrop-blur-xs layer-chrome lg:hidden" />
                        <motion.div initial={{ x: "var(--drawer-offset)" }} animate={{ x: 0 }} exit={{ x: "var(--drawer-offset)" }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="fixed inset-y-0 start-0 layer-chrome-panel w-[86vw] max-w-[320px] border-e border-[#E3E8F4]/60 bg-white shadow-2xl [--drawer-offset:-100%] rtl:[--drawer-offset:100%] lg:hidden">
                            <SidebarContent
                                isMobile
                                onClose={onClose}
                                account={account}
                                userName={userName}
                                userCompany={userCompany}
                                userInitials={userInitials}
                                collapsedSections={collapsedSections}
                                toggleSection={toggleSection}
                                handleLogout={handleLogout}
                                dashboardPath={dashboardPath}
                                pathname={pathname}
                                sections={sections}
                            />
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
};

function NavItem({ item, isMobile, itemHref, isActive, onClose }: {
    item: NavigationItem;
    isMobile?: boolean;
    itemHref: string;
    isActive: boolean;
    onClose?: () => void;
}) {
        const Icon = item.icon;
        const isLocked = item.comingSoon;

        if (isLocked) {
            return (
                <div
                    aria-disabled="true"
                    title="Coming soon"
                    className={cn(
                        "flex items-center rounded-xl group cursor-not-allowed opacity-60",
                        isMobile ? "p-[10px] gap-[10px]" : "px-3 py-2.5 gap-3 2xl:px-4 2xl:py-3"
                    )}
                >
                    <div className={cn("shrink-0 flex items-center justify-center", isMobile ? "w-6 h-6" : "w-5 h-5 2xl:w-6 2xl:h-6")}>
                        <Icon className="w-full h-full text-[#8E99B7]" strokeWidth={1.8} />
                    </div>
                    <span className={cn("font-medium tracking-[-0.01em] text-[#4A5578]", isMobile ? "text-[14px]" : "text-[13px] 2xl:text-[15px] whitespace-nowrap")}>
                        {item.name}
                    </span>
                    <span className="ml-auto text-[9px] 2xl:text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8E99B7] bg-[#F4F6FB] border border-[#E3E8F4] rounded-full px-2 py-[2px]">
                        Soon
                    </span>
                </div>
            );
        }

        return (
            <Link
                href={itemHref}
                onClick={onClose}
                data-onboarding-module={item.href}
                className={cn(
                    "flex items-center rounded-xl transition-all duration-300 group",
                    isMobile ? "p-[10px] gap-[10px]" : "px-3 py-2.5 gap-3 2xl:px-4 2xl:py-3",
                    isActive
                        ? "bg-[#0A4FE8] shadow-[0_4px_16px_rgba(0,53,193,0.25)]"
                        : "hover:bg-[#F4F6FB]"
                )}
            >
                <div className={cn(
                    "shrink-0 flex items-center justify-center",
                    isMobile ? "w-6 h-6" : "w-5 h-5 2xl:w-6 2xl:h-6"
                )}>
                    <Icon className={cn(
                        "w-full h-full transition-all duration-300",
                        isActive ? "text-white" : "text-[#8E99B7] group-hover:text-brand-navy"
                    )} strokeWidth={1.8} />
                </div>
                <span className={cn(
                    "font-medium tracking-[-0.01em] transition-colors duration-300",
                    isMobile ? "text-[14px]" : "text-[13px] 2xl:text-[15px] whitespace-nowrap",
                    isActive ? "text-white" : "text-[#4A5578] group-hover:text-brand-navy"
                )}>
                    {item.name}
                </span>
            </Link>
        );
}

function SidebarContent({
    isMobile = false,
    onClose,
    account,
    userName,
    userCompany,
    userInitials,
    collapsedSections,
    toggleSection,
    handleLogout,
    dashboardPath,
    pathname,
    sections,
}: {
    isMobile?: boolean;
    onClose?: () => void;
    account: ClientAccountSnapshot;
    userName: string;
    userCompany: string;
    userInitials: string;
    collapsedSections: Record<string, boolean>;
    toggleSection: (name: string) => void;
    handleLogout: () => void;
    dashboardPath: (destination?: string) => string;
    pathname: string;
    sections: { name: string; items: NavigationItem[] }[];
}) {
    return (
        <div className={cn(
            "h-full flex flex-col bg-white transition-all duration-300",
            isMobile ? "w-full" : "w-[220px] 2xl:w-[260px] border-e border-[#E3E8F4]/60 premium-scrollbar"
        )}>
            {/* Logo */}
            <div className={cn(
                "flex items-center border-b border-[#E3E8F4]/40 shrink-0",
                isMobile ? "h-[64px] px-5 justify-between" : "h-[64px] px-5 2xl:h-[80px] 2xl:px-7"
            )}>
                <Link href={dashboardPath("/dashboard")} onClick={onClose} className="flex rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#0A4FE8]/40" aria-label="Return to dashboard home">
                    <div className={cn("relative", isMobile ? "w-[46px] h-[18px]" : "w-[56px] h-[22px] 2xl:w-[72px] 2xl:h-[28px]")}>
                        <Image src="/dashboard/Group 1000004159.svg" alt="CDS Space" fill className="object-contain" />
                    </div>
                </Link>
                {isMobile && (
                    <button onClick={onClose} className="p-1 cursor-pointer text-[#8E99B7] hover:text-brand-navy transition">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                )}
            </div>

            {/* Navigation */}
            <div className={cn(
                "flex-1 overflow-y-auto flex flex-col scrollbar-hide",
                isMobile ? "px-4 py-6" : "px-3 py-4 2xl:px-4 2xl:py-5"
            )}>
                <nav aria-label="Client dashboard" className="space-y-4">
                    {sections.map((section) => (
                        <section key={section.name} aria-labelledby={`sidebar-${section.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                            <button
                                type="button"
                                onClick={() => toggleSection(section.name)}
                                aria-expanded={!collapsedSections[section.name]}
                                aria-controls={`sidebar-items-${section.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                                className="flex h-8 w-full items-center justify-between rounded-lg px-3 text-left transition hover:bg-[#F4F6FB]"
                            >
                                <h2
                                    id={`sidebar-${section.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                                    className="text-[10px] font-semibold tracking-normal text-[#9DA8C3] 2xl:text-[11px]"
                                >
                                    {section.name}
                                </h2>
                                <ChevronDown
                                    className={cn(
                                        "h-3.5 w-3.5 text-[#9DA8C3] transition-transform duration-200",
                                        collapsedSections[section.name] && "-rotate-90",
                                    )}
                                />
                            </button>
                            <AnimatePresence initial={false}>
                                {!collapsedSections[section.name] && (
                                    <motion.div
                                        id={`sidebar-items-${section.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.18, ease: "easeOut" }}
                                        className="space-y-0.5 overflow-hidden"
                                    >
                                        {section.items.map((item) => (
                                            <NavItem
                                                key={item.name}
                                                item={item}
                                                isMobile={isMobile}
                                                itemHref={dashboardPath(item.href)}
                                                isActive={pathname === dashboardPath(item.href)}
                                                onClose={onClose}
                                            />
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </section>
                    ))}
                </nav>

                {/* Logout */}
                <div className="mt-auto pt-4">
                    <button
                        onClick={handleLogout}
                        className={cn(
                            "w-full flex items-center rounded-xl transition-all duration-300 group hover:bg-red-50 cursor-pointer",
                            isMobile ? "p-[10px] gap-[10px]" : "px-3 py-2.5 gap-3 2xl:px-4 2xl:py-3"
                        )}
                    >
                        <LogOut className={cn(
                            "text-[#B0B9D1] group-hover:text-red-500 transition-colors shrink-0",
                            isMobile ? "w-6 h-6" : "w-5 h-5 2xl:w-6 2xl:h-6"
                        )} strokeWidth={1.8} />
                        <span className={cn(
                            "font-medium text-[#B0B9D1] group-hover:text-red-500 transition-colors",
                            isMobile ? "text-[14px]" : "text-[13px] 2xl:text-[15px] whitespace-nowrap"
                        )}>
                            Log out
                        </span>
                    </button>
                </div>
            </div>

            {/* User Profile (Mobile Only) */}
            {isMobile && (
                <div className="p-4 border-t border-[#E3E8F4]/40 flex items-center gap-3">
                    <div className="w-10 h-10 bg-brand-blue rounded-full flex items-center justify-center shadow-sm overflow-hidden relative shrink-0">
                        {account.avatarUrl ? (
                            <Image src={account.avatarUrl} alt={`${userName} profile photo`} fill sizes="40px" className="object-cover" />
                        ) : (
                            <span className="text-white text-sm font-semibold">{userInitials}</span>
                        )}
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="text-brand-navy text-sm font-semibold truncate">{userName}</span>
                        <span className="text-[#8E99B7] text-xs font-medium truncate">{userCompany}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
