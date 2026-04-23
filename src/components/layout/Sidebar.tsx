"use client";

import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, LayoutDashboard, CreditCard, FileText, Image as ImageIcon, Package, MessageSquare, ShoppingBag, Handshake, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const mainNavItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Subscription", href: "/subscription", icon: CreditCard },
    { name: "Brand Brief", href: "/brand-brief", icon: FileText },
    { name: "Banners", href: "/dashboard/banners", icon: ImageIcon, comingSoon: true },
    { name: "Merch", href: "/dashboard/merch", icon: Package, comingSoon: true },
    { name: "Secured Chat", href: "/dashboard/messages", icon: MessageSquare },
    { name: "Orders", href: "/dashboard/orders", icon: ShoppingBag },
    { name: "Best Partner", href: "/partnership", icon: Handshake },
];

const controlCenterItems = [
    { name: "Settings", href: "/settings", icon: Settings },
];

interface SidebarProps {
    isOpen?: boolean;
    onClose?: () => void;
}

export const Sidebar = ({ isOpen = false, onClose }: SidebarProps) => {
    const pathname = usePathname();
    const router = useRouter();

    const [userName, setUserName] = useState("Loading...");
    const [userInitials, setUserInitials] = useState("");
    const [userCompany, setUserCompany] = useState("");
    const [userAvatar, setUserAvatar] = useState<string | null>(null);

    useEffect(() => {
        const fetchUser = async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const name = user.user_metadata?.full_name || user.email?.split("@")[0] || "User";
                const company = user.user_metadata?.company_name;
                setUserName(name);
                setUserCompany(company || "Client");
                setUserAvatar(user.user_metadata?.avatar_url || user.user_metadata?.picture || null);
                const parts = name.trim().split(" ");
                setUserInitials(parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.substring(0, 2).toUpperCase());
            }
        };
        fetchUser();
    }, []);

    const handleLogout = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/login");
        if (onClose) onClose();
    };

    const NavItem = ({ item, isMobile }: { item: typeof mainNavItems[0]; isMobile?: boolean }) => {
        const isActive = pathname === item.href || (item.href === "/dashboard" && (pathname === "/" || pathname === "/dashboard"));
        const Icon = item.icon;
        const isLocked = (item as any).comingSoon;

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
                href={item.href}
                onClick={onClose}
                className={cn(
                    "flex items-center rounded-xl transition-all duration-300 group",
                    isMobile ? "p-[10px] gap-[10px]" : "px-3 py-2.5 gap-3 2xl:px-4 2xl:py-3",
                    isActive
                        ? "bg-gradient-to-r from-[#0035C1] to-[#0575FF] shadow-[0_4px_16px_rgba(0,53,193,0.25)]"
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
            isMobile ? "w-full" : "w-[220px] 2xl:w-[260px] border-r border-[#E3E8F4]/60 premium-scrollbar"
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
                {/* Main Nav */}
                <div className="space-y-0.5">
                    <div className="h-7 px-3 flex items-center">
                        <span className="text-[10px] 2xl:text-[11px] font-bold text-[#B0B9D1] uppercase tracking-[0.12em]">Main</span>
                    </div>
                    {mainNavItems.map((item) => (
                        <NavItem key={item.name} item={item} isMobile={isMobile} />
                    ))}
                </div>

                {/* Divider */}
                <div className="h-px bg-[#E3E8F4]/40 mx-3 my-4" />

                {/* Control Center */}
                <div className="space-y-0.5">
                    <div className="h-7 px-3 flex items-center">
                        <span className="text-[10px] 2xl:text-[11px] font-bold text-[#B0B9D1] uppercase tracking-[0.12em]">Control Center</span>
                    </div>
                    {controlCenterItems.map((item) => (
                        <NavItem key={item.name} item={item} isMobile={isMobile} />
                    ))}
                </div>

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
                        {userAvatar ? <Image src={userAvatar} alt={userName} fill className="object-cover" /> : <span className="text-white text-sm font-semibold">{userInitials}</span>}
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
                        <motion.div initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="fixed inset-y-0 left-0 w-[86vw] max-w-[320px] bg-white z-[101] lg:hidden shadow-2xl">
                            <SidebarContent isMobile />
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
};
