"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, LayoutDashboard, Newspaper, FileText, Image as ImageIcon, Package, MessageSquare, ShoppingBag, Settings, ReceiptText, FolderOpen, Palette, CalendarRange, ChevronDown } from "lucide-react";
import { useClientAccount } from "@/components/dashboard/ClientAccountProvider";

type NavigationItem = {
    name: string;
    href: string;
    icon: typeof LayoutDashboard;
    comingSoon?: boolean;
};

const navigationSections: { name: string; items: NavigationItem[] }[] = [
    {
        name: "Overview",
        items: [
            { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
            { name: "Intelligence", href: "/dashboard/intelligence", icon: Newspaper },
        ],
    },
    {
        name: "Brand strategy",
        items: [
            { name: "Brand Brief", href: "/dashboard/brand-brief", icon: FileText },
            { name: "Brand Identity", href: "/dashboard/brand-identity", icon: Palette },
        ],
    },
    {
        name: "Creative services",
        items: [
            { name: "Banners", href: "/dashboard/banners", icon: ImageIcon },
            { name: "Merch", href: "/dashboard/merch", icon: Package },
            { name: "Subscription", href: "/dashboard/subscription", icon: CalendarRange },
        ],
    },
    {
        name: "Communication & files",
        items: [
            { name: "Chat/Meet", href: "/dashboard/messages", icon: MessageSquare },
            { name: "Documents", href: "/dashboard/documents", icon: FolderOpen },
        ],
    },
    {
        name: "Orders & billing",
        items: [
            { name: "Orders", href: "/dashboard/orders", icon: ShoppingBag },
            { name: "Invoices", href: "/dashboard/invoices", icon: ReceiptText },
        ],
    },
    {
        name: "Account",
        items: [
            { name: "Account Config", href: "/dashboard/settings", icon: Settings },
        ],
    },
];

interface SidebarProps {
    isOpen?: boolean;
    onClose?: () => void;
}

export const Sidebar = ({ isOpen = false, onClose }: SidebarProps) => {
    const pathname = usePathname();
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
    const { account, dashboardPath } = useClientAccount();
    const userName = account.fullName || account.email.split("@")[0] || "User";
    const userCompany = account.companyName || "Client";
    const parts = userName.trim().split(/\s+/).filter(Boolean);
    const userInitials = parts.length > 1
        ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
        : userName.substring(0, 2).toUpperCase();

    useEffect(() => {
        const activeSection = navigationSections.find((section) =>
            section.items.some((item) => {
                const href = dashboardPath(item.href);
                return pathname === href || (href !== dashboardPath("/dashboard") && pathname.startsWith(`${href}/`));
            }),
        );
        if (!activeSection) return;
        setCollapsedSections((current) => current[activeSection.name]
            ? { ...current, [activeSection.name]: false }
            : current);
    }, [dashboardPath, pathname]);

    const toggleSection = (name: string) => {
        setCollapsedSections((current) => ({ ...current, [name]: !current[name] }));
    };

    const handleLogout = async () => {
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => null);
        window.location.replace("/login");
        if (onClose) onClose();
    };

    const NavItem = ({ item, isMobile }: { item: NavigationItem; isMobile?: boolean }) => {
        const itemHref = dashboardPath(item.href);
        const isActive = pathname === itemHref;
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
    };

    const SidebarContent = ({ isMobile = false }) => (
        <div className={cn(
            "h-full flex flex-col bg-white transition-all duration-300",
            isMobile ? "w-full" : "w-[220px] 2xl:w-[260px] border-e border-[#E3E8F4]/60 premium-scrollbar"
        )}>
            {/* Logo */}
            <div className={cn(
                "flex items-center border-b border-[#E3E8F4]/40 shrink-0",
                isMobile ? "h-[64px] px-5 justify-between" : "h-[64px] px-5 2xl:h-[80px] 2xl:px-7"
            )}>
                <Link href="/" onClick={onClose} className="flex">
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
                    {/* CREATE Studio is locked for clients until the tools are perfected.
                        Re-enable this button and set CREATE_CLIENT_ACCESS=true to open it. */}
                    {navigationSections.map((section) => (
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
                                            <NavItem key={item.name} item={item} isMobile={isMobile} />
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

    return (
        <>
            {/* Desktop */}
            <aside className="hidden lg:block h-screen bg-white sticky top-0">
                <SidebarContent />
            </aside>

            {/* Mobile Drawer */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
                            className="fixed inset-0 bg-black/20 backdrop-blur-xs z-[100] lg:hidden" />
                        <motion.div initial={{ x: "var(--drawer-offset)" }} animate={{ x: 0 }} exit={{ x: "var(--drawer-offset)" }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="fixed inset-y-0 start-0 z-[101] w-[86vw] max-w-[320px] border-e border-[#E3E8F4]/60 bg-white shadow-2xl [--drawer-offset:-100%] rtl:[--drawer-offset:100%] lg:hidden">
                            <SidebarContent isMobile />
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
};
