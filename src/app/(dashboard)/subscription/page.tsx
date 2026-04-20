"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { PlanSelection } from "@/components/subscription/PlanSelection";
import { BrandIntelligence } from "@/components/subscription/BrandIntelligence";
import { CollaborationLead } from "@/components/subscription/CollaborationLead";
import { SubscriptionSidebar } from "@/components/subscription/SubscriptionSidebar";
import { SuccessModal } from "@/components/subscription/SuccessModal";
import { ActiveSubscriptionView } from "@/components/subscription/ActiveSubscriptionView";
import { createClient } from "@/lib/supabase/client";
import { recordSubscription } from "@/lib/actions/subscription";
import { storageService } from "@/lib/supabase/storage";

/**
 * SubscriptionPage - Orchestrates between Empty State, Plan Selection, Brand Intelligence, and Collaboration Lead.
 */
export default function SubscriptionPage() {
    const [view, setView] = useState<"empty" | "plans" | "intelligence" | "collaboration" | "active">("empty");
    const [isLoading, setIsLoading] = useState(true);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    // Subscription State Tracking
    const [selectedPlan, setSelectedPlan] = useState<string>("scaleup");
    const [selectedIndustry, setSelectedIndustry] = useState<string>("");
    const [companyName, setCompanyName] = useState("");
    const [brandBrief, setBrandBrief] = useState("");
    const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [designCount, setDesignCount] = useState(0);
    const [isReferred, setIsReferred] = useState(false);
    const [referralCode, setReferralCode] = useState("");
    const [firstRequestTitle, setFirstRequestTitle] = useState("");
    const [firstRequestDesc, setFirstRequestDesc] = useState("");
    const [isUpgradeMode, setIsUpgradeMode] = useState(false);
    const uploadControllers = useRef<{ [key: number]: AbortController }>({});

    // Initial check for existing subscription
    useEffect(() => {
        const checkActiveSubscription = async () => {
            try {
                const res = await fetch("/api/subscription");
                const data = await res.json();
                if (data.subscription) {
                    setSelectedPlan(data.subscription.plan);
                    setSelectedIndustry(data.subscription.industry);
                    setCompanyName(data.subscription.company_name);
                    setBrandBrief(data.subscription.brand_brief || "");
                    setDesignCount(data.subscription.design_count || 0);
                    setReferralCode(data.subscription.referral_code || "");
                    // Also try to get user details from Profile if available on the model relation
                    if (data.subscription.user) {
                        setFullName(data.subscription.user.full_name || "");
                        setEmail(data.subscription.user.email || "");
                        setPhone(data.subscription.user.phone_number || "");
                    }
                    setView("active");
                }
            } catch (error) {
                console.error("Failed to check subscription:", error);
            } finally {
                setIsLoading(false);
            }
        };
        checkActiveSubscription();
    }, []);

    const handleFileUpload = async (file: File, index: number, customSetter?: (updater: (prev: any[]) => any[]) => void) => {
        const supabase = createClient();
        const setter = customSetter || setUploadedFiles;

        // We'll trust the session for the upload start to avoid lock contention
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;

        // Create a controller for this specific upload
        const controller = new AbortController();
        uploadControllers.current[index] = controller;

        try {
            const path = storageService.generatePath(user.id, file.name);

            // Supabase upload doesn't take signal natively, but we ignore the result if aborted
            await storageService.uploadFile(file, "brand-assets", path);

            if (controller.signal.aborted) return;

            // Update the file in state with success and path
            setter(prev => {
                const updated = [...prev];
                if (updated[index]) {
                    updated[index] = {
                        ...updated[index],
                        status: "success" as const,
                        progress: 100,
                        storagePath: path
                    };
                }
                return updated;
            });
        } catch (error: any) {
            if (controller.signal.aborted) return;

            console.error("Upload failed in SubscriptionPage:", error);
            setter(prev => {
                const updated = [...prev];
                if (updated[index]) {
                    updated[index] = {
                        ...updated[index],
                        status: "error" as const
                    };
                }
                return updated;
            });
        } finally {
            delete uploadControllers.current[index];
        }
    };

    const handleCancelUpload = (index: number) => {
        if (uploadControllers.current[index]) {
            uploadControllers.current[index].abort();
            delete uploadControllers.current[index];
        }
    };

    const handleFileDelete = async (file: any, index: number) => {
        handleCancelUpload(index);

        if (!file.storagePath) return;
        try {
            await storageService.deleteFile("brand-assets", file.storagePath);
        } catch (error) {
            console.error("Failed to delete file from storage:", error);
        }
    };

    const handleActivate = async () => {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Use storagePath if available, otherwise fallback to name
        const assetPaths = uploadedFiles
            .map(f => f.storagePath || f.name)
            .join(", ");

        const res = await recordSubscription(user.id, {
            plan: selectedPlan,
            industry: selectedIndustry,
            companyName: companyName,
            brandBrief: brandBrief,
            fullName: fullName,
            email: email,
            phone: phone,
            referralCode: referralCode,
            assets: assetPaths,
            firstRequestTitle: firstRequestTitle,
            firstRequestDesc: firstRequestDesc,
        });

        if (res.success) {
            setShowSuccessModal(true);
        }
    };

    const handleUpgradeConfirm = async (newPlan: string) => {
        try {
            const res = await fetch("/api/subscription", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plan: newPlan }),
            });
            const data = await res.json();
            
            if (data.success) {
                setSelectedPlan(newPlan);
                setIsUpgradeMode(false);
                setShowSuccessModal(true);
                setView("active");
            }
        } catch (error) {
            console.error("Upgrade failed:", error);
        }
    };

    const handleUpgrade = (nextPlanId: string) => {
        setSelectedPlan(nextPlanId);
        setIsUpgradeMode(true);
        setView("plans");
    };

    return (
        <div className="w-full h-full bg-[#FBFCFE]">
            <AnimatePresence mode="wait">
                {view === "empty" && (
                    <motion.div
                        key="plans-hero"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="w-full min-h-full px-6 lg:px-12 xl:px-16 py-12 lg:py-16 overflow-y-auto"
                    >
                        <div className="max-w-[1100px] mx-auto">
                            {/* Header */}
                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-center mb-12">
                                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-blue/5 text-brand-blue text-xs font-bold tracking-wide uppercase mb-5">
                                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                                    Subscription Plans
                                </div>
                                <h1 className="text-brand-navy text-[32px] lg:text-[40px] xl:text-[48px] font-bold tracking-tight leading-[1.1] mb-4">
                                    Scale Your Vision
                                </h1>
                                <p className="text-[#6B7A99] text-[15px] lg:text-[17px] max-w-[520px] mx-auto leading-relaxed">
                                    Tailored monthly plans for startups and enterprises. Get unlimited revisions, fast turnaround, and dedicated design support.
                                </p>
                            </motion.div>

                            {/* Plan Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6 mb-12">
                                {[
                                    {
                                        name: "Startup",
                                        price: "Contact us",
                                        period: "",
                                        desc: "Perfect for early-stage brands",
                                        features: ["5 design requests/month", "36-hour turnaround", "Unlimited revisions", "1 brand profile", "Email support"],
                                        color: "from-[#F8FAFF] to-white",
                                        border: "border-[#E3E8F4]",
                                        icon: "⚡",
                                        popular: false,
                                    },
                                    {
                                        name: "Scaleup",
                                        price: "Contact us",
                                        period: "",
                                        desc: "For growing brands that need more",
                                        features: ["10 design requests/month", "24-hour turnaround", "Unlimited revisions", "3 brand profiles", "Priority support", "Source files included"],
                                        color: "from-[#0035C1] to-[#0575FF]",
                                        border: "border-transparent",
                                        icon: "🚀",
                                        popular: true,
                                    },
                                    {
                                        name: "Supreme",
                                        price: "Contact us",
                                        period: "",
                                        desc: "Unlimited power for enterprises",
                                        features: ["Unlimited design requests", "12-hour turnaround", "Unlimited revisions", "Unlimited brand profiles", "Dedicated designer", "Priority queue", "Custom integrations"],
                                        color: "from-[#FFFBF5] to-white",
                                        border: "border-[#E3E8F4]",
                                        icon: "👑",
                                        popular: false,
                                    },
                                ].map((plan, i) => (
                                    <motion.div
                                        key={plan.name}
                                        initial={{ opacity: 0, y: 30 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.2 + i * 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                        className="relative group"
                                    >
                                        {plan.popular && (
                                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 px-4 py-1 rounded-full bg-brand-blue text-white text-[11px] font-bold tracking-wide uppercase shadow-lg">
                                                Most Popular
                                            </div>
                                        )}
                                        <div className={`h-full rounded-2xl border ${plan.border} bg-gradient-to-b ${plan.color} p-7 lg:p-8 flex flex-col transition-all duration-300 hover:shadow-xl ${plan.popular ? "shadow-[0_8px_40px_rgba(5,117,255,0.15)] ring-2 ring-brand-blue/20" : "hover:border-brand-blue/20"}`}>
                                            <div className="text-2xl mb-4">{plan.icon}</div>
                                            <h3 className={`text-[22px] font-bold mb-1 ${plan.popular ? "text-white" : "text-brand-navy"}`}>{plan.name}</h3>
                                            <p className={`text-[13px] mb-6 ${plan.popular ? "text-white/70" : "text-[#6B7A99]"}`}>{plan.desc}</p>
                                            <div className="space-y-3 flex-1">
                                                {plan.features.map((f) => (
                                                    <div key={f} className="flex items-start gap-2.5">
                                                        <svg className={`w-4 h-4 mt-0.5 shrink-0 ${plan.popular ? "text-white/80" : "text-brand-blue"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                                        <span className={`text-[13px] font-medium ${plan.popular ? "text-white/90" : "text-[#4A5578]"}`}>{f}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <button
                                                onClick={() => {
                                                    setSelectedPlan(plan.name.toLowerCase());
                                                    setView("plans");
                                                }}
                                                className={`mt-8 w-full py-3 rounded-xl text-[14px] font-semibold transition-all duration-300 ${
                                                    plan.popular
                                                        ? "bg-white text-brand-blue hover:bg-white/90 shadow-md"
                                                        : "bg-brand-navy text-white hover:bg-brand-navy/90"
                                                }`}
                                            >
                                                Get Started
                                            </button>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>

                            {/* Bottom CTA */}
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="text-center">
                                <p className="text-[#8E99B7] text-sm">
                                    Need something custom?{" "}
                                    <a href="/consultation" className="text-brand-blue font-semibold hover:underline">Book a consultation</a>
                                    {" "}with our team.
                                </p>
                            </motion.div>
                        </div>
                    </motion.div>
                )}

                {(view === "plans" || view === "intelligence" || view === "collaboration") && (
                    <motion.div
                        key="onboarding"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col lg:flex-row h-full lg:min-h-full gap-[24px] bg-transparent"
                    >
                        {/* LEFT CARD: Form Steps */}
                        <div className="flex-1 bg-white/80 backdrop-blur-xl border border-white/70 rounded-[24px] shadow-[0_10px_40px_rgba(15,40,90,0.05)] overflow-y-auto premium-scrollbar relative min-h-0">
                            <AnimatePresence mode="wait">
                                {view === "plans" && (
                                    <motion.div
                                        key="plans-view"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                                        className="h-full"
                                    >
                                        <PlanSelection
                                            selectedPlanId={selectedPlan}
                                            selectedIndustry={selectedIndustry}
                                            onUpdatePlan={setSelectedPlan}
                                            onUpdateIndustry={setSelectedIndustry}
                                            onBack={() => {
                                                if (isUpgradeMode) {
                                                    setIsUpgradeMode(false);
                                                    setView("active");
                                                } else {
                                                    setView("empty");
                                                }
                                            }}
                                            onNext={() => {
                                                if (isUpgradeMode) {
                                                    handleUpgradeConfirm(selectedPlan);
                                                } else {
                                                    setView("intelligence");
                                                }
                                            }}
                                        />
                                    </motion.div>
                                )}

                                {view === "intelligence" && (
                                    <motion.div
                                        key="intelligence-view"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                                        className="h-full"
                                    >
                                        <BrandIntelligence
                                            companyName={companyName}
                                            brandBrief={brandBrief}
                                            uploadedFiles={uploadedFiles}
                                            onUpdateCompanyName={setCompanyName}
                                            onUpdateBrandBrief={setBrandBrief}
                                            onUpdateFiles={setUploadedFiles}
                                            onFileUpload={handleFileUpload}
                                            onFileRemoved={handleFileDelete}
                                            onCancelUpload={handleCancelUpload}
                                            onBack={() => setView("plans")}
                                            onNext={() => setView("collaboration")}
                                        />
                                    </motion.div>
                                )}

                                {view === "collaboration" && (
                                    <motion.div
                                        key="collaboration-view"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                                        className="h-full"
                                    >
                                        <CollaborationLead
                                            selectedPlanId={selectedPlan}
                                            fullName={fullName}
                                            email={email}
                                            phone={phone}
                                            designCount={designCount}
                                            isReferred={isReferred}
                                            referralCode={referralCode}
                                            firstRequestTitle={firstRequestTitle}
                                            firstRequestDesc={firstRequestDesc}
                                            onUpdateFullName={setFullName}
                                            onUpdateEmail={setEmail}
                                            onUpdatePhone={setPhone}
                                            onUpdateDesignCount={setDesignCount}
                                            onUpdateIsReferred={setIsReferred}
                                            onUpdateReferralCode={setReferralCode}
                                            onUpdateFirstRequestTitle={setFirstRequestTitle}
                                            onUpdateFirstRequestDesc={setFirstRequestDesc}
                                            onUpgrade={handleUpgrade}
                                            onBack={() => setView("intelligence")}
                                            onActivate={handleActivate}
                                        />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* RIGHT CARD: Fixed Sidebar - Visible from 1024px upwards */}
                        <div className="hidden lg:block h-full shrink-0">
                            <SubscriptionSidebar selectedIndustry={selectedIndustry} />
                        </div>
                    </motion.div>
                )}

                {view === "active" && (
                    <motion.div
                        key="active-view"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        className="w-full h-full bg-white"
                    >
                        <ActiveSubscriptionView
                            plan={selectedPlan}
                            industry={selectedIndustry}
                            designCount={designCount}
                            companyName={companyName}
                            onUpdateDesignCount={setDesignCount}
                            onUpgrade={() => {
                                setIsUpgradeMode(true);
                                setView("plans");
                            }}
                            onFileUpload={handleFileUpload}
                            onFileRemoved={handleFileDelete}
                            onCancelUpload={handleCancelUpload}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {isLoading && (
                <div className="fixed inset-0 bg-white/80 backdrop-blur-md flex flex-col items-center justify-center z-1000">
                    <motion.div
                        animate={{ 
                            scale: [1, 1.1, 1],
                            opacity: [0.8, 1, 0.8]
                        }}
                        transition={{ 
                            duration: 2, 
                            repeat: Infinity,
                            ease: "easeInOut" 
                        }}
                        className="relative w-24 h-24 mb-4"
                    >
                        <Image 
                            src="/navbar/CDS Logo.svg" 
                            alt="CDS Logo" 
                            fill
                            className="object-contain"
                        />
                    </motion.div>
                </div>
            )}

            <SuccessModal
                isOpen={showSuccessModal}
                onClose={() => {
                    setShowSuccessModal(false);
                    setView("active");
                }}
            />
        </div>
    );
}
