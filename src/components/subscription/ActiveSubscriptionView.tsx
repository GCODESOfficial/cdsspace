"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
    Search,
    Plus,
    Hourglass,
    Clock,
    ToggleLeft as ToggleRight,
    CheckCircle2,
    DownloadCloud,
    ArrowUpRight,
    MessageSquare,
    Crown,
    BadgeCheck,
    Trash2
} from "lucide-react";
import { RequestDetailView } from "./RequestDetailView";
import { CreateRequestView } from "./CreateRequestView";
import { FeedbackView } from "./FeedbackView";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";

interface RequestCardProps {
    title: string;
    description: string;
    id: string;
    user: string;
    date: string;
    status: "COMPLETED" | "IN_REVIEW" | "ACTIVE" | "PENDING";
    onClick?: () => void;
    onDelete?: (e: React.MouseEvent) => void;
}

const RequestCard = ({ title, description, id, display_id, user, date, status, onClick, onDelete }: RequestCardProps & { display_id?: string }) => {
    const statusLabelMap = {
        "COMPLETED": "Completed",
        "IN_REVIEW": "In Review",
        "ACTIVE": "Active",
        "PENDING": "Pending",
    };

    const statusStyles = {
        "COMPLETED": "bg-[#E6F6EB] text-[#009C22] border-[#009C22]/20",
        "IN_REVIEW": "bg-[#F0EBFF] text-[#4A00FF] border-[#4A00FF]/20",
        "ACTIVE": "bg-[#EBF1FF] text-[#1C4ED1] border-[#1C4ED1]/20",
        "PENDING": "bg-[#FFF4EB] text-[#F47A00] border-[#F47A00]/20",
    };

    const displayStatus = statusLabelMap[status] || status;

    return (
        <div
            onClick={onClick}
            className="border border-brand-stroke rounded-[16px] xl:rounded-[20px] 2xl:rounded-[24px] p-[16px] xl:p-[20px] 2xl:p-[24px] flex flex-col gap-[16px] xl:gap-[20px] 2xl:gap-[24px] hover:border-brand-blue/30 transition-all group cursor-pointer"
        >
            <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-[4px] 2xl:gap-[8px]">
                    <h4 className="text-brand-navy text-[16px] 2xl:text-[18px] font-semibold leading-tight">{title}</h4>
                    <p className="text-brand-body text-[11px] 2xl:text-[12px] font-medium opacity-80">{description}</p>
                </div>
                <div className={cn(
                    "px-[10px] py-[4px] 2xl:px-[12px] 2xl:py-[6px] rounded-[6px] 2xl:rounded-[8px] text-[9px] 2xl:text-[10px] font-bold shrink-0 uppercase tracking-wider border",
                    statusStyles[status]
                )}>
                    {displayStatus}
                </div>
            </div>

            <div className="flex items-center gap-[24px] 2xl:gap-[40px]">
                <div className="flex items-center gap-[4px] 2xl:gap-[6px]">
                    <span className="text-brand-body text-[10px] 2xl:text-[12px] font-bold list-item list-disc ml-4 opacity-70 italic">{display_id || id.slice(0, 8)}</span>
                </div>
                <div className="flex items-center gap-[6px] 2xl:gap-[8px]">
                    <Image src="/dashboard/subscription/user.svg" alt="User" width={12} height={12} className="2xl:w-[14px] 2xl:h-[14px] opacity-60" />
                    <span className="text-brand-body text-[9px] 2xl:text-[10px] font-medium">{user}</span>
                </div>
                <div className="flex items-center gap-[6px] 2xl:gap-[8px]">
                    <Image src="/dashboard/subscription/calendar-02.svg" alt="Date" width={12} height={12} className="2xl:w-[14px] 2xl:h-[14px] opacity-60" />
                    <span className="text-brand-body text-[9px] 2xl:text-[10px] font-medium">Created {date}</span>
                </div>
            </div>

            <div className="flex items-center gap-[12px] 2xl:gap-[16px] mt-1 2xl:mt-2">
                {status === "COMPLETED" ? (
                    <button className="bg-[#0A4FE8] px-[16px] py-[8px] 2xl:px-[20px] 2xl:py-[10px] rounded-full flex items-center gap-[8px] text-white text-[12px] 2xl:text-[14px] font-bold cursor-pointer hover:brightness-110 transition-all shadow-sm">
                        <DownloadCloud className="w-[16px] h-[16px] 2xl:w-[18px] 2xl:h-[18px]" />
                        Download Files
                    </button>
                ) : (status === "IN_REVIEW" || status === "PENDING") ? (
                    <button className="bg-[#0A4FE8] px-[16px] py-[8px] 2xl:px-[20px] 2xl:py-[10px] rounded-full flex items-center gap-[8px] text-white text-[12px] 2xl:text-[14px] font-bold cursor-pointer hover:brightness-110 transition-all shadow-sm">
                        <MessageSquare className="w-[16px] h-[16px] 2xl:w-[18px] 2xl:h-[18px]" />
                        Give Feedback
                    </button>
                ) : null}

                <button className="bg-[#EBF1FF] px-[16px] py-[8px] 2xl:px-[20px] 2xl:py-[10px] rounded-full flex items-center gap-[8px] text-brand-blue text-[12px] 2xl:text-[14px] font-bold cursor-pointer hover:bg-[#D8E5FF] transition-all">
                    <ArrowUpRight className="w-[16px] h-[16px] 2xl:w-[18px] 2xl:h-[18px]" />
                    View Details
                </button>

                {(status === "PENDING" || status === "IN_REVIEW") && (
                    <button 
                        onClick={onDelete}
                        className="ml-auto p-2 text-brand-mute hover:text-red-500 hover:bg-red-50 rounded-full transition-all cursor-pointer group"
                        title="Delete Request"
                    >
                        <Trash2 className="w-[14px] h-[14px] 2xl:w-[16px] 2xl:h-[16px]" />
                    </button>
                )}
            </div>
        </div>
    );
}

interface ActiveSubscriptionViewProps {
    plan?: string;
    industry?: string;
    designCount?: number;
    designLimit?: number;
    companyName?: string;
    onUpdateDesignCount?: (count: number) => void;
    onUpgrade?: () => void;
    onFileUpload?: (file: File, index: number, customSetter?: (updater: (prev: any[]) => any[]) => void) => Promise<void>;
    onFileRemoved?: (file: any, index: number) => Promise<void>;
    onCancelUpload?: (index: number) => void;
}

const CircularProgress = ({ value, max }: { value: number, max: number }) => {
    const percentage = Math.min((value / max) * 100, 100);
    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;
    const isFull = value >= max;

    return (
        <div className="relative w-[140px] h-[140px] 2xl:w-[180px] 2xl:h-[180px] flex items-center justify-center mx-auto">
            <svg className="w-full h-full transform -rotate-90">
                <circle
                    cx="50%" cy="50%" r={radius}
                    stroke="#E6EBF5"
                    strokeWidth="12"
                    fill="transparent"
                />
                <circle
                    cx="50%" cy="50%" r={radius}
                    stroke={isFull ? "#F47A00" : "#1C4ED1"}
                    strokeWidth="12"
                    strokeDasharray={circumference}
                    strokeLinecap="round"
                    fill="transparent"
                    className="transition-all duration-1000 ease-out"
                    style={{ strokeDashoffset: offset }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={cn(
                    "text-[28px] 2xl:text-[36px] font-bold leading-none",
                    isFull ? "text-[#F47A00]" : "text-brand-navy"
                )}>{value}</span>
                <span className="text-brand-mute text-[12px] 2xl:text-[14px] font-bold mt-1 uppercase tracking-tight">Used</span>
            </div>
        </div>
    );
};

const DashboardSkeleton = () => (
    <div className="max-w-[1770px] mx-auto p-[16px] xl:p-[24px] 2xl:p-[40px] flex flex-col gap-[16px] xl:gap-[24px] 2xl:gap-[32px] animate-pulse">
        {/* Header Skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-col gap-2">
                <div className="h-8 w-48 bg-brand-bg rounded-lg" />
                <div className="h-4 w-64 bg-brand-bg/50 rounded-md" />
            </div>
            <div className="h-12 w-48 bg-brand-bg rounded-full" />
        </div>

        {/* Stats Skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-[8px] xl:gap-[16px] 2xl:gap-[24px]">
            {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white border border-brand-stroke rounded-[24px] p-6 h-[140px] flex flex-col justify-between">
                    <div className="flex justify-between items-center">
                        <div className="h-4 w-20 bg-brand-bg rounded" />
                        <div className="h-10 w-10 bg-brand-bg rounded-xl" />
                    </div>
                    <div className="h-8 w-12 bg-brand-bg rounded" />
                </div>
            ))}
        </div>

        {/* Content Skeleton */}
        <div className="flex flex-col lg:flex-row gap-[16px] xl:gap-[20px] 2xl:gap-[24px] w-full items-start">
            <div className="w-full lg:flex-1 bg-white rounded-[24px] border border-brand-stroke p-8 flex flex-col gap-8">
                <div className="flex justify-between items-center gap-4">
                    <div className="h-12 w-full max-w-[300px] bg-brand-bg rounded-full" />
                    <div className="flex gap-2">
                        {[1, 2, 3].map(i => <div key={i} className="h-10 w-20 bg-brand-bg rounded-full" />)}
                    </div>
                </div>
                <div className="flex flex-col gap-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-[120px] w-full bg-brand-bg/20 rounded-[20px] border border-brand-stroke/30" />
                    ))}
                </div>
            </div>

            {/* Sidebar Skeleton */}
            <div className="w-full lg:w-[30%] 2xl:w-[434px] min-h-[400px] bg-white rounded-[24px] border border-brand-stroke p-8 flex flex-col gap-8">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-12 bg-brand-bg rounded-xl" />
                    <div className="flex flex-col gap-2">
                        <div className="h-3 w-20 bg-brand-bg rounded" />
                        <div className="h-5 w-32 bg-brand-bg rounded" />
                    </div>
                </div>
                <div className="flex flex-col gap-4">
                    <div className="flex justify-between">
                        <div className="h-4 w-24 bg-brand-bg rounded" />
                        <div className="h-4 w-12 bg-brand-bg rounded" />
                    </div>
                    <div className="h-3 w-full bg-brand-bg rounded-full" />
                </div>
                <div className="mt-auto h-14 w-full bg-brand-bg rounded-full" />
            </div>
        </div>
    </div>
);

export const ActiveSubscriptionView = ({
    plan = "Scaleup",
    industry = "Web3",
    designCount: initialDesignCount = 4,
    designLimit,
    companyName = "CDS Space",
    onUpdateDesignCount,
    onUpgrade,
    onFileUpload,
    onFileRemoved,
    onCancelUpload
}: ActiveSubscriptionViewProps) => {
    const [view, setView] = useState<"list" | "details" | "create" | "feedback">("list");
    const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
    const [activeTab, setActiveTab] = useState("All");
    const [searchQuery, setSearchQuery] = useState("");
    const [feedbackMode, setFeedbackMode] = useState<"revision" | "approve">("revision");
    const [requests, setRequests] = useState<any[]>([]);
    const [newRequestFiles, setNewRequestFiles] = useState<any[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [designCount, setDesignCount] = useState(initialDesignCount);
    const fixedPlanLimit = plan.toLowerCase() === "startup" ? 5 : plan.toLowerCase() === "scaleup" ? 10 : null;
    const [quotaLimit, setQuotaLimit] = useState(
        fixedPlanLimit || (Number.isInteger(designLimit) && Number(designLimit) > 0 ? Number(designLimit) : 1)
    );
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchRequests = async () => {
            try {
                const res = await fetch("/api/requests");
                const data = await res.json();
                if (data.requests) {
                    setRequests(data.requests.map((r: any) => ({
                        ...r,
                        user: "You",
                        date: new Date(r.created_at).toLocaleDateString(),
                        clientName: "You",
                        previewImage: r.preview_image || "/dashboard/subscription/folder-02.svg",
                        versions: r.versions || [],
                        comments: r.comments || []
                    })));
                }
                if (data.quota) {
                    setDesignCount(Number(data.quota.used || 0));
                    setQuotaLimit(Number(data.quota.limit || 1));
                    onUpdateDesignCount?.(Number(data.quota.used || 0));
                }
            } catch (error) {
                console.error("Failed to fetch requests:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchRequests();
    }, []);

    // Filtering Logic
    const filteredRequests = requests.filter(req => {
        const tabToStatus: Record<string, string> = {
            "Pending": "PENDING",
            "In Review": "IN_REVIEW",
            "Active": "ACTIVE",
            "Completed": "COMPLETED",
        };
        const statusToMatch = tabToStatus[activeTab];
        const matchesTab = activeTab === "All" || req.status === statusToMatch;
        const matchesSearch = String(req.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                             String(req.description || "").toLowerCase().includes(searchQuery.toLowerCase());
        return matchesTab && matchesSearch;
    });

    const currentRequests = filteredRequests;

    const handleRequestClick = (req: any) => {
        setSelectedRequest(req);
        setView("details");
    };

    const handleCreateSubmit = async (newReq: any) => {
        setIsSubmitting(true);
        try {
            // Collect uploaded asset storage paths
            const assetPaths = newRequestFiles
                .filter((f: any) => f.storagePath)
                .map((f: any) => f.storagePath);

            const res = await fetch("/api/requests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: newReq.title,
                    description: newReq.description,
                    category: newReq.category,
                    asset_paths: assetPaths.length > 0 ? assetPaths : null,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                await appAlert(data.error || "Could not submit this design request.");
                return;
            }
            if (data.request) {
                setRequests(prev => [{
                    ...data.request,
                    user: "You",
                    date: new Date(data.request.created_at).toLocaleDateString(),
                    clientName: "You",
                    previewImage: "/dashboard/subscription/folder-02.svg",
                    versions: [],
                    comments: []
                }, ...prev]);
                
                const newCount = Number(data.usage?.used ?? designCount + 1);
                setDesignCount(newCount);
                if (data.usage?.limit) setQuotaLimit(Number(data.usage.limit));
                onUpdateDesignCount?.(newCount);
                setNewRequestFiles([]); // Reset files after success
                setView("list");
            }
        } catch (error) {
            console.error("Failed to create request:", error);
            await appAlert("The design request could not be submitted. Please check your connection and try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleOpenFeedback = (mode: "revision" | "approve") => {
        setFeedbackMode(mode);
        setView("feedback");
    };

    const handleDeleteRequest = async (e: React.MouseEvent, reqId: string, status: string) => {
        e.stopPropagation();
        if (!(await appConfirm("Are you sure you want to delete this design request?"))) return;

        try {
            const res = await fetch(`/api/requests?id=${reqId}`, {
                method: "DELETE",
            });
            const data = await res.json();
            if (!res.ok) {
                await appAlert(data.error || "Could not delete this design request.");
                return;
            }
            if (data.success) {
                setRequests(prev => prev.filter(r => r.id !== reqId));
                
                // If it was Pending or In Review, it counts back to the quota
                if (status === "PENDING" || status === "IN_REVIEW") {
                    const newCount = Math.max(0, designCount - 1);
                    setDesignCount(newCount);
                    onUpdateDesignCount?.(newCount);
                }
            }
        } catch (error) {
            console.error("Failed to delete request:", error);
        }
    };

    const planLimits = {
        startup: { limit: 5, name: "Startup" },
        scaleup: { limit: 10, name: "Scaleup" },
        supreme: { limit: quotaLimit, name: "Supreme" },
    };

    const currentPlanKey = plan.toLowerCase() as keyof typeof planLimits;
    const currentPlan = planLimits[currentPlanKey] || planLimits.scaleup;
    const currentLimit = quotaLimit || currentPlan.limit;
    const progressPercentage = Math.min((designCount / currentLimit) * 100, 100);
    const isQuotaFull = designCount >= currentLimit;

    const stats = [
        { label: "Pending", count: requests.filter(r => r.status === "PENDING").length, icon: <Hourglass className="w-[20px] h-[20px] xl:w-[24px] xl:h-[24px] 2xl:w-[32px] 2xl:h-[32px] text-[#F47A00]" />, bg: "bg-[#F47A00]/10" },
        { label: "In Review", count: requests.filter(r => r.status === "IN_REVIEW").length, icon: <Clock className="w-[20px] h-[20px] xl:w-[24px] xl:h-[24px] 2xl:w-[32px] 2xl:h-[32px] text-[#4A00FF]" />, bg: "bg-[#4A00FF]/10" },
        { label: "Active", count: requests.filter(r => r.status === "ACTIVE").length, icon: <Plus className="w-[20px] h-[20px] xl:w-[24px] xl:h-[24px] 2xl:w-[32px] 2xl:h-[32px] text-brand-blue" />, bg: "bg-[#1C4ED1]/10" },
        { label: "Completed", count: requests.filter(r => r.status === "COMPLETED").length, icon: <CheckCircle2 className="w-[20px] h-[20px] xl:w-[24px] xl:h-[24px] 2xl:w-[32px] 2xl:h-[32px] text-[#009C22]" />, bg: "bg-[#009C22]/10" },
    ];


    return (
        <div className="w-full h-full bg-brand-bg/30 relative overflow-hidden">
            <div className="w-full h-full overflow-y-auto premium-scrollbar">
                {isLoading ? <DashboardSkeleton /> :
                <div className="max-w-[1770px] mx-auto p-[16px] xl:p-[24px] 2xl:p-[40px] flex flex-col gap-[16px] xl:gap-[24px] 2xl:gap-[32px]">
                    {/* Header Section */}
                    {/* ... (rest of the list header) */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex flex-col gap-[2px] 2xl:gap-[8px]">
                            <h1 className="text-brand-navy text-[20px] xl:text-[24px] 2xl:text-[28px] font-bold tracking-tight">Subscriptions</h1>
                            <p className="text-brand-body text-[12px] xl:text-[13px] 2xl:text-[14px] font-medium opacity-60">Manage and track subscriptions for {companyName}</p>
                        </div>
                        <button
                            onClick={() => !isQuotaFull && setView("create")}
                            disabled={isQuotaFull}
                            className={cn(
                                "px-[16px] xl:px-[20px] 2xl:px-[24px] py-[8px] xl:py-[10px] 2xl:py-[12px] rounded-full flex items-center justify-center gap-[6px] 2xl:gap-[8px] text-white text-[14px] xl:text-[16px] 2xl:text-[18px] font-medium shadow-md transition-all whitespace-nowrap",
                                isQuotaFull 
                                    ? "bg-brand-mute cursor-not-allowed opacity-70" 
                                    : "bg-[#0A4FE8] hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                            )}
                        >
                            <Plus className="w-[16px] h-[16px] xl:w-[20px] xl:h-[20px] 2xl:w-[24px] 2xl:h-[24px]" />
                            {isQuotaFull ? "Quota reached" : "New design request"}
                        </button>
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-[8px] xl:gap-[16px] 2xl:gap-[24px]">
                        {stats.map((stat) => (
                            <div key={stat.label} className="bg-white border border-brand-stroke rounded-[12px] xl:rounded-[16px] p-[16px] xl:p-[20px] 2xl:p-[24px] flex flex-col gap-[12px] xl:gap-[16px] 2xl:gap-[24px] hover:border-brand-blue/20 transition-colors">
                                <div className="flex items-center justify-between">
                                    <span className="text-brand-body text-[12px] xl:text-[14px] 2xl:text-[18px] font-medium">{stat.label}</span>
                                    <div className={cn("p-[4px] xl:p-[6px] 2xl:p-[8px] rounded-[6px] xl:rounded-[8px] 2xl:rounded-[12px]", stat.bg)}>
                                        {stat.icon}
                                    </div>
                                </div>
                                <span className="text-brand-navy text-[20px] xl:text-[28px] 2xl:text-[32px] font-bold">{stat.count}</span>
                            </div>
                        ))}
                    </div>

                    {/* Main Content Area */}
                    <div className="flex flex-col lg:flex-row gap-[16px] xl:gap-[20px] 2xl:gap-[24px] w-full items-start">
                        <div className="w-full lg:flex-1 bg-white rounded-[16px] xl:rounded-[20px] 2xl:rounded-[24px] border border-brand-stroke p-[16px] xl:p-[24px] 2xl:p-[32px] flex flex-col gap-[16px] xl:gap-[24px] 2xl:gap-[32px] shadow-sm overflow-hidden">
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                <div className="bg-brand-bg px-[16px] xl:px-[20px] 2xl:px-[24px] py-[8px] xl:py-[10px] 2xl:py-[12px] rounded-full flex items-center gap-[8px] 2xl:gap-[12px] w-full lg:max-w-[40%] 2xl:max-w-[372px] border border-brand-stroke/50 focus-within:border-brand-blue/30 transition-colors">
                                    <Search className="text-brand-mute w-[16px] h-[16px] xl:w-[18px] xl:h-[18px] 2xl:w-[20px] 2xl:h-[20px] shrink-0" />
                                    <input
                                        type="text"
                                        placeholder="Search design requests..."
                                        className="bg-transparent border-none outline-none text-brand-body text-[12px] xl:text-[13px] 2xl:text-[15px] w-full min-w-0"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                                <div className="flex items-center gap-[4px] xl:gap-[6px] 2xl:gap-[8px] overflow-x-auto pb-1 scrollbar-hide shrink-0">
                                    {["All", "Pending", "In Review", "Active", "Completed"].map((tab) => (
                                        <button
                                            key={tab}
                                            onClick={() => setActiveTab(tab)}
                                            className={cn(
                                                "px-[12px] xl:px-[14px] 2xl:px-[16px] py-[6px] xl:py-[7px] 2xl:py-[8px] rounded-full text-[10px] xl:text-[11px] 2xl:text-[12px] font-medium transition-all cursor-pointer whitespace-nowrap border",
                                                activeTab === tab
                                                    ? "bg-brand-blue/10 border-brand-blue text-brand-blue"
                                                    : "border-brand-stroke text-brand-body hover:bg-brand-bg"
                                            )}
                                        >
                                            {tab}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex flex-col gap-[16px]">
                                {isLoading ? (
                                    <DashboardSkeleton />
                                ) : filteredRequests.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-[60px] xl:py-[80px] 2xl:py-[100px] gap-4">
                                        <div 
                                            className="w-[64px] h-[64px] xl:w-[80px] xl:h-[80px] 2xl:w-[100px] 2xl:h-[100px] bg-brand-blue"
                                            style={{
                                                maskImage: "url('/dashboard/subscription/folder-02.svg')",
                                                WebkitMaskImage: "url('/dashboard/subscription/folder-02.svg')",
                                                maskRepeat: "no-repeat",
                                                WebkitMaskRepeat: "no-repeat",
                                                maskPosition: "center",
                                                WebkitMaskPosition: "center",
                                                maskSize: "contain",
                                                WebkitMaskSize: "contain"
                                            }}
                                        />
                                        <div className="flex flex-col items-center gap-1">
                                            <p className="text-brand-navy text-[16px] xl:text-[18px] 2xl:text-[20px] font-bold">No design requests</p>
                                            <p className="text-brand-mute text-[12px] xl:text-[14px] 2xl:text-[16px] font-medium opacity-60">Try creating a new request</p>
                                        </div>
                                    </div>
                                ) : (
                                    filteredRequests.map((req) => (
                                        <RequestCard
                                            key={req.id}
                                            {...req}
                                            onClick={() => handleRequestClick(req)}
                                            onDelete={(e) => handleDeleteRequest(e, req.id, req.status)}
                                        />
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Sidebar */}
                        <div className="w-full lg:w-[30%] 2xl:w-[434px] lg:max-w-[400px] 2xl:max-w-none shrink-0 bg-white rounded-[16px] xl:rounded-[20px] 2xl:rounded-[24px] border border-brand-stroke p-[20px] xl:p-[28px] 2xl:p-[40px] flex flex-col gap-[20px] xl:gap-[32px] 2xl:gap-[48px] shadow-sm self-start">
                            <div className="flex flex-col gap-[16px] xl:gap-[24px] 2xl:gap-[32px]">
                                <div className="flex items-center gap-[12px] 2xl:gap-[16px]">
                                    <div className="w-[36px] h-[36px] xl:w-[40px] xl:h-[40px] 2xl:w-[48px] 2xl:h-[48px] bg-brand-blue rounded-[10px] 2xl:rounded-[12px] flex items-center justify-center text-white shadow-[0_8px_16px_rgba(28,78,209,0.2)]">
                                        <BadgeCheck className="w-[16px] h-[16px] xl:w-[20px] xl:h-[20px] 2xl:w-[24px] 2xl:h-[24px]" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-brand-mute text-[10px] xl:text-[12px] 2xl:text-[14px] font-medium">Current plan</span>
                                        <span className="text-brand-body text-[16px] xl:text-[18px] 2xl:text-[22px] font-bold">{currentPlan.name}</span>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-[10px] xl:gap-[14px] 2xl:gap-[18px]">
                                    <div className="flex items-center justify-between text-[12px] xl:text-[14px] 2xl:text-[16px]">
                                        <span className="text-brand-mute font-medium">Design usage</span>
                                        <span className="text-brand-body font-bold">{designCount} / {currentLimit}</span>
                                    </div>
                                    <div className="flex flex-col gap-[8px] xl:gap-[12px] 2xl:gap-[16px]">
                                        <div className="h-[8px] xl:h-[12px] 2xl:h-[16px] bg-brand-bg rounded-full overflow-hidden relative border border-brand-stroke/20">
                                            <div
                                                className={cn(
                                                    "absolute inset-y-0 left-0 rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(28,78,209,0.4)]",
                                                    isQuotaFull ? "bg-[#F47A00] shadow-[#F47A00]/40" : "bg-brand-blue"
                                                )}
                                                style={{ width: `${progressPercentage}%` }}
                                            />
                                        </div>
                                        <p className="text-brand-mute text-[12px] xl:text-[14px] 2xl:text-[16px] font-medium leading-relaxed">
                                            {currentLimit - designCount} designs remaining this month
                                        </p>
                                    </div>
                                </div>

                                {/* Circular Progress Indicator */}
                                <div className="py-4">
                                    <CircularProgress value={designCount} max={currentLimit} />
                                </div>
                            </div>
                            <div className="flex flex-col gap-[16px] xl:gap-[20px] 2xl:gap-[28px]">
                                <div className="flex items-center justify-between group">
                                    <span className="text-brand-mute text-[12px] xl:text-[13px] 2xl:text-[15px] font-medium">Industry</span>
                                    <span className="text-brand-body text-[13px] xl:text-[15px] 2xl:text-[17px] font-bold">{industry}</span>
                                </div>
                                <div className="flex items-center justify-between group">
                                    <span className="text-brand-mute text-[12px] xl:text-[13px] 2xl:text-[15px] font-medium">Billing cycle</span>
                                    <span className="text-brand-body text-[13px] xl:text-[15px] 2xl:text-[17px] font-bold">Monthly</span>
                                </div>
                                <div className="flex items-center justify-between group">
                                    <span className="text-brand-mute text-[12px] xl:text-[13px] 2xl:text-[15px] font-medium">Next billing</span>
                                    <span className="text-brand-body text-[13px] xl:text-[15px] 2xl:text-[17px] font-bold">2026-03-06</span>
                                </div>
                            </div>
                            {plan.toLowerCase() !== "supreme" ? (
                                <button 
                                    onClick={onUpgrade}
                                    className="w-full border border-orange-200 bg-white text-[#F47A00] h-[40px] xl:h-[48px] 2xl:h-[56px] rounded-[12px] 2xl:rounded-full flex items-center justify-center gap-[8px] 2xl:gap-[10px] font-bold text-[14px] xl:text-[16px] 2xl:text-[18px] hover:bg-orange-50 hover:border-orange-300 transition-all cursor-pointer shadow-sm active:scale-95 group"
                                >
                                    <Crown className="text-[#F47A00] transition-transform group-hover:rotate-12 w-[16px] h-[16px] xl:w-[18px] xl:h-[18px] 2xl:w-[20px] 2xl:h-[20px]" />
                                    Upgrade to Supreme
                                </button>
                            ) : (
                                <div className="w-full bg-[#FFF4EB] border border-orange-200 text-[#F47A00] h-[40px] xl:h-[48px] 2xl:h-[56px] rounded-[12px] 2xl:rounded-full flex items-center justify-center gap-[8px] 2xl:gap-[10px] font-bold text-[14px] xl:text-[16px] 2xl:text-[18px]">
                                    <Crown className="text-[#F47A00] w-[16px] h-[16px] xl:w-[18px] xl:h-[18px] 2xl:w-[20px] 2xl:h-[20px]" />
                                    Supreme Member
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            }
        </div>

            {/* FULL PAGE OVERLAYS */}
            <AnimatePresence>
                {view === "create" && (
                    <motion.div
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="fixed inset-0 z-[60] bg-[#f4f6fb]"
                    >
                        <CreateRequestView
                            onBack={() => setView("list")}
                            onSubmit={handleCreateSubmit}
                            isSubmitting={isSubmitting}
                            uploadedFiles={newRequestFiles}
                            onUpdateFiles={setNewRequestFiles}
                            onFileUpload={(file, idx) => onFileUpload ? onFileUpload(file, idx, setNewRequestFiles) : Promise.resolve()}
                            onFileRemoved={onFileRemoved}
                            onCancelUpload={onCancelUpload}
                        />
                    </motion.div>
                )}

                {(view === "details" && selectedRequest) && (
                    <motion.div
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="fixed inset-0 z-[60] bg-[#f4f6fb]"
                    >
                        <RequestDetailView
                            request={currentRequests.find(r => r.id === selectedRequest.id) || selectedRequest}
                            onBack={() => setView("list")}
                            onGiveFeedback={handleOpenFeedback}
                        />
                    </motion.div>
                )}

                {(view === "feedback" && selectedRequest) && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="fixed inset-0 z-[70] bg-white"
                    >
                        <FeedbackView
                            initialMode={feedbackMode}
                            request={{
                                id: selectedRequest.id,
                                title: selectedRequest.title,
                                previewImage: selectedRequest.previewImage
                            }}
                            onBack={() => setView("details")}
                            onSubmit={(data) => {
                                console.log("Feedback submitted:", data);
                                setView("details");
                            }}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
