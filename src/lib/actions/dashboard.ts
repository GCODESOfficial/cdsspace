"use server";

import { DashboardData } from "@/types/dashboard";

/**
 * fetchDashboardData - The central engine for the Dashboard.
 * Currently returns mock data to preserve UI during development.
 * Future: Will perform optimized Prisma queries to aggregate real-time user data.
 */
export async function fetchDashboardData(): Promise<DashboardData> {
    // Artificial delay to simulate network latency for future loading states
    // await new Promise(resolve => setTimeout(resolve, 500));

    return {
        stats: {
            activeProjects: 8,
            completedProjects: 124,
            earnedPoints: 12450,
            avgDeliveryDays: "4.2 Days",
            trends: {
                activeProjects: "+2 new",
                earnedPoints: "+15%"
            }
        },
        pipeline: [
            { id: "1", name: "TechFlow Summer Campaign", status: "Production", type: "Banner", progress: 68, updatedAt: "2026-03-04" },
            { id: "2", name: "ECOM Brand Merch 2026", status: "Approved", type: "Merch", progress: 45, updatedAt: "2026-03-04" },
            { id: "3", name: "StartupFest Rollups", status: "In Review", type: "Banner", progress: 92, updatedAt: "2026-03-04" },
            { id: "4", name: "Team Black Jackets", status: "Awaiting Files", type: "Merch", progress: 15, updatedAt: "2026-03-04" }
        ],
        assets: [
            { id: "1", name: "Asset_1.png", type: "image/png" },
            { id: "2", name: "Asset_2.png", type: "image/png" },
            { id: "3", name: "Asset_3.png", type: "image/png" },
            { id: "4", name: "Asset_4.png", type: "image/png" }
        ],
        nextMilestone: {
            title: "Complete your Brand Brief",
            description: "Defining your brand identity unlocks 15% discount on all custom merch orders for 2026.",
            actionLabel: "Finalize Brief",
            actionHref: "/brand-brief"
        }
    };
}
