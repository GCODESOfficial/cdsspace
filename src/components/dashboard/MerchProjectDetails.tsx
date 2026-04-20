"use client";

import React from "react";
import { motion } from "framer-motion";
import {
    ArrowLeft,
    Edit2,
    MessageSquare,
    Truck,
    Download,
    CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// --- Types ---

import { ProjectStatus } from "./MerchDashboard";

interface MerchProject {
    id: string;
    projectId: string;
    name: string;
    status: ProjectStatus;
    productType: string;
    quantity: number;
    estimatedCost: number;
    expectedDelivery: string;
    client?: string;
    createdDate?: string;
    lastUpdated?: string;
}

interface MerchProjectDetailsProps {
    project: MerchProject;
    onBack: () => void;
}

// --- Components ---

const StatusBadgeBig = ({ status }: { status: ProjectStatus }) => {
    const isReview = status === "In Review";
    const isProduction = status === "Production";
    const isApproved = status === "Approved";
    const isShipped = status === "Shipped";

    return (
        <div className={cn(
            "px-6 py-3 rounded-[16px] flex items-center justify-center",
            isReview ? "bg-[#DC660C]/10" :
                isProduction ? "bg-[#4A00FF]/10" :
                    isApproved ? "bg-[#009C22]/10" :
                        "bg-brand-blue/10"
        )}>
            <span className={cn(
                "text-[20px] font-medium font-inter",
                isReview ? "text-[#DC660C]" :
                    isProduction ? "text-[#4A00FF]" :
                        isApproved ? "text-[#009C22]" :
                            "text-brand-blue"
            )}>
                {status}
            </span>
        </div>
    );
};

const TimelineStepV2 = ({
    title,
    date,
    status,
    isLast
}: {
    title: string;
    date: string;
    status: "completed" | "current" | "pending";
    isLast?: boolean;
}) => {
    return (
        <div className="flex gap-[16px] items-start relative py-[24px]">
            {!isLast && (
                <div className={cn(
                    "absolute left-[15.5px] top-[42px] w-px h-[calc(80%-16px)]",
                    status === "completed" ? "bg-brand-blue" : "bg-brand-stroke-ii border-l border-dashed"
                )} />
            )}

            <div className="relative z-10 shrink-0 mt-1">
                {status === "completed" ? (
                    <div className="size-[32px] bg-brand-blue/10 border border-brand-blue rounded-full flex items-center justify-center">
                        <CheckCircle2 className="size-[20px] text-brand-blue" />
                    </div>
                ) : status === "current" ? (
                    <div className="size-[32px] bg-brand-blue/10 border border-brand-blue rounded-full flex items-center justify-center">
                        <div className="size-[10px] bg-brand-blue rounded-full" />
                    </div>
                ) : (
                    <div className="size-[32px] bg-white border border-brand-stroke-ii rounded-full flex items-center justify-center">
                        <div className="size-[10px] bg-brand-mute rounded-full" />
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-[4px] flex-1">
                <div className="flex items-center justify-between gap-4">
                    <p className={cn(
                        "text-[14px] lg:text-[16px] font-semibold font-inter",
                        status === "pending" ? "text-brand-mute" : "text-brand-body"
                    )}>
                        {title}
                    </p>
                    {status === "current" && (
                        <div className="bg-brand-blue/10 border border-brand-blue rounded-full px-2 py-1">
                            <span className="text-brand-blue text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Current stage</span>
                        </div>
                    )}
                </div>
                <p className="text-[12px] font-medium text-brand-mute font-inter">{date}</p>
            </div>
        </div>
    );
};

export const MerchProjectDetails = ({ project, onBack }: MerchProjectDetailsProps) => {
    // Default values for missing project details
    const details = {
        client: project.client || "FinanceHub Ltd",
        createdDate: project.createdDate || "January 28, 2026",
        lastUpdated: project.lastUpdated || "February 1, 2026",
    };

    const timeline = [
        { title: "Draft Created", date: "January 15, 2026", status: "completed" as const },
        { title: "Submitted for Review", date: "January 18, 2026", status: "current" as const },
        { title: "Design Approved", date: "January 22, 2026", status: "pending" as const },
        { title: "In Production", date: "January 28, 2026", status: "pending" as const },
        { title: "Shipped to Client", date: "Pending", status: "pending" as const },
    ];

    return (
        <div className="w-full max-w-[1440px] mx-auto space-y-10 pb-20 px-4 xl:px-8 pt-10">
            {/* Action Bar */}
            <div className="flex items-center justify-between">
                <button
                    onClick={onBack}
                    className="size-10 lg:size-11 rounded-full border border-brand-stroke flex items-center justify-center text-brand-navy hover:bg-brand-bg transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <button className="h-11 px-8 bg-brand-blue rounded-full text-white flex items-center justify-center gap-3 font-medium hover:bg-brand-blue/90 transition-all text-[16px]">
                    <Edit2 className="w-4 h-4" />
                    Edit Project
                </button>
            </div>

            {/* Top Overview Card */}
            <div className="bg-brand-bg p-8 rounded-[24px] flex flex-col gap-14 border border-brand-stroke">
                <div className="flex items-center justify-between w-full">
                    <div className="flex flex-col gap-2">
                        <h1 className="text-brand-navy text-[24px] font-semibold font-inter">{project.name}</h1>
                        <p className="text-brand-mute text-[14px] font-medium">Project ID: {project.projectId}</p>
                    </div>
                    <StatusBadgeBig status={project.status} />
                </div>

                <div className="flex items-center justify-between w-full">
                    <div className="flex flex-col gap-1">
                        <p className="text-brand-mute text-[14px] font-medium font-inter">Client</p>
                        <p className="text-brand-body text-[16px] font-semibold font-inter">{details.client}</p>
                    </div>
                    <div className="flex flex-col gap-1">
                        <p className="text-brand-mute text-[14px] font-medium font-inter">Product Type</p>
                        <p className="text-brand-body text-[16px] font-semibold font-inter">{project.productType}</p>
                    </div>
                    <div className="flex flex-col gap-1">
                        <p className="text-brand-mute text-[14px] font-medium font-inter">Quantity</p>
                        <p className="text-brand-body text-[16px] font-semibold font-inter">{project.quantity} units</p>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                        <p className="text-brand-mute text-[14px] font-medium font-inter">Estimated Cost</p>
                        <p className="text-brand-body text-[16px] font-semibold font-inter text-right">₦{project.estimatedCost.toLocaleString()}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Left Column - Timeline */}
                <div className="lg:col-span-8">
                    <div className="bg-brand-bg p-8 rounded-[24px] border border-brand-stroke space-y-12">
                        <div className="flex flex-col gap-2">
                            <h2 className="text-brand-navy text-[20px] font-semibold font-inter">Project Timeline</h2>
                            <p className="text-brand-mute text-[14px] font-medium font-inter">Track progress from draft to delivery</p>
                        </div>
                        <div className="flex flex-col">
                            {timeline.map((step, idx) => (
                                <TimelineStepV2
                                    key={idx}
                                    title={step.title}
                                    date={step.date}
                                    status={step.status}
                                    isLast={idx === timeline.length - 1}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Column - Sidebar */}
                <div className="lg:col-span-4 flex flex-col gap-8">
                    {/* Project Dates Card */}
                    <div className="bg-brand-bg p-8 rounded-[24px] border border-brand-stroke flex flex-col gap-8">
                        <h2 className="text-brand-body text-[18px] font-semibold font-inter">Project Dates</h2>
                        <div className="flex flex-col gap-6">
                            <div className="flex flex-col gap-1">
                                <p className="text-brand-mute text-[14px] font-medium font-inter">Created</p>
                                <p className="text-brand-body text-[16px] font-medium font-inter">{details.createdDate}</p>
                            </div>
                            <div className="flex flex-col gap-1">
                                <p className="text-brand-mute text-[14px] font-medium font-inter">Last Updated</p>
                                <p className="text-brand-body text-[16px] font-medium font-inter">{details.lastUpdated}</p>
                            </div>
                        </div>
                    </div>

                    {/* Quick Actions Card */}
                    <div className="bg-brand-bg p-8 rounded-[24px] border border-brand-stroke space-y-8">
                        <h2 className="text-brand-body text-[18px] font-semibold font-inter">Quick Actions</h2>
                        <div className="flex flex-col gap-4">
                            <button className="h-[48px] px-6 rounded-full bg-brand-blue/5 border-[0.5px] border-brand-blue flex items-center justify-center gap-4 text-brand-blue font-medium text-[16px] w-full hover:bg-brand-blue/10 transition-all">
                                <MessageSquare className="w-5 h-5" />
                                Add Comment
                            </button>
                            <button className="h-[48px] px-8 rounded-full bg-brand-blue/5 border-[0.5px] border-brand-blue flex items-center justify-center gap-4 text-brand-blue font-medium text-[16px] w-full hover:bg-brand-blue/10 transition-all">
                                <Truck className="w-5 h-5" />
                                Update Delivery
                            </button>
                            <button className="h-[48px] px-6 rounded-full bg-brand-blue/5 border-[0.5px] border-brand-blue flex items-center justify-center gap-4 text-brand-blue font-medium text-[16px] w-full hover:bg-brand-blue/10 transition-all">
                                <Download className="w-5 h-5" />
                                Download Invoice
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
