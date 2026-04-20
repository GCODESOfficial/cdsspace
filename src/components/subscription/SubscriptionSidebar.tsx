"use client";

import { PortfolioViewer } from "./PortfolioViewer";

interface SubscriptionSidebarProps {
    selectedIndustry?: string;
}

export const SubscriptionSidebar = ({ selectedIndustry }: SubscriptionSidebarProps) => {
    return (
        <aside className="hidden lg:flex w-[300px] xl:w-[380px] 2xl:w-[423px] flex-col gap-[32px] lg:gap-[40px] p-4 bg-white rounded-[24px] shadow-sm overflow-y-auto premium-scrollbar h-full sticky top-0 border border-brand-stroke/50">
            <PortfolioViewer selectedIndustry={selectedIndustry} />
        </aside>
    );
};
