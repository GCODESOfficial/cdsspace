"use client";

import React from "react";
import { motion } from "framer-motion";
import {
    Target,
    CheckCircle2,
    Wallet,
    Clock,
    ArrowUpRight,
    MoreHorizontal,
    Plus,
    LayoutGrid,
    ChevronRight,
    ArrowRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { DashboardData, DashboardProject, DashboardAsset } from "@/types/dashboard";
import { useClientAccount } from "@/components/dashboard/ClientAccountProvider";

/**
 * GlobalStatCard - Aggregated metric for the Billion Dollar Dashboard.
 */
const GlobalStatCard = ({
    label,
    value,
    trend,
    icon: Icon,
    colorClass,
    delay
}: {
    label: string;
    value: string;
    trend?: string;
    icon: any;
    colorClass: string;
    delay: number;
}) => (
    <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="bg-white border border-brand-stroke/60 rounded-[16px] lg:rounded-[20px] xl:rounded-[24px] p-4 lg:p-5 xl:p-7 space-y-3 lg:space-y-4 xl:space-y-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden"
    >
        <div className="flex items-center justify-between">
            <div className={cn("size-8 lg:size-10 xl:size-12 rounded-lg xl:rounded-xl flex items-center justify-center", colorClass)}>
                <Icon className="size-4 xl:size-6" />
            </div>
            {trend && (
                <span className="text-[#009C22] text-[10px] xl:text-[14px] font-bold bg-[#009C22]/5 px-1.5 xl:px-2 py-0.5 xl:py-1 rounded-full flex items-center gap-1">
                    <ArrowUpRight className="size-2.5 xl:size-3" />
                    {trend}
                </span>
            )}
        </div>
        <div className="space-y-0.5 xl:space-y-1">
            <p className="text-brand-mute text-[9px] lg:text-[11px] xl:text-[13px] font-bold uppercase tracking-[1px]">{label}</p>
            <h2 className="text-brand-navy text-[20px] lg:text-[24px] xl:text-[36px] font-extrabold leading-none">{value}</h2>
        </div>
    </motion.div>
);

/**
 * PipelineItem - A single project tracking row.
 */
const PipelineItem = ({ project }: { project: DashboardProject }) => (
    <div className="group flex flex-col sm:flex-row sm:items-center justify-between p-3.5 lg:p-4 bg-brand-bg/40 hover:bg-white border border-transparent hover:border-brand-blue/10 rounded-[16px] transition-all duration-300 gap-4">
        <div className="flex items-center gap-3 lg:gap-4">
            <div className={cn(
                "size-8 lg:size-10 xl:size-12 rounded-lg lg:rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110",
                project.type === "Merch" ? "bg-[#E6EBFA] text-brand-blue" : "bg-[#FEF6E6] text-[#D97706]"
            )}>
                {project.type === "Merch" ? <Target className="size-4 lg:size-5" /> : <LayoutGrid className="size-4 lg:size-5" />}
            </div>
            <div className="min-w-0">
                <h4 className="text-brand-navy text-[13px] lg:text-[15px] xl:text-[16px] font-bold truncate group-hover:text-brand-blue transition-colors">{project.name}</h4>
                <p className="text-brand-mute text-[10px] lg:text-[11px] xl:text-[12px] font-medium">{project.type} • {project.status}</p>
            </div>
        </div>

        <div className="flex flex-col gap-1.5 w-full sm:w-[120px] lg:w-[150px] xl:w-[180px]">
            <div className="flex items-center justify-between text-[10px] xl:text-[11px] font-bold text-brand-navy">
                <span className="opacity-60">Progress</span>
                <span>{project.progress}%</span>
            </div>
            <div className="h-1 lg:h-1.5 bg-white border border-brand-stroke rounded-full overflow-hidden">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${project.progress}%` }}
                    transition={{ duration: 1, delay: 0.5 }}
                    className="h-full bg-[#0A4FE8]"
                />
            </div>
        </div>
    </div>
);

/**
 * DashboardActiveState - The decoupled UI for active users.
 * Accepts structured data to ensure future API compatibility.
 */
export const DashboardActiveState = ({ data }: { data: DashboardData }) => {
    const { dashboardPath } = useClientAccount();
    return (
        <div className="w-full h-full p-4 lg:p-6 xl:p-12 2xl:p-16 space-y-8 lg:space-y-12 xl:space-y-20 pb-24">
            {/* 1. Global Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 xl:gap-8">
                <GlobalStatCard
                    label="Active Projects"
                    value={data.stats.activeProjects.toString().padStart(2, "0")}
                    trend={data.stats.trends.activeProjects}
                    icon={Target}
                    colorClass="bg-[#E6EBFA] text-brand-blue"
                    delay={0.1}
                />
                <GlobalStatCard
                    label="Completed"
                    value={data.stats.completedProjects.toString()}
                    icon={CheckCircle2}
                    colorClass="bg-[#E6F3EB] text-[#059669]"
                    delay={0.2}
                />
                <GlobalStatCard
                    label="Earned Points"
                    value={data.stats.earnedPoints.toLocaleString()}
                    trend={data.stats.trends.earnedPoints}
                    icon={Wallet}
                    colorClass="bg-[#FEF6E6] text-[#D97706]"
                    delay={0.3}
                />
                <GlobalStatCard
                    label="Avg. Delivery"
                    value={data.stats.avgDeliveryDays}
                    icon={Clock}
                    colorClass="bg-[#F4F6FB] text-brand-navy"
                    delay={0.4}
                />
            </div>

            {/* 2. Main Dashboard Content Area */}
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] 2xl:grid-cols-[1fr_420px] gap-6 lg:gap-10 xl:gap-14">

                {/* Left Side: Pipeline */}
                <div className="space-y-6 lg:space-y-10">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5 lg:space-y-1">
                            <h2 className="text-brand-navy text-[18px] lg:text-[24px] xl:text-[28px] font-extrabold tracking-tight">Active Pipeline</h2>
                            <p className="text-brand-mute text-[11px] lg:text-[13px] xl:text-[14px] font-medium">Tracking your current creative deliverables</p>
                        </div>
                        <button className="h-9 xl:h-10 px-3 xl:px-4 rounded-full border border-brand-stroke text-brand-navy text-[12px] xl:text-sm font-bold hover:bg-white transition-colors">
                            View History
                        </button>
                    </div>

                    <div className="space-y-2 lg:space-y-4">
                        {data.pipeline.map((project) => (
                            <PipelineItem key={project.id} project={project} />
                        ))}
                    </div>

                    {/* Quick Launch Grid */}
                    <div className="pt-6 lg:pt-8 space-y-4 lg:space-y-6">
                        <h3 className="text-brand-navy text-[14px] lg:text-[16px] xl:text-[18px] font-bold">Launch New Studio</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4">
                            {[
                                { name: "Merch", icon: "/dashboard/plate.svg", href: "/dashboard/merch" },
                                { name: "Banner", icon: "/dashboard/clipboard.svg", href: "/dashboard/banners" },
                                { name: "Brief", icon: "/dashboard/files-01.svg", href: "/dashboard/brand-brief" },
                                { name: "Identity", icon: "/dashboard/agreement-02.svg", href: "/dashboard/brand-identity" }
                            ].map((studio, i) => (
                                <Link
                                    key={i}
                                    href={dashboardPath(studio.href)}
                                    className="flex flex-col items-center gap-3 lg:gap-4 p-4 lg:p-6 bg-white border border-brand-stroke rounded-[16px] lg:rounded-[20px] hover:border-brand-blue/30 transition-all hover:-translate-y-1 group"
                                >
                                    <div className="size-8 lg:size-12 rounded-full bg-brand-bg flex items-center justify-center group-hover:bg-brand-blue/5">
                                        <Image src={studio.icon} alt="" width={24} height={24} className="size-4 lg:size-6" />
                                    </div>
                                    <span className="text-brand-navy text-[10px] lg:text-[12px] xl:text-[13px] font-bold uppercase tracking-wider">{studio.name}</span>
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Side: Insights */}
                <div className="space-y-6 lg:space-y-10">
                    {/* Milestone Card */}
                    {data.nextMilestone && (
                        <div className="bg-[#040B37] rounded-[20px] lg:rounded-[32px] p-6 lg:p-10 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-8 transform translate-x-4 -translate-y-4 opacity-10 group-hover:scale-110 transition-transform duration-700">
                                <Image src="/dashboard/dashboard-square-03.svg" alt="" width={160} height={160} className="brightness-0 invert" />
                            </div>

                            <div className="relative z-10 space-y-5 lg:space-y-8">
                                <span className="text-[9px] lg:text-[11px] font-bold uppercase tracking-[2px] text-brand-blue">Next Milestone</span>
                                <div className="space-y-2 lg:space-y-3">
                                    <h3 className="text-white text-[16px] lg:text-[22px] font-bold tracking-tight">{data.nextMilestone.title}</h3>
                                    <p className="text-white/60 text-[11px] lg:text-[14px] leading-relaxed">{data.nextMilestone.description}</p>
                                </div>
                                <Link href={dashboardPath(data.nextMilestone.actionHref === "/brand-brief" ? "/dashboard/brand-brief" : data.nextMilestone.actionHref)} className="inline-flex items-center gap-2 text-white font-bold text-[12px] lg:text-[14px] group-hover:gap-3 transition-all">
                                    <span>{data.nextMilestone.actionLabel}</span>
                                    <ArrowRight className="size-3.5 lg:size-4" />
                                </Link>
                            </div>
                        </div>
                    )}

                    {/* Visual Asset Peek */}
                    <div className="space-y-4 lg:space-y-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-brand-navy text-[14px] lg:text-[18px] font-bold">Recent Files</h3>
                            <button className="size-7 lg:size-8 rounded-full bg-brand-bg flex items-center justify-center text-brand-mute hover:text-brand-blue transition-colors">
                                <MoreHorizontal className="size-3.5 lg:size-4" />
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {data.assets.map((asset) => (
                                <div key={asset.id} className="aspect-square bg-brand-bg rounded-[16px] border border-brand-stroke relative overflow-hidden group cursor-pointer">
                                    <div className="absolute inset-0 bg-brand-navy/0 group-hover:bg-brand-navy/60 transition-all flex items-center justify-center">
                                        <Plus className="size-5 lg:size-6 text-white opacity-0 group-hover:opacity-100 scale-50 group-hover:scale-100 transition-all" />
                                    </div>
                                    <div className="absolute bottom-2.5 left-2.5 right-2.5 flex flex-col group-hover:opacity-0 transition-opacity">
                                        <span className="text-[8px] lg:text-[10px] font-bold text-brand-mute uppercase">Preview</span>
                                        <span className="text-[9px] lg:text-[11px] font-bold text-brand-navy truncate">{asset.name}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};
