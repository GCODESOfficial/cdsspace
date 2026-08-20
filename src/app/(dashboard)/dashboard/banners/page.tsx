"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { DashboardEmptyState } from "@/components/shared/DashboardEmptyState";
import { AnimatePresence, motion } from "framer-motion";

const BannersDashboard = dynamic(
    () => import("@/components/dashboard/BannersDashboard").then((module) => module.BannersDashboard),
    { loading: () => <div className="min-h-[360px] animate-pulse rounded-3xl bg-white/70" /> },
);
const BannerLab = dynamic(
    () => import("@/components/dashboard/BannerLab").then((module) => module.BannerLab),
    { ssr: false, loading: () => <div className="min-h-[65vh] animate-pulse rounded-3xl bg-white/70" /> },
);

/**
 * BannersPage - Orchestrates between the Empty State and the Banners Dashboard.
 * Implements fluid transitions and responsive scaling for all dashboard components.
 */
export default function BannersPage() {
    const [view, setView] = useState<"empty" | "dashboard" | "lab" | "loading">("loading");
    const [banners, setBanners] = useState<any[]>([]);
    const [draftId, setDraftId] = useState<string | null>(null);

    const fetchBanners = async () => {
        try {
            const res = await fetch("/api/banners");
            const data = await res.json();
            if (data.banners) {
                setBanners(data.banners);
                setView(data.banners.length > 0 ? "dashboard" : "empty");
            } else {
                setView("empty");
            }
        } catch (err) {
            console.error("Check banners error:", err);
            setView("empty");
        }
    };

    React.useEffect(() => {
        fetchBanners();
    }, []);

    return (
        <div className="w-full h-full relative overflow-y-auto">
            <AnimatePresence mode="wait">
                {view === "loading" ? (
                    <motion.div
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="w-full h-full min-h-[calc(100vh-100px)] flex flex-col items-center justify-center gap-6"
                    >
                        <div className="w-12 h-12 border-4 border-brand-blue border-t-transparent rounded-full animate-spin" />
                        <p className="text-brand-mute font-bold animate-pulse">Checking your banners...</p>
                    </motion.div>
                ) : view === "empty" ? (
                    <motion.div
                        key="empty"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.02 }}
                        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                        className="w-full h-full min-h-[calc(100vh-100px)] flex items-center justify-center p-4"
                    >
                        <DashboardEmptyState
                            icon="/dashboard/clipboard.svg"
                            title="No banners created"
                            description="Order eye-catching banners for your campaigns. Upload images or create new designs from scratch"
                            buttonText="Create banner"
                            onButtonClick={() => setView("lab")}
                        />
                    </motion.div>
                ) : view === "dashboard" ? (
                    <motion.div
                        key="dashboard"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.02 }}
                        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                        className="w-full"
                    >
                        <BannersDashboard
                            banners={banners}
                            onUpdate={fetchBanners}
                            onCreateNew={() => {
                                setDraftId(null);
                                setView("lab");
                            }}
                            onContinueDraft={(id) => {
                                setDraftId(id);
                                setView("lab");
                            }}
                        />
                    </motion.div>
                ) : (
                    <motion.div
                        key="lab"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                        className="w-full h-full"
                    >
                        <BannerLab draftId={draftId} onBack={() => {
                            setDraftId(null);
                            fetchBanners();
                            setView("dashboard");
                        }} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
