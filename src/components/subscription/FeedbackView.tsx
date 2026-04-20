"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
    ArrowLeft,
    MessageSquare,
    ThumbsUp,
    FolderOpen,
    MessageCircle,
    Info
} from "lucide-react";

interface FeedbackViewProps {
    initialMode: "revision" | "approve";
    request: {
        id: string;
        title: string;
        previewImage: string;
    };
    onBack: () => void;
    onSubmit: (data: any) => void;
}

export const FeedbackView = ({
    initialMode,
    request,
    onBack,
    onSubmit
}: FeedbackViewProps) => {
    const [mode, setMode] = useState<"revision" | "approve">(initialMode);
    const [overallFeedback, setOverallFeedback] = useState("");
    const [requestedChanges, setRequestedChanges] = useState("");
    const [files, setFiles] = useState<File[]>([]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit({
            mode,
            overallFeedback,
            requestedChanges,
            files
        });
    };

    return (
        <div className="w-full h-full bg-[#f4f6fb] overflow-y-auto premium-scrollbar px-5 lg:px-10 pb-10">
            {/* Header / Top Action Bar - Matches Detail View Style */}
            <div className="mt-6 lg:mt-8 bg-white border border-brand-stroke rounded-[16px] p-5 lg:px-8 lg:py-6 flex flex-row items-center justify-between gap-5 sticky top-5 z-50 shadow-sm">
                <div className="flex items-center gap-4 lg:gap-6">
                    <button
                        onClick={onBack}
                        className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center hover:bg-brand-bg rounded-full transition-all cursor-pointer group shrink-0"
                    >
                        <ArrowLeft size={24} className="text-brand-navy group-hover:-translate-x-1 transition-transform" />
                    </button>
                    <div className="flex flex-col">
                        <h1 className="text-brand-navy text-[18px] lg:text-[24px] font-bold leading-tight">
                            {mode === "revision" ? "Give Feedback" : "Approve Design"}
                        </h1>
                        <p className="text-brand-mute text-[12px] lg:text-[14px] font-medium mt-1">
                            {request.title} • {request.id}
                        </p>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="mt-8 flex flex-col xl:flex-row gap-8">

                {/* Left Column: Form Fields */}
                <div className="flex-1 flex flex-col gap-8">

                    {/* Feedback Type Selection */}
                    <div className="bg-white rounded-[24px] border border-brand-stroke p-6 lg:p-8 flex flex-col gap-6 shadow-sm">
                        <h2 className="text-brand-navy text-[18px] lg:text-[20px] font-bold">Feedback Type</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6">
                            {/* Revision Option */}
                            <button
                                type="button"
                                onClick={() => setMode("revision")}
                                className={cn(
                                    "relative h-[124px] rounded-[16px] border p-6 flex flex-col items-start gap-2 transition-all text-left group overflow-hidden",
                                    mode === "revision"
                                        ? "bg-[#DC660C]/5 border-[#DC660C] shadow-[0_0_0_1px_rgba(220,102,12,1)]"
                                        : "bg-white border-brand-stroke hover:border-brand-blue/30"
                                )}
                            >
                                <div className={cn(
                                    "w-8 h-8 rounded-full flex items-center justify-center mb-1",
                                    mode === "revision" ? "bg-[#DC660C] text-white" : "bg-brand-bg text-brand-mute"
                                )}>
                                    <MessageSquare size={16} />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <span className={cn(
                                        "text-[15px] font-bold leading-tight",
                                        mode === "revision" ? "text-[#DC660C]" : "text-brand-navy"
                                    )}>Request Revision</span>
                                    <span className={cn(
                                        "text-[11px] font-medium",
                                        mode === "revision" ? "text-[#DC660C]/70" : "text-brand-mute"
                                    )}>Request changes and improvement</span>
                                </div>
                            </button>

                            {/* Approve Option */}
                            <button
                                type="button"
                                onClick={() => setMode("approve")}
                                className={cn(
                                    "relative h-[124px] rounded-[16px] border p-6 flex flex-col items-start gap-2 transition-all text-left group overflow-hidden",
                                    mode === "approve"
                                        ? "bg-[#009c22]/5 border-[#009c22] shadow-[0_0_0_1px_rgba(0,156,34,1)]"
                                        : "bg-white border-brand-stroke hover:border-brand-blue/30"
                                )}
                            >
                                <div className={cn(
                                    "w-8 h-8 rounded-full flex items-center justify-center mb-1",
                                    mode === "approve" ? "bg-[#009c22] text-white" : "bg-brand-bg text-brand-mute"
                                )}>
                                    <ThumbsUp size={16} />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <span className={cn(
                                        "text-[15px] font-bold leading-tight",
                                        mode === "approve" ? "text-[#009C22]" : "text-brand-navy"
                                    )}>Approve Design</span>
                                    <span className={cn(
                                        "text-[11px] font-medium",
                                        mode === "approve" ? "text-[#009C22]/70" : "text-brand-mute"
                                    )}>Accept and finalize this design</span>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Detailed Feedback Inputs */}
                    <div className="bg-white rounded-[24px] border border-brand-stroke p-6 lg:p-8 flex flex-col gap-10 shadow-sm">
                        <div className="flex flex-col gap-6">
                            <h2 className="text-brand-navy text-[18px] lg:text-[20px] font-bold">Detailed Feedback</h2>

                            <div className="flex flex-col gap-4">
                                <label className="text-brand-mute text-[16px] font-bold flex items-center gap-2">
                                    Overall Impression
                                </label>
                                <textarea
                                    value={overallFeedback}
                                    onChange={(e) => setOverallFeedback(e.target.value)}
                                    placeholder="What are your thoughts on this version?"
                                    className="w-full h-16 bg-brand-bg border border-brand-stroke/50 rounded-[16px] p-5 text-brand-navy font-medium outline-none focus:border-brand-blue/30 focus:bg-white transition-all resize-none"
                                />
                            </div>

                            {mode === "revision" && (
                                <div className="flex flex-col gap-4">
                                    <label className="text-brand-mute text-[16px] font-bold flex items-center gap-2">
                                        Requested Changes
                                    </label>
                                    <textarea
                                        value={requestedChanges}
                                        onChange={(e) => setRequestedChanges(e.target.value)}
                                        placeholder="Specify what you'd like us to change or improve..."
                                        className="w-full h-16 bg-brand-bg border border-brand-stroke/50 rounded-[16px] p-5 text-brand-navy font-medium outline-none focus:border-brand-blue/30 focus:bg-white transition-all resize-none"
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Reference Materials - ONLY FOR REVISION */}
                    {mode === "revision" && (
                        <div className="bg-white rounded-[24px] border border-brand-stroke p-6 lg:p-8 flex flex-col gap-6 shadow-sm">
                            <h2 className="text-brand-navy text-[18px] lg:text-[20px] font-bold">Reference Materials</h2>
                            <div className="flex flex-col gap-5">
                                <p className="text-brand-mute text-[14px] font-semibold leading-relaxed">
                                    Upload examples, mockups, or references to clarify your feedback
                                </p>
                                <div
                                    className="border-2 border-dashed border-brand-stroke/60 bg-brand-bg rounded-[16px] h-[140px] flex flex-col items-center justify-center gap-3 hover:border-brand-blue/40 hover:bg-brand-blue/5 transition-all cursor-pointer group"
                                    onClick={() => document.getElementById('feedback-file-upload')?.click()}
                                >
                                    <input
                                        id="feedback-file-upload"
                                        type="file"
                                        multiple
                                        className="hidden"
                                        onChange={(e) => {
                                            if (e.target.files) setFiles(Array.from(e.target.files));
                                        }}
                                    />
                                    <FolderOpen size={24} className="text-brand-mute group-hover:text-brand-blue transition-colors" />
                                    <div className="flex flex-col items-center gap-1">
                                        <p className="text-brand-body font-bold text-[12px]">Drop your files</p>
                                        <p className="text-brand-mute text-[10px] font-medium">or <span className="text-brand-blue underline">click to browse</span></p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                        <button
                            onClick={onBack}
                            className="w-full sm:w-[160px] h-12 border border-brand-blue text-brand-blue rounded-full font-bold hover:bg-brand-blue/5 transition-all active:scale-95 text-[14px]"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            className="w-full sm:flex-1 h-12 rounded-full text-white font-bold transition-all hover:brightness-110 active:scale-95 shadow-md text-[14px]"
                            style={{ background: "linear-gradient(167.88deg, #0035C1 8.83%, #0575FF 86.3%)" }}
                        >
                            {mode === "revision" ? "Submit Feedback" : "Approve Design"}
                        </button>
                    </div>
                </div>

                {/* Right Column: Preview Sticky */}
                <div className="w-full xl:w-[434px] shrink-0">
                    <div className="bg-white rounded-[24px] border border-brand-stroke p-6 lg:p-8 flex flex-col gap-6 shadow-sm sticky top-32">
                        <h2 className="text-brand-navy text-[18px] font-bold">Current Design</h2>
                        <div className="relative w-full h-[486px] rounded-[16px] overflow-hidden border border-brand-stroke/30">
                            <Image
                                src={request.previewImage}
                                alt="Current Design"
                                fill
                                className="object-cover"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
