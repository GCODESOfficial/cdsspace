"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { NavbarDashboard } from "@/components/layout/NavbarDashboard";
import { ChatWidget } from "@/components/chat/chat-widget";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <div className="relative flex w-full min-h-screen font-inter antialiased overflow-hidden">
            {/* Soft gradient backdrop */}
            <div className="absolute inset-0 -z-10 bg-gradient-to-br from-blue-100 via-white to-blue-50" />
            <div className="absolute top-0 right-0 -z-10 h-[480px] w-[480px] rounded-full bg-blue-300/25 blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-1/4 -z-10 h-[400px] w-[400px] rounded-full bg-indigo-200/30 blur-3xl pointer-events-none" />

            {/* Sidebar */}
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                <NavbarDashboard onMenuClick={() => setIsSidebarOpen(true)} />

                <main className="flex-1 p-4 lg:p-5 2xl:p-6 overflow-hidden">
                    <div className="w-full h-full bg-white/70 backdrop-blur-xl rounded-2xl lg:rounded-3xl shadow-[0_10px_40px_rgba(15,40,90,0.06)] border border-white/70 overflow-y-auto relative premium-scrollbar">
                        {children}
                    </div>
                </main>
            </div>

            <ChatWidget />
        </div>
    );
}
