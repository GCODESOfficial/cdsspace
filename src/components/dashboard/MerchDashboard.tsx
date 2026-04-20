"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, Target, CheckCircle2, Calendar, Eye, Wallet, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

// --- Types ---

export type ProjectStatus = "Approved" | "In Review" | "Production" | "Shipped";

interface MerchProject {
    id: string;
    projectId: string;
    name: string;
    status: ProjectStatus;
    productType: string;
    quantity: number;
    estimatedCost: number;
    expectedDelivery: string;
    image?: string;
}

// --- Mock Data ---

const MOCK_PROJECTS: MerchProject[] = [
    {
        id: "1",
        projectId: "PRJ-001",
        name: "StartupFest 2026 Merch",
        status: "Production",
        productType: "Tote Bags",
        quantity: 250,
        estimatedCost: 875000,
        expectedDelivery: "Feb 10, 2026"
    },
    {
        id: "2",
        projectId: "PRJ-002",
        name: "StartupFest 20 Merch",
        status: "In Review",
        productType: "T-Shirts",
        quantity: 100,
        estimatedCost: 450000,
        expectedDelivery: "Feb 15, 2026"
    },
    {
        id: "3",
        projectId: "PRJ-003",
        name: "Fest 2026 Merch",
        status: "Approved",
        productType: "Tote Bags",
        quantity: 500,
        estimatedCost: 1200000,
        expectedDelivery: "Mar 01, 2026"
    },
    {
        id: "4",
        projectId: "PRJ-004",
        name: "StartupFest 2025 Merch",
        status: "Shipped",
        productType: "Water Bottles",
        quantity: 1000,
        estimatedCost: 2500000,
        expectedDelivery: "Jan 10, 2026"
    }
];

const STATUS_COLORS: Record<ProjectStatus, { bg: string; text: string; icon: any }> = {
    "Approved": { bg: "bg-[#009C22]/10", text: "text-[#009C22]", icon: CheckCircle2 },
    "In Review": { bg: "bg-[#DC660C]/10", text: "text-[#DC660C]", icon: Target },
    "Production": { bg: "bg-[#4A00FF]/10", text: "text-[#4A00FF]", icon: LayoutGrid },
    "Shipped": { bg: "bg-[#1C4ED1]/10", text: "text-[#1C4ED1]", icon: CheckCircle2 }
};

// --- Components ---

const StatusBadge = ({ status }: { status: ProjectStatus }) => {
    const config = STATUS_COLORS[status];
    return (
        <div className={cn("px-3 py-1.5 rounded-[8px] flex items-center gap-1.5", config.bg)}>
            <span className={cn("text-[10px] lg:text-[12px] font-bold uppercase tracking-wider", config.text)}>
                {status}
            </span>
        </div>
    );
};

const ProjectCard = ({ project, onViewDetails }: { project: MerchProject; onViewDetails: (p: MerchProject) => void }) => {
    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-brand-stroke rounded-[24px] p-6 lg:p-8 flex flex-col gap-8 hover:shadow-xl hover:shadow-brand-navy/5 transition-all duration-300 group"
        >
            <div className="flex items-start justify-between">
                <h3 className="text-brand-navy text-[16px] lg:text-[18px] font-bold leading-tight line-clamp-2 max-w-[70%] group-hover:text-brand-blue transition-colors">
                    {project.name}
                </h3>
                <StatusBadge status={project.status} />
            </div>

            <div className="grid grid-cols-2 gap-y-6">
                <div>
                    <p className="text-brand-mute text-[10px] lg:text-[12px] font-medium mb-1">Product Type</p>
                    <p className="text-brand-body text-[12px] lg:text-[14px] font-bold">{project.productType}</p>
                </div>
                <div className="text-right">
                    <p className="text-brand-mute text-[10px] lg:text-[12px] font-medium mb-1">Quantity</p>
                    <p className="text-brand-body text-[12px] lg:text-[14px] font-bold">{project.quantity} units</p>
                </div>
                <div>
                    <p className="text-brand-mute text-[10px] lg:text-[12px] font-medium mb-1">Estimated Cost</p>
                    <p className="text-brand-blue text-[12px] lg:text-[14px] font-bold">₦{project.estimatedCost.toLocaleString()}</p>
                </div>
                <div className="text-right">
                    <p className="text-brand-mute text-[10px] lg:text-[12px] font-medium mb-1">Project ID</p>
                    <p className="text-brand-body text-[12px] lg:text-[14px] font-bold">{project.id}</p>
                </div>
            </div>

            <div className="bg-brand-bg border border-brand-stroke rounded-[16px] p-4 flex items-center gap-4">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-brand-mute shrink-0">
                    <Calendar className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                    <span className="text-brand-mute text-[10px] font-medium">Expected Delivery</span>
                    <span className="text-brand-body text-[12px] lg:text-[14px] font-bold">{project.expectedDelivery}</span>
                </div>
            </div>

            <button
                onClick={() => onViewDetails(project)}
                className="w-full h-12 lg:h-14 bg-brand-blue border border-[#0035C1] rounded-full flex items-center justify-center gap-2 text-white font-bold hover:bg-opacity-90 transition-all active:scale-[0.98]"
            >
                <Eye className="w-5 h-5" />
                <span className="text-[14px] lg:text-[16px]">View Details</span>
            </button>
        </motion.div>
    );
};

export const MerchDashboard = ({ onCreateNew, onViewDetails }: { onCreateNew: () => void; onViewDetails: (p: MerchProject) => void }) => {
    const [filter, setFilter] = useState<ProjectStatus | "All">("All");

    const filteredProjects = filter === "All"
        ? MOCK_PROJECTS
        : MOCK_PROJECTS.filter(p => p.status === filter);

    const stats = [
        { label: "Total Projects", value: MOCK_PROJECTS.length, icon: Target, color: "text-[#4A00FF]", bg: "bg-[#4A00FF]/5" },
        { label: "Active Projects", value: MOCK_PROJECTS.filter(p => p.status !== "Shipped").length, icon: Target, color: "text-[#DC660C]", bg: "bg-[#DC660C]/5" },
        { label: "Completed", value: MOCK_PROJECTS.filter(p => p.status === "Shipped").length, icon: CheckCircle2, color: "text-[#009C22]", bg: "bg-[#009C22]/5" },
        { label: "Total Value", value: `₦${(MOCK_PROJECTS.reduce((acc, p) => acc + p.estimatedCost, 0) / 1000000).toFixed(1)}M`, icon: Wallet, color: "text-[#1C4ED1]", bg: "bg-[#1C4ED1]/5" },
    ];

    return (
        <div className="w-full max-w-[1300px] mx-auto space-y-12">
            {/* Header & Stats Section */}
            <div className="bg-white p-6 lg:p-10 space-y-10 pb-0!">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="space-y-2">
                        <h1 className="text-brand-navy text-[24px] lg:text-[32px] font-bold tracking-tight">Merchandise</h1>
                        <p className="text-brand-body text-[14px] lg:text-[16px] font-medium opacity-80">Manage and track your active merch projects</p>
                    </div>
                    <button
                        onClick={onCreateNew}
                        className="h-12 lg:h-14 px-6 lg:px-8 bg-linear-to-r from-[#0035C1] to-[#0575FF] rounded-full text-white flex items-center justify-center gap-3 font-bold hover:scale-[1.02] transition-all"
                    >
                        <Plus className="w-5 h-5" />
                        <span className="text-[14px] lg:text-[16px]">Create New Project</span>
                    </button>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
                    {stats.map((stat, idx) => (
                        <div key={idx} className="border border-brand-stroke rounded-[24px] p-6 lg:p-8 space-y-6">
                            <div className="flex items-center justify-between">
                                <span className="text-brand-body text-[12px] lg:text-[14px] font-bold">{stat.label}</span>
                                <div className={cn("size-10 lg:size-12 rounded-[12px] flex items-center justify-center", stat.bg)}>
                                    <stat.icon className={cn("w-5 h-5 lg:w-6 lg:h-6", stat.color)} />
                                </div>
                            </div>
                            <p className="text-brand-navy text-[28px] lg:text-[40px] font-bold leading-none">{stat.value}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Projects Section */}
            <div className="bg-white p-6 lg:p-10 space-y-10 min-h-[600px]">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                    <h2 className="text-brand-navy text-[20px] lg:text-[24px] font-bold">Projects</h2>

                    {/* Filters */}
                    <div className="flex items-center gap-3 overflow-x-auto pb-4 lg:pb-0 scrollbar-hide">
                        {["All", "Approved", "In Review", "Production", "Shipped"].map((t) => (
                            <button
                                key={t}
                                onClick={() => setFilter(t as any)}
                                className={cn(
                                    "px-6 lg:px-8 py-3 rounded-full text-[12px] lg:text-[14px] font-bold whitespace-nowrap transition-all border",
                                    filter === t
                                        ? "bg-brand-blue/5 border-brand-blue text-brand-blue"
                                        : "bg-transparent border-brand-stroke-ii text-brand-body hover:border-brand-blue/30"
                                )}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
                    <AnimatePresence mode="popLayout">
                        {filteredProjects.map((project) => (
                            <ProjectCard
                                key={project.id}
                                project={project}
                                onViewDetails={onViewDetails}
                            />
                        ))}
                    </AnimatePresence>
                </div>

                {filteredProjects.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                        <div className="w-16 h-16 bg-brand-bg rounded-full flex items-center justify-center text-brand-mute">
                            <Search className="w-8 h-8" />
                        </div>
                        <p className="text-brand-navy font-bold text-[18px]">No projects found</p>
                        <p className="text-brand-mute text-[14px]">Try adjusting your filter or create a new project</p>
                    </div>
                )}
            </div>
        </div>
    );
};
