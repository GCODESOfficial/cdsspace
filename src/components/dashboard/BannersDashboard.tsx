"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Plus,
    Search,
    Calendar,
    Image as ImageIcon,
    Eye,
    ArrowUpRight,
    Clock,
    CheckCircle2,
    X,
    FileText,
    Truck,
    MapPin,
    ArrowLeft,
    Pencil,
    Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

// --- Types ---

type BannerStatus = "PENDING" | "ACTIVE" | "DRAFT" | "SCHEDULED" | "ARCHIVED" | "COMPLETED";

interface Banner {
    id: string;
    display_id: string;
    title: string;
    status: BannerStatus;
    size: string;
    quality: string;
    environment: string;
    updated_at: string;
    created_at: string;
    quantity: number;
    mockup_url?: string | null;
    design_brief?: string | null;
    fulfillment_type: string;
    street_address?: string | null;
    city?: string | null;
    state?: string | null;
    pickup_station?: string | null;
    recipient_name?: string | null;
}

// --- Sub-components ---

const StatusBadge = ({ status }: { status: BannerStatus }) => {
    const styles = {
        PENDING: "bg-amber-50 text-amber-600 border-amber-100",
        ACTIVE: "bg-green-50 text-green-600 border-green-100",
        DRAFT: "bg-gray-50 text-gray-500 border-gray-100",
        SCHEDULED: "bg-blue-50 text-blue-600 border-blue-100",
        ARCHIVED: "bg-orange-50 text-orange-600 border-orange-100",
        COMPLETED: "bg-purple-50 text-purple-600 border-purple-100",
    };

    return (
        <div className={cn("px-2 py-0.5 rounded-full text-[9px] xl:text-[10px] font-black uppercase tracking-widest border", styles[status])}>
            {status.toLowerCase()}
        </div>
    );
};

// Premium Preview Side Drawer
const BannerDetailPreview = ({ banner, onClose }: { banner: Banner; onClose: () => void }) => {
    return (
        <div className="fixed inset-0 z-100 flex justify-end">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-brand-navy/40 backdrop-blur-sm"
                onClick={onClose}
            />
            
            <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="w-full max-w-[550px] 2xl:max-w-[650px] bg-white h-full relative shadow-[-20px_0_50px_rgba(4,11,55,0.15)] flex flex-col overflow-hidden"
            >
                {/* Drawer Header */}
                <div className="p-6 xl:p-8 flex items-center justify-between border-b border-brand-stroke bg-brand-bg/30">
                    <div className="space-y-1">
                        <span className="text-[10px] font-black text-brand-blue tracking-[0.2em] uppercase">{banner.display_id}</span>
                        <h2 className="text-brand-navy text-[18px] xl:text-[22px] font-black leading-tight truncate max-w-[300px]">{banner.title}</h2>
                    </div>
                    <button 
                        onClick={onClose}
                        className="size-10 flex items-center justify-center bg-white border border-brand-stroke hover:bg-brand-stroke rounded-full transition-all text-brand-navy shadow-sm"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto premium-scrollbar p-6 xl:p-10 space-y-10">
                    {/* Visual Preview Section */}
                    <div className="aspect-[3/4.2] w-full bg-brand-bg rounded-3xl relative flex items-center justify-center overflow-hidden border border-brand-stroke shadow-inner">
                        {banner.mockup_url ? (
                            <Image
                                src={banner.mockup_url}
                                alt="Mockup"
                                fill 
                                className="object-contain p-4"
                            />
                        ) : (
                            <div className="text-center space-y-4 opacity-30 px-10">
                                <div className="size-20 xl:size-24 bg-white rounded-3xl mx-auto flex items-center justify-center shadow-md">
                                    <ImageIcon size={32} className="text-brand-mute" />
                                </div>
                                <p className="text-brand-navy font-black text-[13px] uppercase tracking-widest">Admin mockup pending</p>
                                <p className="text-brand-body text-[11px] font-medium leading-relaxed italic">Our design team is currently preparing the high-fidelity visualization for this banner.</p>
                            </div>
                        )}

                        <div className="absolute bottom-6 right-6">
                            <StatusBadge status={banner.status} />
                        </div>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 gap-6">
                        <div className="bg-brand-bg rounded-2xl p-5 space-y-3">
                            <h3 className="text-[11px] font-black text-brand-navy/40 uppercase tracking-widest">Specifications</h3>
                            <div className="space-y-4">
                                <div className="space-y-0.5">
                                    <p className="text-[10px] font-black text-brand-mute uppercase">Dimensions</p>
                                    <p className="text-brand-navy font-black text-[15px]">{banner.size} cm</p>
                                </div>
                                <div className="space-y-0.5">
                                    <p className="text-[10px] font-black text-brand-mute uppercase">Quality Grade</p>
                                    <p className="text-brand-navy font-black text-[15px]">{banner.quality}</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-brand-bg rounded-2xl p-5 space-y-3">
                            <h3 className="text-[11px] font-black text-brand-navy/40 uppercase tracking-widest">Fulfillment</h3>
                            <div className="space-y-4">
                                <div className="space-y-0.5">
                                    <p className="text-[10px] font-black text-brand-mute uppercase">Usage Environment</p>
                                    <p className="text-brand-navy font-black text-[15px]">{banner.environment}</p>
                                </div>
                                <div className="space-y-0.5">
                                    <p className="text-[10px] font-black text-brand-mute uppercase">Delivery Type</p>
                                    <p className="text-brand-navy font-black text-[15px] capitalize">{banner.fulfillment_type}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Brief & Notes */}
                    <div className="space-y-4 p-1">
                        <div className="flex items-center gap-2.5 text-brand-blue">
                            <FileText size={16} />
                            <h3 className="text-[14px] font-black text-brand-navy uppercase tracking-widest">Project Brief</h3>
                        </div>
                        <div className="bg-brand-bg/50 border-l-4 border-brand-blue/20 p-5 rounded-r-2xl">
                            <p className="text-brand-body text-[13px] leading-relaxed italic font-medium">
                                {banner.design_brief || "No specific instructions provided for this request."}
                            </p>
                        </div>
                    </div>

                    {/* Shipping Section */}
                    <div className="space-y-6 pt-4">
                        <div className="flex items-center gap-2.5 text-brand-blue">
                            <MapPin size={16} />
                            <h3 className="text-[14px] font-black text-brand-navy uppercase tracking-widest">Delivery Details</h3>
                        </div>
                        
                        <div className="flex gap-4 p-5 bg-brand-bg/50 rounded-2xl">
                            <div className="size-12 rounded-full bg-white border border-brand-stroke flex items-center justify-center shrink-0 shadow-sm">
                                <Truck className="text-brand-blue size-5" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-[13px] font-black text-brand-navy leading-snug">
                                    {banner.fulfillment_type === "Door-to-door"
                                        ? `${banner.street_address}, ${banner.city}`
                                        : banner.pickup_station}
                                </p>
                                <p className="text-[11px] text-brand-mute font-bold uppercase tracking-wider">{banner.state}, Nigeria</p>
                                <div className="pt-2 flex flex-col gap-0.5">
                                    <p className="text-[10px] font-black text-brand-mute uppercase">Recipient</p>
                                    <p className="text-[12px] font-bold text-brand-navy">{banner.recipient_name || "Authorized Client"}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-6 xl:p-8 border-t border-brand-stroke glass flex gap-3">
                    <button className="flex-1 h-12 bg-white border border-brand-stroke text-brand-navy rounded-full font-black text-[12px] uppercase tracking-widest hover:bg-brand-bg transition-all active:scale-95 shadow-sm">
                        Request Edit
                    </button>
                    <button className="flex-1 h-12 bg-brand-navy text-white rounded-full font-black text-[12px] uppercase tracking-widest hover:bg-brand-blue transition-all active:scale-95 shadow-md shadow-brand-navy/10">
                        View Detailed Log
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

const BannerCard = ({ 
    banner, 
    onPreview, 
    onDelete 
}: { 
    banner: Banner; 
    onPreview: () => void;
    onDelete: (id: string) => void;
}) => {
    const isEditable = banner.status === "DRAFT";

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="group bg-white border border-brand-stroke rounded-[16px] xl:rounded-[20px] overflow-hidden hover:shadow-xl hover:shadow-brand-navy/5 transition-all duration-300"
        >
            {/* Thumbnail Placeholder - Wide aspect for drastic height reduction */}
            <div className="aspect-auto bg-brand-bg relative flex items-center justify-center overflow-hidden border-b border-brand-stroke">
                <div className="absolute inset-0 bg-brand-navy/0 group-hover:bg-brand-navy/10 transition-colors duration-300" />
                
                {banner.mockup_url ? (
                    <Image
                        src={banner.mockup_url}
                        alt={banner.title}
                        fill 
                        className="object-cover group-hover:scale-110 transition-transform duration-700"
                    />
                ) : (
                    <div className="flex flex-col items-center gap-2 opacity-20 group-hover:opacity-40 transition-opacity duration-300">
                        <div className="size-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                            <ImageIcon className="size-7 text-brand-navy" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy">Mockup</span>
                    </div>
                )}

                {/* ID Badge */}
                <div className="absolute top-3 left-3 px-2 py-0.5 bg-white/95 backdrop-blur-sm rounded border border-brand-stroke text-[9px] xl:text-[10px] font-black text-brand-navy shadow-sm">
                    {banner.display_id}
                </div>

                {/* Delete button for drafts */}
                {isEditable && (
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(banner.id);
                        }}
                        className="absolute top-3 right-3 size-8 rounded-full bg-red-50 text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Content Area */}
            <div className="p-4 xl:p-5 space-y-2.5">
                <div className="space-y-0.5">
                    <h3 className="text-brand-navy text-[14px] xl:text-[15px] font-black leading-tight truncate">{banner.title}</h3>
                    <p className="text-brand-mute text-[11px] font-bold tracking-tight uppercase">{banner.environment} • {banner.quality}</p>
                </div>

                {/* Metadata Columnar */}
                <div className="grid grid-cols-2 gap-2 pb-2 border-b border-brand-stroke border-dashed">
                    <div className="space-y-0.5">
                        <p className="text-[9px] font-black text-brand-mute tracking-widest uppercase">Size</p>
                        <p className="text-brand-navy font-black text-[12px]">{banner.size} cm</p>
                    </div>
                    <div className="space-y-0.5">
                        <p className="text-[9px] font-black text-brand-mute tracking-widest uppercase">Update</p>
                        <p className="text-brand-navy font-black text-[12px]">{new Date(banner.updated_at).toLocaleDateString()}</p>
                    </div>
                </div>
                
                <div className="flex items-center justify-between pt-1">
                    <StatusBadge status={banner.status} />
                </div>

                {/* Actions Footer */}
                <div className="flex items-center gap-2 pt-1">
                    <button 
                        onClick={onPreview}
                        className="flex-1 h-9 rounded-full bg-linear-to-r from-[#0035C1] to-[#0575FF]  flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-widest text-white transition-all active:scale-95"
                    >
                        Preview
                    </button>
                    {isEditable && (
                        <button className="size-9 rounded-full bg-brand-blue text-white flex items-center justify-center hover:bg-brand-navy transition-all active:scale-95 shadow-md shadow-brand-blue/10">
                            <Pencil className="size-4" />
                        </button>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

// --- Main Component ---

export const BannersDashboard = ({ 
    banners,
    onUpdate,
    onCreateNew 
}: { 
    banners: Banner[];
    onUpdate: () => void;
    onCreateNew: () => void;
}) => {
    const [filter, setFilter] = useState<BannerStatus | "ALL">("ALL");
    const [selectedBanner, setSelectedBanner] = useState<Banner | null>(null);


    const filteredBanners = filter === "ALL"
        ? banners
        : banners.filter(b => b.status === filter);

    const stats = {
        total: banners.length,
        active: banners.filter(b => b.status === "ACTIVE").length,
        pending: banners.filter(b => b.status === "PENDING").length,
        drafts: banners.filter(b => b.status === "DRAFT" || b.status === "SCHEDULED").length,
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("Are you sure you want to delete this draft?")) return;
        
        try {
            const res = await fetch(`/api/banners?id=${id}`, { method: "DELETE" });
            if (res.ok) {
                onUpdate(); // Trigger refresh in parent
            }
        } catch (err) {
            console.error("Delete error:", err);
        }
    };


    return (
        <div className="w-full max-w-[1640px] mx-auto space-y-6 lg:space-y-8 pb-20 px-4 lg:px-8 2xl:px-12 pt-4">
            <AnimatePresence>
                {selectedBanner && (
                    <BannerDetailPreview banner={selectedBanner} onClose={() => setSelectedBanner(null)} />
                )}
            </AnimatePresence>

            {/* Header Section */}
            <div className="flex flex-col lg:flex-row xl:items-center justify-between gap-6">
                <div className="space-y-0.5 xl:space-y-1">
                    <h1 className="text-brand-navy text-[24px] xl:text-[32px] font-black tracking-tight uppercase">Banner Studio</h1>
                    <p className="text-brand-body text-[13px] xl:text-[15px] font-medium tracking-tight opacity-70">Visual production management & roll-up banner fulfillment</p>
                </div>

                <button
                    onClick={onCreateNew}
                    className="h-12 xl:h-13 px-8 bg-linear-to-r from-[#0035C1] to-[#0575FF] hover:scale-[1.02] active:scale-[0.98] cursor-pointer rounded-full text-white flex items-center justify-center gap-3 font-black text-[13px] xl:text-[14px] uppercase tracking-widest hover:bg-brand-blue transition-all shadow-xl shadow-brand-navy/10 active:scale-95 group"
                >
                    <Plus className="size-4 xl:size-5 text-white group-hover:rotate-90 transition-transform duration-300" />
                    Order New Banner
                </button>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 xl:gap-6">
                {[
                    { label: "Total Project", value: stats.total, icon: ImageIcon, color: "text-brand-blue" },
                    { label: "Production", value: stats.active, icon: CheckCircle2, color: "text-brand-success" },
                    { label: "Pending", value: stats.pending, icon: Clock, color: "text-amber-500" },
                    { label: "Drafts / Queue", value: stats.drafts, icon: Calendar, color: "text-brand-mute" }
                ].map((stat, i) => (
                    <div key={i} className="bg-white border border-brand-stroke px-5 py-6 xl:px-7 xl:py-8 rounded-[24px] space-y-4 shadow-sm hover:shadow-md transition-shadow">
                        <div className={cn("size-10 2xl:size-11 rounded-xl bg-brand-bg flex items-center justify-center", stat.color)}>
                            <stat.icon size={20} />
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-brand-mute text-[10px] xl:text-[11px] font-black uppercase tracking-widest">{stat.label}</p>
                            <p className="text-brand-navy text-[24px] xl:text-[32px] font-black leading-none">{stat.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Toolbar - Optimized for 1280px */}
            <div className="flex flex-col lg:flex-row items-center justify-between gap-4 bg-white border border-brand-stroke p-2 xl:px-4 xl:py-2.5 rounded-[20px] xl:rounded-full">
                <div className="flex items-center gap-1 xl:gap-1.5 overflow-x-auto w-full xl:w-auto pb-2 xl:pb-0 scrollbar-hide scrollbar-hide">
                    {["ALL", "PENDING", "ACTIVE", "DRAFT", "SCHEDULED", "COMPLETED"].map((s) => (
                        <button
                            key={s}
                            onClick={() => setFilter(s as any)}
                            className={cn(
                                "px-4 xl:px-6 py-2 xl:py-2.5 rounded-full text-[10px] xl:text-[11px] font-black tracking-widest uppercase transition-all shrink-0",
                                filter === s
                                    ? "bg-linear-to-r from-[#0035C1] to-[#0575FF] hover:scale-[1.02] active:scale-[0.98] cursor-pointer text-white"
                                    : "text-brand-mute hover:bg-brand-bg hover:text-brand-navy"
                            )}
                        >
                            {s}
                        </button>
                    ))}
                </div>

                <div className="relative w-full lg:w-72 2xl:w-96">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-3.5 xl:size-4 text-brand-body/40" />
                    <input
                        type="text"
                        placeholder="Search project title or ID..."
                        className="w-full h-10 xl:h-11 pl-11 xl:pl-12 pr-6 bg-brand-bg/50 border border-transparent rounded-full text-[11px] xl:text-[12px] font-bold text-brand-navy focus:bg-white focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/5 outline-none transition-all placeholder:text-brand-mute/60"
                    />
                </div>
            </div>

            {banners.length === 0 ? (
                <div className="w-full flex-1 min-h-[400px] flex flex-col items-center justify-center gap-6 text-center">
                    <div className="size-24 bg-white rounded-3xl flex items-center justify-center shadow-md border border-brand-stroke">
                        <ImageIcon size={32} className="text-brand-navy opacity-30" />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-brand-navy text-[18px] font-black uppercase tracking-widest">No Banners Found</h3>
                        <p className="text-brand-body text-[13px] font-semibold opacity-60 max-w-[350px] mx-auto leading-relaxed">
                            Your studio workspace is empty. Start by placing an order for a premium roll-up banner.
                        </p>
                    </div>
                    <button 
                        onClick={onCreateNew}
                        className="px-8 h-12 bg-brand-navy text-white rounded-full font-black text-[12px] uppercase tracking-widest hover:bg-brand-blue transition-all active:scale-95 shadow-lg shadow-brand-navy/10"
                    >
                        Place Order
                    </button>
                </div>
            ) : filteredBanners.length === 0 ? (
                <div className="w-full flex-1 min-h-[400px] flex flex-col items-center justify-center gap-6 text-center animate-reveal">
                <div className="size-20 flex items-center justify-center mb-2">
                        <Image src="/dashboard/clipboard.svg" alt="Empty State" width={100} height={100} />
                    </div>
                    <div className="space-y-1.5">
                        <h3 className="text-brand-navy text-[14px] font-black">No {filter.toLowerCase()} banners</h3>
                        <p className="text-brand-body text-[12px] font-medium opacity-50 max-w-[280px] mx-auto">
                            We couldn't find any results for this category in your production history.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 xl:gap-8">
                    {filteredBanners.map((banner) => (
                        <BannerCard 
                            key={banner.id} 
                            banner={banner} 
                            onPreview={() => setSelectedBanner(banner)}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
