/**
 * Unified Dashboard Types for the CDS Platform.
 * These types serve as the contract between the Frontend UI and the Backend API.
 */

export type ProjectStatus = "Awaiting Files" | "In Review" | "Approved" | "Production" | "Shipped" | "Completed";

export type ProjectType = "Merch" | "Banner" | "Design";

export interface DashboardProject {
    id: string;
    name: string;
    type: ProjectType;
    status: ProjectStatus;
    progress: number;
    updatedAt: string;
}

export interface DashboardStats {
    activeProjects: number;
    completedProjects: number;
    earnedPoints: number;
    avgDeliveryDays: string;
    trends: {
        activeProjects?: string;
        earnedPoints?: string;
    };
}

export interface DashboardAsset {
    id: string;
    name: string;
    previewUrl?: string;
    type: string;
}

export interface DashboardData {
    stats: DashboardStats;
    pipeline: DashboardProject[];
    assets: DashboardAsset[];
    nextMilestone?: {
        title: string;
        description: string;
        actionLabel: string;
        actionHref: string;
    };
}
