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
    Trash2,
    XCircle,
    History,
    MessageCircle,
    Check,
    Send,
    Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";
import Link from "next/link";

// --- Types ---

type BannerStatus = "AWAITING_QUOTE" | "AWAITING_PAYMENT" | "PENDING" | "ACTIVE" | "DRAFT" | "SCHEDULED" | "ARCHIVED" | "COMPLETED" | "CANCELLED";

interface Banner {
    id: string;
    display_id: string;
    title: string;
    status: BannerStatus;
    size: string;
    is_custom?: boolean;
    quality: string;
    environment: string;
    updated_at: string;
    created_at: string;
    quantity: number;
    artwork_preview_url?: string | null;
    design_brief?: string | null;
    fulfillment_type: string;
    street_address?: string | null;
    city?: string | null;
    state?: string | null;
    pickup_station?: string | null;
    recipient_name?: string | null;
    draft_step?: number;
    ready_file_urls?: string[];
    invoice_number?: string | null;
    invoice_public_token?: string | null;
    invoice_status?: string | null;
}

interface BannerActivity {
    id: string;
    title: string;
    detail: string | null;
    actor: string;
    occurredAt: string;
    kind: string;
}

const BannerArtwork = ({ banner, className = "object-cover" }: { banner: Banner; className?: string }) => {
    const [failed, setFailed] = useState(false);

    React.useEffect(() => setFailed(false), [banner.artwork_preview_url]);

    if (!banner.artwork_preview_url || failed) {
        return (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-50 px-6 text-center">
                <ImageIcon className="h-7 w-7 text-slate-300" />
                <span className="text-[10px] font-bold text-slate-400">
                    {failed ? "Artwork preview unavailable" : "Artwork not uploaded"}
                </span>
            </div>
        );
    }

    return (
        <Image
            src={banner.artwork_preview_url}
            alt={banner.title}
            fill
            unoptimized
            onError={() => setFailed(true)}
            className={className}
        />
    );
};

// --- Sub-components ---

const StatusBadge = ({ status }: { status: BannerStatus }) => {
    const styles = {
        AWAITING_QUOTE: "bg-orange-50 text-orange-700 border-orange-100",
        AWAITING_PAYMENT: "bg-sky-50 text-sky-700 border-sky-100",
        PENDING: "bg-amber-50 text-amber-600 border-amber-100",
        ACTIVE: "bg-green-50 text-green-600 border-green-100",
        DRAFT: "bg-gray-50 text-gray-500 border-gray-100",
        SCHEDULED: "bg-blue-50 text-blue-600 border-blue-100",
        ARCHIVED: "bg-orange-50 text-orange-600 border-orange-100",
        COMPLETED: "bg-purple-50 text-purple-600 border-purple-100",
        CANCELLED: "bg-red-50 text-red-600 border-red-100",
    };

    return (
        <div className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold", styles[status])}>
            {status.toLowerCase().replaceAll("_", " ")}
        </div>
    );
};

// Premium Preview Side Drawer
const BannerDetailPreview = ({ banner, onClose, onCancel, onRequestEdit, onViewLog }: { banner: Banner; onClose: () => void; onCancel: (id: string) => void; onRequestEdit: (banner: Banner) => void; onViewLog: (banner: Banner) => void }) => {
    const canCancel = (banner.status === "AWAITING_PAYMENT" || banner.status === "AWAITING_QUOTE") && banner.invoice_status !== "paid";
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
                        <span className="text-[10px] font-semibold text-brand-blue">{banner.display_id}</span>
                        <h2 className="max-w-[300px] truncate text-[18px] font-bold leading-tight text-brand-navy xl:text-[22px]">{banner.title}</h2>
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
                        {banner.artwork_preview_url ? (
                            <BannerArtwork banner={banner} className="object-contain p-4" />
                        ) : (
                            <div className="text-center space-y-4 opacity-30 px-10">
                                <div className="size-20 xl:size-24 bg-white rounded-3xl mx-auto flex items-center justify-center shadow-md">
                                    <ImageIcon size={32} className="text-brand-mute" />
                                </div>
                                <p className="text-[13px] font-semibold text-brand-navy">Artwork not uploaded</p>
                                <p className="text-brand-body text-[11px] font-medium leading-relaxed italic">The original print design will appear here when it is attached.</p>
                            </div>
                        )}

                        <div className="absolute bottom-6 right-6">
                            <StatusBadge status={banner.status} />
                        </div>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 gap-6">
                        <div className="bg-brand-bg rounded-2xl p-5 space-y-3">
                            <h3 className="text-[12px] font-semibold text-brand-navy/60">Specifications</h3>
                            <div className="space-y-4">
                                <div className="space-y-0.5">
                                    <p className="text-[10px] font-medium text-brand-mute">Dimensions</p>
                                    <p className="text-[15px] font-semibold text-brand-navy">{banner.is_custom ? banner.size : `${banner.size} cm`}</p>
                                </div>
                                <div className="space-y-0.5">
                                    <p className="text-[10px] font-medium text-brand-mute">Quality grade</p>
                                    <p className="text-[15px] font-semibold text-brand-navy">{banner.quality}</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-brand-bg rounded-2xl p-5 space-y-3">
                            <h3 className="text-[12px] font-semibold text-brand-navy/60">Fulfilment</h3>
                            <div className="space-y-4">
                                <div className="space-y-0.5">
                                    <p className="text-[10px] font-medium text-brand-mute">Usage environment</p>
                                    <p className="text-[15px] font-semibold text-brand-navy">{banner.environment}</p>
                                </div>
                                <div className="space-y-0.5">
                                    <p className="text-[10px] font-medium text-brand-mute">Delivery type</p>
                                    <p className="text-[15px] font-semibold capitalize text-brand-navy">{banner.fulfillment_type}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Brief & Notes */}
                    <div className="space-y-4 p-1">
                        <div className="flex items-center gap-2.5 text-brand-blue">
                            <FileText size={16} />
                            <h3 className="text-[14px] font-semibold text-brand-navy">Project brief</h3>
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
                            <h3 className="text-[14px] font-semibold text-brand-navy">Delivery details</h3>
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
                                <p className="text-[11px] font-medium text-brand-mute">{banner.state}, Nigeria</p>
                                <div className="pt-2 flex flex-col gap-0.5">
                                    <p className="text-[10px] font-medium text-brand-mute">Recipient</p>
                                    <p className="text-[12px] font-bold text-brand-navy">{banner.recipient_name || "Authorized Client"}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-6 xl:p-8 border-t border-brand-stroke glass flex gap-3">
                    {canCancel && (
                        <button onClick={() => onCancel(banner.id)} className="h-12 flex-1 rounded-[12px] border border-red-200 bg-white text-[12px] font-semibold text-red-600 shadow-sm transition-all hover:bg-red-50 active:scale-95">
                            Cancel order
                        </button>
                    )}
                    <button onClick={() => onRequestEdit(banner)} className="flex-1 h-12 bg-white border border-brand-stroke text-brand-navy rounded-[12px] font-semibold text-[12px] hover:bg-brand-bg transition-all active:scale-95 shadow-sm">
                        Request edit
                    </button>
                    <button onClick={() => onViewLog(banner)} className="flex-1 h-12 bg-brand-navy text-white rounded-[12px] font-semibold text-[12px] hover:bg-brand-blue transition-all active:scale-95 shadow-md shadow-brand-navy/10">
                        View activity log
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

const BannerCard = ({ 
    banner, 
    onPreview, 
    onDelete,
    onCancel,
}: { 
    banner: Banner; 
    onPreview: () => void;
    onDelete: (id: string) => void;
    onCancel: (id: string) => void;
}) => {
    const isEditable = banner.status === "DRAFT";
    const canCancel = (banner.status === "AWAITING_PAYMENT" || banner.status === "AWAITING_QUOTE") && banner.invoice_status !== "paid";

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="group bg-white border border-brand-stroke rounded-[16px] xl:rounded-[20px] overflow-hidden hover:shadow-xl hover:shadow-brand-navy/5 transition-all duration-300"
        >
            {/* Thumbnail Placeholder - Wide aspect for drastic height reduction */}
            <div className="relative aspect-[16/9] bg-brand-bg flex items-center justify-center overflow-hidden border-b border-brand-stroke">
                <div className="absolute inset-0 bg-brand-navy/0 group-hover:bg-brand-navy/10 transition-colors duration-300" />
                
                <BannerArtwork banner={banner} className="object-contain p-3 group-hover:scale-[1.02] transition-transform duration-500" />

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
                    <h3 className="truncate text-[14px] font-bold leading-tight text-brand-navy xl:text-[15px]">{banner.title}</h3>
                    <p className="text-[11px] font-medium text-brand-mute">{banner.environment} · {banner.quality}</p>
                </div>

                {/* Metadata Columnar */}
                <div className="grid grid-cols-2 gap-2 pb-2 border-b border-brand-stroke border-dashed">
                    <div className="space-y-0.5">
                        <p className="text-[10px] font-medium text-brand-mute">Size</p>
                        <p className="text-[12px] font-semibold text-brand-navy">{banner.is_custom ? banner.size : `${banner.size} cm`}</p>
                    </div>
                    <div className="space-y-0.5">
                        <p className="text-[10px] font-medium text-brand-mute">Updated</p>
                        <p className="text-[12px] font-semibold text-brand-navy">{new Date(banner.updated_at).toLocaleDateString()}</p>
                    </div>
                </div>
                
                <div className="flex items-center justify-between pt-1">
                    <StatusBadge status={banner.status} />
                </div>

                {/* Actions Footer */}
                <div className="flex items-center gap-2 pt-1">
                    {banner.status === "AWAITING_PAYMENT" && banner.invoice_public_token && (
                        <Link
                            href={`/invoice/${banner.invoice_public_token}#payment`}
                            className="flex h-9 flex-1 items-center justify-center rounded-[10px] border border-[#0A4FE8] bg-white text-[11px] font-semibold text-[#0A4FE8] transition hover:bg-blue-50 active:scale-95"
                        >
                            Pay now
                        </Link>
                    )}
                    <button 
                        onClick={onPreview}
                        className="flex h-9 flex-1 items-center justify-center gap-2 rounded-[10px] bg-[#0A4FE8] text-[11px] font-semibold text-white transition-all active:scale-95"
                    >
                        Preview
                    </button>
                    {isEditable && (
                        <button className="size-9 rounded-full bg-brand-blue text-white flex items-center justify-center hover:bg-brand-navy transition-all active:scale-95 shadow-md shadow-brand-blue/10">
                            <Pencil className="size-4" />
                        </button>
                    )}
                </div>
                {canCancel && (
                    <button
                        type="button"
                        onClick={() => onCancel(banner.id)}
                        className="flex h-9 w-full items-center justify-center gap-2 rounded-[10px] border border-red-200 text-[10px] font-semibold text-red-600 transition hover:bg-red-50 active:scale-95"
                    >
                        <XCircle className="h-3.5 w-3.5" />
                        Cancel unpaid order
                    </button>
                )}
            </div>
        </motion.div>
    );
};

const DraftCard = ({ banner, onContinue, onDelete }: { banner: Banner; onContinue: () => void; onDelete: (id: string) => void }) => {
    const step = Math.max(1, Math.min(3, Number(banner.draft_step) || 1));
    const artworkCount = Array.isArray(banner.ready_file_urls) ? banner.ready_file_urls.length : 0;
    return (
        <article className="overflow-hidden rounded-[20px] border border-blue-100 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-md">
            <div className="flex min-h-[132px] gap-4 p-4 sm:p-5">
                <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
                    {banner.artwork_preview_url ? <BannerArtwork banner={banner} className="object-contain p-1" /> : <div className="grid h-full place-items-center"><FileText className="h-6 w-6 text-slate-300" /></div>}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><p className="text-[10px] font-semibold text-[#0A4FE8]">Saved draft · Step {step} of 3</p><h3 className="mt-1 truncate text-[15px] font-bold text-brand-navy">{banner.title}</h3></div>
                        <button type="button" onClick={() => onDelete(banner.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-red-100 text-red-500 transition hover:bg-red-50" aria-label={`Delete draft ${banner.title}`}><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-semibold text-slate-500"><span>{banner.is_custom ? banner.size : `${banner.size} cm`}</span><span>{artworkCount} artwork{artworkCount === 1 ? "" : "s"}</span><span>Saved {new Date(banner.updated_at).toLocaleString()}</span></div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#0A4FE8]" style={{ width: `${(step / 3) * 100}%` }} /></div>
                </div>
            </div>
            <button type="button" onClick={onContinue} className="flex h-11 w-full items-center justify-center gap-2 border-t border-blue-100 bg-blue-50/60 text-[11px] font-semibold text-[#0A4FE8] transition hover:bg-blue-100"><Pencil className="h-3.5 w-3.5" />Continue draft</button>
        </article>
    );
};

// --- Main Component ---

export const BannersDashboard = ({ 
    banners,
    onUpdate,
    onCreateNew,
    onContinueDraft,
}: { 
    banners: Banner[];
    onUpdate: () => void;
    onCreateNew: () => void;
    onContinueDraft: (id: string) => void;
}) => {
    const [filter, setFilter] = useState<BannerStatus | "ALL">("ALL");
    const [selectedBanner, setSelectedBanner] = useState<Banner | null>(null);
    const [search, setSearch] = useState("");
    const [editBanner, setEditBanner] = useState<Banner | null>(null);
    const [editMessage, setEditMessage] = useState("");
    const [submittingEdit, setSubmittingEdit] = useState(false);
    const [logBanner, setLogBanner] = useState<Banner | null>(null);
    const [activity, setActivity] = useState<BannerActivity[]>([]);
    const [loadingActivity, setLoadingActivity] = useState(false);

    const normalizedSearch = search.trim().toLowerCase();
    const matchesSearch = (banner: Banner) => !normalizedSearch || banner.title.toLowerCase().includes(normalizedSearch) || banner.display_id.toLowerCase().includes(normalizedSearch);
    const drafts = banners.filter((banner) => banner.status === "DRAFT" && matchesSearch(banner));
    const submittedBanners = banners.filter((banner) => banner.status !== "DRAFT");
    const filteredBanners = submittedBanners.filter((banner) => (filter === "ALL" || banner.status === filter) && matchesSearch(banner));
    const showDrafts = filter === "ALL" || filter === "DRAFT";
    const showSubmitted = filter !== "DRAFT";

    const stats = {
        total: submittedBanners.length,
        active: banners.filter(b => b.status === "ACTIVE").length,
        pending: banners.filter(b => b.status === "PENDING").length,
        drafts: banners.filter(b => b.status === "DRAFT").length,
    };

    const handleDelete = async (id: string) => {
        if (!(await appConfirm("Are you sure you want to delete this draft?"))) return;
        
        try {
            const res = await fetch(`/api/banners?id=${id}`, { method: "DELETE" });
            if (res.ok) {
                onUpdate(); // Trigger refresh in parent
            }
        } catch (err) {
            console.error("Delete error:", err);
        }
    };

    const handleCancel = async (id: string) => {
        if (!(await appConfirm("Cancel this unpaid order? Its linked invoice will also be cancelled. This cannot be undone."))) return;

        try {
            const response = await fetch(`/api/banners/${id}/cancel`, { method: "POST" });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                await appAlert(payload.error || "The order could not be cancelled.");
                return;
            }
            setSelectedBanner(null);
            onUpdate();
        } catch (error) {
            console.error("Cancel error:", error);
            await appAlert("The order could not be cancelled. Please try again.");
        }
    };

    const openEditRequest = (banner: Banner) => {
        setEditBanner(banner);
        setEditMessage("");
    };

    const submitEditRequest = async () => {
        if (!editBanner || editMessage.trim().length < 10 || submittingEdit) return;
        setSubmittingEdit(true);
        try {
            const response = await fetch(`/api/banners/${editBanner.id}/edit-request`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: editMessage }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || "Could not submit the edit request.");
            setEditBanner(null);
            setEditMessage("");
            await appAlert("Your edit request has been sent to the CDS Space team. We will review it and keep you updated here.");
        } catch (error) {
            await appAlert(error instanceof Error ? error.message : "Could not submit the edit request.");
        } finally {
            setSubmittingEdit(false);
        }
    };

    const openActivityLog = async (banner: Banner) => {
        setLogBanner(banner);
        setActivity([]);
        setLoadingActivity(true);
        try {
            const response = await fetch(`/api/banners/${banner.id}/activity`, { cache: "no-store" });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || "Could not load the activity log.");
            setActivity(payload.items || []);
        } catch (error) {
            setLogBanner(null);
            await appAlert(error instanceof Error ? error.message : "Could not load the activity log.");
        } finally {
            setLoadingActivity(false);
        }
    };


    return (
        <div className="w-full max-w-[1640px] mx-auto space-y-6 lg:space-y-8 pb-20 px-4 lg:px-8 2xl:px-12 pt-4">
            <AnimatePresence>
                {selectedBanner && (
                    <BannerDetailPreview banner={selectedBanner} onClose={() => setSelectedBanner(null)} onCancel={handleCancel} onRequestEdit={openEditRequest} onViewLog={openActivityLog} />
                )}
            </AnimatePresence>

            {editBanner && (
                <div className="fixed inset-0 z-[120] grid place-items-center bg-[#06103A]/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Request a banner edit">
                    <div className="w-full max-w-[560px] rounded-[22px] border border-blue-100 bg-white p-5 shadow-2xl sm:p-6">
                        <div className="flex items-start gap-3">
                            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-blue-50 text-[#0A4FE8]"><MessageCircle className="h-5 w-5" /></span>
                            <div className="min-w-0 flex-1"><h2 className="text-[18px] font-bold text-brand-navy">Request an edit</h2><p className="mt-1 text-[12px] leading-5 text-slate-500">Tell us what should change on {editBanner.display_id}. Your request will be added to the order activity log for the production team.</p></div>
                            <button type="button" onClick={() => setEditBanner(null)} className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-slate-100 text-slate-500" aria-label="Close"><X className="h-4 w-4" /></button>
                        </div>
                        <label className="mt-5 block"><span className="mb-2 block text-[12px] font-semibold text-brand-navy">Requested change</span><textarea value={editMessage} onChange={(event) => setEditMessage(event.target.value)} maxLength={3000} rows={6} placeholder="For example: Please update the phone number on the artwork and use the attached blue logo." className="w-full resize-none rounded-[14px] border border-slate-200 px-4 py-3 text-[13px] leading-6 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>
                        <div className="mt-2 flex justify-between text-[10px] text-slate-400"><span>Minimum 10 characters</span><span>{editMessage.length}/3,000</span></div>
                        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setEditBanner(null)} className="h-11 rounded-[12px] border border-slate-200 px-5 text-[12px] font-semibold text-slate-600">Not now</button><button type="button" onClick={() => void submitEditRequest()} disabled={editMessage.trim().length < 10 || submittingEdit} className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] bg-[#0A4FE8] px-5 text-[12px] font-semibold text-white disabled:opacity-50">{submittingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send edit request</button></div>
                    </div>
                </div>
            )}

            {logBanner && (
                <div className="fixed inset-0 z-[120] flex justify-end bg-[#06103A]/40 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Banner activity log">
                    <div className="flex h-full w-full max-w-[520px] flex-col bg-white shadow-2xl">
                        <header className="flex items-start gap-3 border-b border-slate-100 p-5 sm:p-6"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-blue-50 text-[#0A4FE8]"><History className="h-5 w-5" /></span><div className="min-w-0 flex-1"><h2 className="text-[18px] font-bold text-brand-navy">Order activity</h2><p className="mt-1 text-[12px] text-slate-500">{logBanner.display_id} · {logBanner.title}</p></div><button type="button" onClick={() => setLogBanner(null)} className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-slate-100 text-slate-500" aria-label="Close"><X className="h-4 w-4" /></button></header>
                        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
                            {loadingActivity ? <div className="grid min-h-56 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]" /></div> : activity.length === 0 ? <div className="rounded-[16px] bg-slate-50 p-6 text-center text-[12px] text-slate-500">No activity has been recorded yet.</div> : <ol className="space-y-0">{activity.map((item, index) => <li key={item.id} className="relative grid grid-cols-[32px_1fr] gap-3 pb-6"><div className="relative"><span className="relative z-10 grid h-8 w-8 place-items-center rounded-full border border-blue-100 bg-blue-50 text-[#0A4FE8]">{item.kind === "payment" ? <Check className="h-3.5 w-3.5" /> : item.kind.startsWith("edit") ? <Pencil className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}</span>{index < activity.length - 1 && <span className="absolute left-1/2 top-8 h-[calc(100%-20px)] w-px -translate-x-1/2 bg-slate-200" />}</div><div className="rounded-[14px] border border-slate-100 bg-slate-50/70 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-[13px] font-semibold text-brand-navy">{item.title}</h3><time className="text-[10px] text-slate-400">{new Date(item.occurredAt).toLocaleString()}</time></div>{item.detail && <p className="mt-2 whitespace-pre-wrap text-[12px] leading-5 text-slate-600">{item.detail}</p>}<p className="mt-2 text-[10px] font-medium text-slate-400">By {item.actor}</p></div></li>)}</ol>}
                        </div>
                    </div>
                </div>
            )}

            {/* Header Section */}
            <div className="flex flex-col lg:flex-row xl:items-center justify-between gap-6">
                <div className="space-y-0.5 xl:space-y-1">
                    <h1 className="text-[24px] font-bold tracking-tight text-brand-navy xl:text-[32px]">Banner Studio</h1>
                    <p className="text-brand-body text-[13px] xl:text-[15px] font-medium tracking-tight opacity-70">Visual production management & roll-up banner fulfillment</p>
                </div>

                <button
                    onClick={onCreateNew}
                    className="group flex h-12 cursor-pointer items-center justify-center gap-3 rounded-[14px] bg-[#0A4FE8] px-8 text-[13px] font-semibold text-white shadow-xl shadow-brand-navy/10 transition-all hover:scale-[1.02] hover:bg-brand-blue active:scale-[0.98] xl:h-13 xl:text-[14px]"
                >
                    <Plus className="size-4 xl:size-5 text-white group-hover:rotate-90 transition-transform duration-300" />
                    Order new banner
                </button>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 xl:gap-6">
                {[
                    { label: "Submitted orders", value: stats.total, icon: ImageIcon, color: "text-brand-blue" },
                    { label: "Production", value: stats.active, icon: CheckCircle2, color: "text-brand-success" },
                    { label: "Pending", value: stats.pending, icon: Clock, color: "text-amber-500" },
                    { label: "Saved drafts", value: stats.drafts, icon: Calendar, color: "text-brand-mute" }
                ].map((stat, i) => (
                    <div key={i} className="bg-white border border-brand-stroke px-5 py-6 xl:px-7 xl:py-8 rounded-[24px] space-y-4 shadow-sm hover:shadow-md transition-shadow">
                        <div className={cn("size-10 2xl:size-11 rounded-xl bg-brand-bg flex items-center justify-center", stat.color)}>
                            <stat.icon size={20} />
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[11px] font-medium text-brand-mute">{stat.label}</p>
                            <p className="text-[24px] font-bold leading-none text-brand-navy xl:text-[32px]">{stat.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Toolbar - Optimized for 1280px */}
            <div className="flex flex-col lg:flex-row items-center justify-between gap-4 bg-white border border-brand-stroke p-2 xl:px-4 xl:py-2.5 rounded-[20px] xl:rounded-full">
                <div className="flex items-center gap-1 xl:gap-1.5 overflow-x-auto w-full xl:w-auto pb-2 xl:pb-0 scrollbar-hide scrollbar-hide">
                    {["ALL", "AWAITING_QUOTE", "AWAITING_PAYMENT", "PENDING", "ACTIVE", "DRAFT", "SCHEDULED", "COMPLETED", "CANCELLED"].map((s) => (
                        <button
                            key={s}
                            onClick={() => setFilter(s as any)}
                            className={cn(
                                "shrink-0 rounded-full px-4 py-2 text-[10px] font-semibold transition-all xl:px-6 xl:py-2.5 xl:text-[11px]",
                                filter === s
                                    ? "bg-[#0A4FE8] hover:scale-[1.02] active:scale-[0.98] cursor-pointer text-white"
                                    : "text-brand-mute hover:bg-brand-bg hover:text-brand-navy"
                            )}
                        >
                            {s.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase())}
                        </button>
                    ))}
                </div>

                <div className="relative w-full lg:w-72 2xl:w-96">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-3.5 xl:size-4 text-brand-body/40" />
                    <input
                        type="text"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search project title or ID..."
                        className="w-full h-10 xl:h-11 pl-11 xl:pl-12 pr-6 bg-brand-bg/50 border border-transparent rounded-full text-[11px] xl:text-[12px] font-bold text-brand-navy focus:bg-white focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/5 outline-none transition-all placeholder:text-brand-mute/60"
                    />
                </div>
            </div>

            {showDrafts && drafts.length > 0 && (
                <section className="rounded-[24px] border border-blue-100 bg-blue-50/40 p-4 sm:p-5 lg:p-6">
                    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-semibold text-[#0A4FE8]">Continue where you stopped</p><h2 className="mt-1 text-[19px] font-bold text-brand-navy">Saved drafts</h2><p className="mt-1 text-[11px] text-slate-500">Your unfinished banner orders are saved automatically.</p></div><span className="text-[10px] font-medium text-slate-400">{drafts.length} unfinished</span></div>
                    <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{drafts.map((banner) => <DraftCard key={banner.id} banner={banner} onContinue={() => onContinueDraft(banner.id)} onDelete={handleDelete} />)}</div>
                </section>
            )}

            {banners.length === 0 ? (
                <div className="w-full flex-1 min-h-[400px] flex flex-col items-center justify-center gap-6 text-center">
                    <div className="size-24 bg-white rounded-3xl flex items-center justify-center shadow-md border border-brand-stroke">
                        <ImageIcon size={32} className="text-brand-navy opacity-30" />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-[18px] font-bold text-brand-navy">No banners found</h3>
                        <p className="text-brand-body text-[13px] font-semibold opacity-60 max-w-[350px] mx-auto leading-relaxed">
                            Your studio workspace is empty. Start by placing an order for a premium roll-up banner.
                        </p>
                    </div>
                    <button 
                        onClick={onCreateNew}
                        className="h-12 rounded-[12px] bg-brand-navy px-8 text-[12px] font-semibold text-white shadow-lg shadow-brand-navy/10 transition-all hover:bg-brand-blue active:scale-95"
                    >
                        Place order
                    </button>
                </div>
            ) : showSubmitted && filteredBanners.length === 0 ? (
                <div className="w-full flex-1 min-h-[400px] flex flex-col items-center justify-center gap-6 text-center animate-reveal">
                <div className="size-20 flex items-center justify-center mb-2">
                        <Image src="/dashboard/clipboard.svg" alt="Empty State" width={100} height={100} />
                    </div>
                    <div className="space-y-1.5">
                        <h3 className="text-brand-navy text-[14px] font-black">{submittedBanners.length === 0 ? "No submitted banner orders yet" : `No ${filter.toLowerCase()} banners`}</h3>
                        <p className="text-brand-body text-[12px] font-medium opacity-50 max-w-[280px] mx-auto">
                            We couldn&apos;t find any results for this category in your production history.
                        </p>
                    </div>
                </div>
            ) : showSubmitted ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 xl:gap-8">
                    {filteredBanners.map((banner) => (
                        <BannerCard 
                            key={banner.id} 
                            banner={banner} 
                            onPreview={() => setSelectedBanner(banner)}
                            onDelete={handleDelete}
                            onCancel={handleCancel}
                        />
                    ))}
                </div>
            ) : drafts.length === 0 ? <div className="py-20 text-center text-[12px] font-semibold text-slate-400">No saved drafts match your search.</div> : null}
        </div>
    );
};
