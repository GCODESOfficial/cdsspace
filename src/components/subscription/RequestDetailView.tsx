"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
    ArrowLeft,
    DownloadCloud,
    Calendar,
    Clock,
    User,
    Paperclip,
    Send,
    Eye,
    Maximize2,
    MessageSquare,
    ThumbsUp
} from "lucide-react";

interface Comment {
    author: string;
    date: string;
    text: string;
}

interface Version {
    id: string;
    date: string;
    thumbnail: string;
}

interface RequestDetail {
    id: string;
    title: string;
    status: string;
    description: string;
    createdDate: string;
    lastUpdatedDate: string;
    clientName: string;
    previewImage: string;
    versions: Version[];
    comments: Comment[];
}

interface RequestDetailViewProps {
    request: RequestDetail;
    onBack: () => void;
    onGiveFeedback: (mode: "revision" | "approve") => void;
}

export const RequestDetailView = ({ request, onBack, onGiveFeedback }: RequestDetailViewProps) => {
    const [comment, setComment] = useState("");

    return (
        <div className="w-full h-full bg-[#f4f6fb] overflow-y-auto premium-scrollbar px-5 lg:px-10 pb-10">
            {/* Header / Top Action Bar - Mobile Optimized */}
            <div className="mt-6 lg:mt-8 bg-white border border-brand-stroke rounded-[16px] p-5 lg:px-8 lg:py-6 flex flex-row items-start lg:items-center justify-between gap-5 lg:gap-6 sticky top-5 z-50 shadow-sm">
                <div className="flex items-start lg:items-center gap-4 lg:gap-6 flex-1">
                    <button
                        onClick={onBack}
                        className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center hover:bg-brand-bg rounded-full transition-all cursor-pointer group shrink-0"
                    >
                        <ArrowLeft size={24} className="text-brand-navy group-hover:-translate-x-1 transition-transform" />
                    </button>
                    <div className="flex flex-col flex-1 gap-4 lg:gap-0">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 flex-1 w-full">
                            <div className="flex flex-col">
                                <h1 className="text-brand-navy text-[18px] lg:text-[24px] font-bold leading-tight">{request.title}</h1>
                                <p className="text-brand-mute text-[12px] lg:text-[14px] font-medium uppercase tracking-wider mt-1">{request.id}</p>
                            </div>
                            <div className="flex items-center lg:justify-end">
                                <span className={cn(
                                    "px-3 lg:px-4 py-1 rounded-full text-[12px] lg:text-[14px] font-semibold",
                                    request.status === "In Review" ? "bg-[#4A00FF]/10 text-[#4A00FF]" :
                                        request.status === "Completed" ? "bg-[#009c22]/10 text-[#009c22]" :
                                            request.status === "Active" ? "bg-brand-blue/10 text-brand-blue" :
                                                "bg-[#DC660C]/10 text-[#DC660C]"
                                )}>
                                    {request.status}
                                </span>
                            </div>
                        </div>

                        {/* Mobile Action Button */}
                        <button
                            className="lg:hidden h-[44px] rounded-full px-6 flex items-center justify-center gap-3 text-white text-[15px] font-medium transition-all shadow-md active:scale-[0.98] w-full"
                            style={{ background: "linear-gradient(167.88deg, #0035C1 8.83%, #0575FF 86.3%)" }}
                            onClick={() => {
                                if (request.status === "In Review") {
                                    onGiveFeedback("revision");
                                }
                            }}
                        >
                            {request.status === "In Review" ? (
                                <>
                                    <MessageSquare size={20} />
                                    Give Feedback
                                </>
                            ) : (
                                <>
                                    <DownloadCloud size={20} />
                                    Download Files
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Desktop Action Button */}
                <button
                    className="hidden lg:flex h-[52px] rounded-full px-8 items-center justify-center gap-3 text-white text-[18px] font-medium transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_8px_20px_rgba(0,53,193,0.15)] cursor-pointer whitespace-nowrap"
                    style={{ background: "linear-gradient(167.88deg, #0035C1 8.83%, #0575FF 86.3%)" }}
                    onClick={() => {
                        if (request.status === "In Review") {
                            onGiveFeedback("revision");
                        }
                    }}
                >
                    {request.status === "In Review" ? (
                        <>
                            <MessageSquare size={24} />
                            Give Feedback
                        </>
                    ) : (
                        <>
                            <DownloadCloud size={24} />
                            Download Files
                        </>
                    )}
                </button>
            </div>

            {/* Main Page Layout Grid */}
            <div className="mt-10 lg:mt-8 flex flex-col xl:flex-row gap-16 lg:gap-8">

                {/* Left Column: Design Content */}
                <div className="flex-1 flex flex-col gap-16 lg:gap-8">

                    {/* Design Preview Section */}
                    <div className="bg-white rounded-[24px] border border-brand-stroke p-5 lg:p-8 flex flex-col gap-8 shadow-sm">
                        <h2 className="text-brand-navy text-[18px] lg:text-[20px] font-bold">Design Preview</h2>

                        <div className="relative w-full aspect-[16/9] lg:h-[416px] rounded-[16px] overflow-hidden border border-brand-stroke/30 bg-[#F8FAFC]">
                            <Image
                                src={request.previewImage}
                                alt="Design Preview"
                                fill
                                className="object-cover"
                                priority
                            />
                        </div>

                        {/* Action Buttons below image */}
                        <div className="flex flex-col lg:grid lg:grid-cols-2 gap-4 lg:gap-6">
                            <button
                                className="h-10 lg:h-[52px] rounded-full flex items-center justify-center gap-2 lg:gap-3 text-white text-[12px] lg:text-[16px] font-medium transition-all hover:brightness-110 active:scale-[0.98] shadow-md cursor-pointer"
                                style={{ background: "linear-gradient(172.77deg, #0035C1 8.83%, #0575FF 86.3%)" }}
                            >
                                <DownloadCloud size={16} className="lg:w-5 lg:h-5" />
                                Download Preview
                            </button>
                            <button className="h-10 lg:h-[52px] bg-[#e3e8f4] text-brand-blue rounded-full flex items-center justify-center gap-2 lg:gap-3 text-[12px] lg:text-[16px] font-medium transition-all hover:bg-[#dce3f0] active:scale-[0.98] cursor-pointer">
                                <Eye size={16} className="lg:w-5 lg:h-5" />
                                Full Screen
                            </button>
                        </div>
                    </div>

                    {/* Project Description Container */}
                    <div className="bg-white rounded-[24px] border border-brand-stroke p-5 lg:p-8 flex flex-col gap-4 shadow-sm">
                        <h2 className="text-brand-navy text-[18px] lg:text-[20px] font-bold">Project Description</h2>
                        <p className="text-brand-body text-[16px] font-medium leading-relaxed">
                            {request.description}
                        </p>
                    </div>

                    {/* Versions Section */}
                    <div className="bg-white rounded-[24px] border border-brand-stroke p-5 lg:p-8 flex flex-col gap-6 shadow-sm">
                        <h2 className="text-brand-navy text-[18px] lg:text-[20px] font-bold">Version History</h2>
                        <div className="flex flex-col gap-4">
                            {request.versions.map((v) => (
                                <div key={v.id} className="bg-brand-bg/50 hover:bg-brand-bg rounded-[16px] p-4 flex items-center justify-between group transition-colors border border-transparent hover:border-brand-stroke/30">
                                    <div className="flex items-center gap-4 lg:gap-6">
                                        <div className="relative w-16 h-12 lg:w-20 lg:h-[60px] rounded-[8px] overflow-hidden border border-brand-stroke/40">
                                            <Image
                                                src={v.thumbnail}
                                                alt={v.id}
                                                fill
                                                className="object-cover"
                                            />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-brand-navy font-bold text-[16px] lg:text-[18px]">{v.id}</span>
                                            <span className="text-brand-mute text-[12px] lg:text-[14px] font-medium">{v.date}</span>
                                        </div>
                                    </div>
                                    <button className="bg-white border border-brand-blue/20 hover:border-brand-blue text-brand-blue px-4 lg:px-6 py-2 rounded-full text-[12px] lg:text-[14px] font-bold transition-all shadow-sm active:scale-95">
                                        View
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Column: Metadata & Activity */}
                <div className="w-full xl:w-[434px] flex flex-col gap-16 lg:gap-8">

                    {/* Project Specs Card */}
                    <div className="bg-white rounded-[24px] border border-brand-stroke p-5 lg:p-8 flex flex-col gap-6 lg:gap-8 shadow-sm">
                        <h2 className="text-brand-navy text-[18px] font-bold">Project Information</h2>

                        <div className="flex flex-col gap-6">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-brand-blue/5 rounded-[16px] flex items-center justify-center text-brand-blue">
                                    <Calendar size={24} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-brand-mute text-[14px] font-medium">Created</span>
                                    <span className="text-brand-body text-[16px] font-bold">{request.createdDate}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-[#009c22]/5 rounded-[16px] flex items-center justify-center text-[#009c22]">
                                    <Clock size={24} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-brand-mute text-[14px] font-medium">Last Updated</span>
                                    <span className="text-brand-body text-[16px] font-bold">{request.lastUpdatedDate}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-[#dc660c]/5 rounded-[16px] flex items-center justify-center text-[#dc660c]">
                                    <User size={24} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-brand-mute text-[14px] font-medium">Client</span>
                                    <span className="text-brand-body text-[16px] font-bold">{request.clientName}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Social/Comments Card */}
                    <div id="comment-box" className="bg-white rounded-[24px] border border-brand-stroke p-5 lg:p-8 flex flex-col gap-8 shadow-sm">
                        <h2 className="text-brand-navy text-[18px] font-bold">Activity & Comments</h2>

                        <div className="flex flex-col gap-6">
                            {request.comments.map((msg, i) => (
                                <div key={i} className="bg-brand-bg rounded-[16px] px-4 lg:px-6 py-6 lg:py-6 flex flex-col gap-4">
                                    <div className="flex items-center gap-6">
                                        <span className="text-brand-navy font-bold text-[15px] lg:text-[16px]">{msg.author}</span>
                                        <span className="text-brand-mute text-[12px] font-medium">{msg.date}</span>
                                    </div>
                                    <p className="text-brand-body text-[15px] lg:text-[16px] font-medium leading-relaxed">
                                        {msg.text}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* Input Area */}
                        <div className="flex flex-col gap-8 lg:gap-6 pt-4 border-t border-brand-stroke/30">
                            <textarea
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                placeholder="Add a comment..."
                                className="w-full h-[100px] bg-brand-bg border border-brand-stroke/50 rounded-[16px] px-6 lg:px-5 py-5 text-brand-navy font-medium outline-none focus:border-brand-blue/30 transition-all resize-none shadow-inner text-[16px]"
                            />

                            <div className="flex gap-2 lg:gap-3">
                                <button className="flex-1 bg-[#e3e8f4] text-brand-blue rounded-full h-11 lg:h-[52px] flex items-center justify-center gap-2 font-bold hover:bg-[#dce3f0] transition-colors cursor-pointer active:scale-95 text-[16px] lg:text-[18px]">
                                    <Paperclip size={20} />
                                    Attach
                                </button>
                                <button
                                    className="flex-[1.5] lg:flex-[1.8] rounded-full h-11 lg:h-[52px] flex items-center justify-center gap-2 text-white font-bold hover:brightness-110 transition-all shadow-[0_8px_16px_rgba(0,53,193,0.15)] cursor-pointer active:scale-95 text-[16px] lg:text-[18px]"
                                    style={{ background: "linear-gradient(165.36deg, #0035C1 8.83%, #0575FF 86.3%)" }}
                                >
                                    <Send size={20} />
                                    Send Comment
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Approve Design Card - ONLY FOR IN REVIEW */}
                    {request.status === "In Review" && (
                        <div className="bg-brand-blue/5 border border-brand-blue/20 rounded-[24px] p-6 lg:p-8 flex flex-col gap-6 shadow-sm">
                            <div className="flex flex-col gap-2">
                                <h2 className="text-brand-navy text-[18px] lg:text-[20px] font-bold">Approve Design?</h2>
                                <p className="text-brand-body text-[14px] font-medium">Let us know if this design meets your expectations</p>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3">
                                <button
                                    onClick={() => onGiveFeedback("revision")}
                                    className="flex-1 bg-[#dc660c]/5 border border-[#dc660c] text-[#dc660c] h-[48px] rounded-full flex items-center justify-center gap-2 font-bold text-[14px] hover:bg-[#dc660c]/10 transition-all active:scale-95 cursor-pointer"
                                >
                                    <MessageSquare size={18} />
                                    Request Changes
                                </button>
                                <button
                                    onClick={() => onGiveFeedback("approve")}
                                    className="flex-1 bg-[#009c22]/5 border border-[#009c22] text-[#009c22] h-[48px] rounded-full flex items-center justify-center gap-2 font-bold text-[14px] hover:bg-[#009c22]/10 transition-all active:scale-95 cursor-pointer"
                                >
                                    <ThumbsUp size={18} />
                                    Approve
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
