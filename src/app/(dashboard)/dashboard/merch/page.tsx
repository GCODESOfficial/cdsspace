"use client";

import { useState } from "react";
import { DashboardEmptyState } from "@/components/shared/DashboardEmptyState";
import { BrandLab } from "@/components/dashboard/BrandLab";
import { AnimatePresence, motion } from "framer-motion";
import { MerchDashboard } from "@/components/dashboard/MerchDashboard";
import { MerchProjectDetails } from "@/components/dashboard/MerchProjectDetails";

/**
 * MerchPage - Orchestrates between the Empty State, Dashboard, Details, and Brand Lab.
 */
export default function MerchPage() {
    const [view, setView] = useState<"empty" | "dashboard" | "brand-lab" | "details">("dashboard");
    const [selectedProject, setSelectedProject] = useState<any>(null);

    const handleViewDetails = (project: any) => {
        setSelectedProject(project);
        setView("details");
    };

    return (
        <div className="w-full h-full relative overflow-y-auto">
            <AnimatePresence mode="wait">
                {view === "empty" ? (
                    <motion.div
                        key="empty"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.4, ease: "easeInOut" }}
                        className="w-full h-[calc(100vh-100px)] flex items-center justify-center font-bold text-red-100"
                    >
                        <DashboardEmptyState
                            icon="/dashboard/plate.svg"
                            title="No merchandise items"
                            description="Start creating branded merchandise for your business. Add products, customize designs, and manage your inventory"
                            buttonText="Add merch"
                            onButtonClick={() => setView("brand-lab")}
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
                        <MerchDashboard
                            onCreateNew={() => setView("brand-lab")}
                            onViewDetails={handleViewDetails}
                        />
                    </motion.div>
                ) : view === "details" ? (
                    <motion.div
                        key="details"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                        className="w-full"
                    >
                        <MerchProjectDetails
                            project={selectedProject}
                            onBack={() => setView("dashboard")}
                        />
                    </motion.div>
                ) : (
                    <motion.div
                        key="brand-lab"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                        className="w-full h-full"
                    >
                        <BrandLab onBack={() => setView("dashboard")} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
