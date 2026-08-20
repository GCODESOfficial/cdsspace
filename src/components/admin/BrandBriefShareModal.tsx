"use client";

import { useState } from "react";
import { appPrompt } from "@/lib/app-notify";
import {
    Check,
    Copy,
    X,
    Link2,
    FileText,
} from "lucide-react";
import { UniversalShareButton } from "@/components/share/UniversalShareButton";

export interface BrandBriefSharePayload {
    id: string;
    invite_label: string | null;
    invite_note: string | null;
    public_token: string;
    origin: string;
}

/**
 * Shown right after an admin requests a new Brand Brief. Pattern mirrors
 * InviteShareModal: header, link row with copy, and one-tap share to
 * WhatsApp / LinkedIn / Facebook / Email (platform share URLs; no SDK).
 */
export function BrandBriefShareModal({
    open,
    onClose,
    payload,
}: {
    open: boolean;
    onClose: () => void;
    payload: BrandBriefSharePayload | null;
}) {
    const [copied, setCopied] = useState(false);
    if (!open || !payload) return null;

    const briefUrl = `${payload.origin}/brand-brief/${payload.public_token}`;
    const label = payload.invite_label?.trim() || "your brand brief";
    const shareText = `Hey! Please fill out ${label} - no account needed, just tap the link: ${briefUrl}`;

    const copy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            appPrompt({ title: "Copy this link", message: "Select and copy the link below:", defaultValue: text, confirmLabel: "Done" });
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    className="relative p-6 text-white overflow-hidden"
                    style={{
                        backgroundImage: "linear-gradient(146.28deg, #0035C1 8.83%, #0575FF 86.3%)",
                    }}
                >
                    <div className="absolute -top-20 -right-20 w-60 h-60 bg-white/15 rounded-full blur-3xl" />
                    <div className="relative flex items-start justify-between">
                        <div>
                            <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center mb-3">
                                <FileText className="w-5 h-5" />
                            </div>
                            <h2 className="text-[20px] font-bold leading-tight">
                                Brief link ready to share
                            </h2>
                            <p className="text-white/80 text-[13px] mt-1">
                                Send this to your client - they can fill it without creating an account.
                            </p>
                        </div>
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10" aria-label="Close">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Link row */}
                <div className="p-6 space-y-3">
                    {payload.invite_label && (
                        <div className="rounded-xl border border-gray-200 bg-gray-50/50 px-3 py-2.5">
                            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Label</p>
                            <p className="text-[13px] font-semibold text-[#0D1B39] truncate">{payload.invite_label}</p>
                        </div>
                    )}
                    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/50 px-3 py-2.5">
                        <div className="w-8 h-8 rounded-lg bg-white border border-gray-100 text-[#0A4FE8] flex items-center justify-center shrink-0">
                            <Link2 className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">
                                Shareable brief link
                            </p>
                            <p className="text-[11px] font-mono font-semibold text-[#0D1B39] truncate">{briefUrl}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => copy(briefUrl)}
                            className="p-2 rounded-lg hover:bg-white text-gray-400 hover:text-[#0A4FE8] transition"
                            title="Copy link"
                        >
                            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                <div className="px-6 pb-6">
                    <UniversalShareButton
                        title={`Brand brief: ${label}`}
                        text={shareText}
                        url={briefUrl}
                        className="w-full border-transparent bg-[#0A4FE8] py-3.5 text-sm text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
                    />
                </div>

                {payload.invite_note && (
                    <div className="px-6 pb-6">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                            Internal note
                        </p>
                        <p className="text-[13px] text-[#0D1B39] bg-amber-50/60 border border-amber-100 rounded-xl p-3">
                            {payload.invite_note}
                        </p>
                    </div>
                )}

                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 text-[11px] text-gray-500 leading-relaxed">
                    Clients don't need an account. They'll land on a branded form, fill it in, and submit -
                    you'll see their answers in the Brand Briefs list the moment they're done.
                </div>
            </div>

        </div>
    );
}
