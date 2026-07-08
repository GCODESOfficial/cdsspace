"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Search } from "lucide-react";
import NotificationBell from "@/components/notifications/notification-bell";

interface NavbarDashboardProps {
    onMenuClick?: () => void;
}

export const NavbarDashboard = ({ onMenuClick }: NavbarDashboardProps) => {
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
                setUserCompany(company || "Best Client Account");
                setUserAvatar(user.user_metadata?.avatar_url || user.user_metadata?.picture || null);
                const parts = name.trim().split(" ");
                setUserInitials(parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.substring(0, 2).toUpperCase());
            }
        };
        fetchUser();
    }, []);

    return (
        <header className="h-[64px] 2xl:h-[80px] bg-white border-b border-[#E3E8F4]/40 w-full px-3 sm:px-4 lg:px-6 2xl:px-8 flex items-center justify-between gap-2 sticky top-0 z-50">
            {/* Mobile Logo */}
            <div className="lg:hidden shrink-0">
                <Image src="/dashboard/Group 1000004159.svg" alt="Logo" width={46} height={18} />
            </div>

            {/* Search */}
            <div className="flex-1 min-w-0 flex justify-center px-1 sm:px-2 lg:px-3">
                <div className="flex items-center gap-2 sm:gap-3 2xl:gap-4 min-w-0 w-full lg:w-auto">
                    <div className={cn(
                        "h-10 2xl:h-11 border border-[#E3E8F4]/60 rounded-xl px-3.5 2xl:px-4 flex items-center gap-2.5 bg-[#F8F9FC] transition-all focus-within:bg-white focus-within:border-brand-blue/30 focus-within:shadow-[0_0_0_3px_rgba(5,117,255,0.06)]",
                        "w-full max-w-[190px] sm:max-w-[260px] lg:w-[480px] lg:max-w-none xl:w-[600px] 2xl:w-[760px]"
                    )}>
                        <Search className="w-4 h-4 text-[#B0B9D1] shrink-0" strokeWidth={2} />
                        <input
                            type="text"
                            placeholder="Search..."
                            className="flex-1 bg-transparent outline-none text-brand-navy text-[13px] 2xl:text-[14px] font-medium placeholder:text-[#B0B9D1] min-w-0"
                        />
                    </div>

                    <NotificationBell />

                    <div className="hidden lg:block w-px h-7 bg-[#E3E8F4]/40 mx-1 shrink-0" />
                </div>
            </div>

            {/* Mobile Menu */}
            <button onClick={onMenuClick} className="lg:hidden w-6 h-6 flex flex-col justify-center items-end gap-[5px] cursor-pointer group">
                <div className="w-full h-[2px] bg-brand-navy rounded-full transition-all group-hover:w-[80%]" />
                <div className="w-[80%] h-[2px] bg-brand-navy rounded-full transition-all group-hover:w-full" />
                <div className="w-full h-[2px] bg-brand-navy rounded-full transition-all group-hover:w-[80%]" />
            </button>

            {/* Profile (Desktop) */}
            <div className="hidden lg:flex items-center gap-3 shrink-0">
                <div className="flex flex-col items-end">
                    <span className="text-brand-navy text-[14px] 2xl:text-[15px] font-semibold leading-tight max-w-[180px] truncate">{userName}</span>
                    <span className="text-[#8E99B7] text-[11px] 2xl:text-[12px] font-medium max-w-[180px] truncate">{userCompany}</span>
                </div>
                <div className="w-9 h-9 2xl:w-10 2xl:h-10 bg-brand-blue rounded-full flex items-center justify-center shadow-[0_2px_8px_rgba(28,78,209,0.2)] overflow-hidden relative transition-transform hover:scale-105">
                    <span className="text-white text-[13px] 2xl:text-[14px] font-semibold tracking-wide">{userInitials}</span>
                </div>
            </div>
        </header>
    );
};
