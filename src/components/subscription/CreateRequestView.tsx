"use client";

import { useState, useRef, useEffect } from "react";
import {
    ArrowLeft,
    Upload,
    Type,
    FileText,
    GalleryHorizontal,
    Megaphone,
    Mail,
    Share2,
    Image as ImageIcon,
    CheckCircle2,
    Bold,
    Italic,
    Underline as UnderlineIcon,
    List,
    SpellCheck,
    AlertCircle,
    Loader2,
    Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AssetHub } from "../shared/AssetHub";

// ─────────────────────────────────────────────────────
// Rich Text Editor with formatting + sentence check
// ─────────────────────────────────────────────────────
interface SentenceIssue {
    message: string;
    offset: number;
    length: number;
    suggestions: string[];
}

const RichTextEditor = ({
    value,
    onChange,
    placeholder,
    disabled,
}: {
    value: string;
    onChange: (html: string, plainText: string) => void;
    placeholder?: string;
    disabled?: boolean;
}) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const [issues, setIssues] = useState<SentenceIssue[]>([]);
    const [isChecking, setIsChecking] = useState(false);
    const [checkedAt, setCheckedAt] = useState<Date | null>(null);
    const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());

    // Initialize content once
    useEffect(() => {
        if (editorRef.current && !editorRef.current.innerHTML && value) {
            editorRef.current.innerHTML = value;
        }
    }, []);

    const updateActiveFormats = () => {
        const next = new Set<string>();
        if (document.queryCommandState("bold")) next.add("bold");
        if (document.queryCommandState("italic")) next.add("italic");
        if (document.queryCommandState("underline")) next.add("underline");
        if (document.queryCommandState("insertUnorderedList")) next.add("ul");
        setActiveFormats(next);
    };

    const handleInput = () => {
        if (!editorRef.current) return;
        const html = editorRef.current.innerHTML;
        const text = editorRef.current.innerText || "";
        onChange(html, text);
        updateActiveFormats();
    };

    const exec = (command: string) => {
        document.execCommand(command, false);
        editorRef.current?.focus();
        updateActiveFormats();
        handleInput();
    };

    const checkGrammar = async () => {
        if (!editorRef.current) return;
        const text = editorRef.current.innerText.trim();
        if (!text) {
            setIssues([]);
            return;
        }
        setIsChecking(true);
        try {
            // LanguageTool public API — free, no key needed
            const params = new URLSearchParams({ text, language: "en-US" });
            const res = await fetch("https://api.languagetool.org/v2/check", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: params.toString(),
            });
            if (res.ok) {
                const data = await res.json();
                const found: SentenceIssue[] = (data.matches || []).map((m: any) => ({
                    message: m.message,
                    offset: m.offset,
                    length: m.length,
                    suggestions: (m.replacements || []).slice(0, 3).map((r: any) => r.value),
                }));
                setIssues(found);
                setCheckedAt(new Date());
            }
        } catch (e) {
            console.error("Sentence check failed:", e);
        } finally {
            setIsChecking(false);
        }
    };

    const tools = [
        { key: "bold", icon: <Bold className="w-3.5 h-3.5" />, action: () => exec("bold"), label: "Bold (Ctrl+B)" },
        { key: "italic", icon: <Italic className="w-3.5 h-3.5" />, action: () => exec("italic"), label: "Italic (Ctrl+I)" },
        { key: "underline", icon: <UnderlineIcon className="w-3.5 h-3.5" />, action: () => exec("underline"), label: "Underline (Ctrl+U)" },
        { key: "ul", icon: <List className="w-3.5 h-3.5" />, action: () => exec("insertUnorderedList"), label: "Bullet list" },
    ];

    return (
        <div className="border border-brand-stroke/50 rounded-[10px] lg:rounded-[14px] xl:rounded-[16px] bg-brand-bg overflow-hidden focus-within:border-brand-blue/30 focus-within:bg-white transition-all">
            {/* Toolbar */}
            <div className="flex items-center gap-1 px-2 py-2 border-b border-brand-stroke/40 bg-white/50">
                {tools.map(t => (
                    <button
                        key={t.key}
                        type="button"
                        title={t.label}
                        onMouseDown={(e) => { e.preventDefault(); t.action(); }}
                        className={cn(
                            "p-1.5 rounded-md transition",
                            activeFormats.has(t.key)
                                ? "bg-brand-blue text-white"
                                : "text-brand-mute hover:bg-brand-bg hover:text-brand-navy"
                        )}
                    >
                        {t.icon}
                    </button>
                ))}
                <div className="w-px h-5 bg-brand-stroke/40 mx-1" />
                <button
                    type="button"
                    onClick={checkGrammar}
                    disabled={isChecking || disabled}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold text-brand-blue hover:bg-brand-blue/5 transition disabled:opacity-50"
                >
                    {isChecking ? <Loader2 className="w-3 h-3 animate-spin" /> : <SpellCheck className="w-3 h-3" />}
                    {isChecking ? "Checking..." : "Check Sentence"}
                </button>
                {checkedAt && !isChecking && (
                    <span className={cn("text-[10px] font-medium ml-auto pr-2", issues.length === 0 ? "text-emerald-500" : "text-amber-500")}>
                        {issues.length === 0 ? (
                            <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Looks good</span>
                        ) : (
                            <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {issues.length} issue{issues.length !== 1 ? "s" : ""}</span>
                        )}
                    </span>
                )}
            </div>

            {/* Editable area */}
            <div
                ref={editorRef}
                contentEditable={!disabled}
                onInput={handleInput}
                onKeyUp={updateActiveFormats}
                onMouseUp={updateActiveFormats}
                data-placeholder={placeholder}
                className={cn(
                    "min-h-[140px] lg:min-h-[180px] p-3.5 lg:p-4 text-brand-navy font-medium outline-none text-[12px] lg:text-[14px] xl:text-[15px] 2xl:text-[16px] leading-relaxed",
                    "[&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-brand-mute [&:empty]:before:font-normal",
                    "focus:outline-none",
                    disabled && "opacity-50"
                )}
                suppressContentEditableWarning
            />

            {/* Issues panel */}
            {issues.length > 0 && (
                <div className="border-t border-brand-stroke/40 bg-amber-50/40 p-3 max-h-[140px] overflow-y-auto space-y-2">
                    {issues.map((issue, i) => (
                        <div key={i} className="flex items-start gap-2 text-[11px]">
                            <AlertCircle className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-brand-navy font-medium">{issue.message}</p>
                                {issue.suggestions.length > 0 && (
                                    <p className="text-brand-mute mt-0.5">
                                        Try: <span className="text-emerald-600 font-semibold">{issue.suggestions.join(", ")}</span>
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

interface CreateRequestViewProps {
    onBack: () => void;
    onSubmit: (data: any) => void;
    uploadedFiles: any[];
    onUpdateFiles: (files: any[]) => void;
    onFileUpload?: (file: File, index: number, customSetter?: (updater: (prev: any[]) => any[]) => void) => Promise<void>;
    onFileRemoved?: (file: any, index: number) => Promise<void>;
    onCancelUpload?: (index: number) => void;
    isSubmitting?: boolean;
}

const CATEGORIES = [
    { id: "carousel", name: "Carousel", icon: <GalleryHorizontal className="w-5 h-5 xl:w-6 xl:h-6 2xl:w-7 2xl:h-7" /> },
    { id: "social_post", name: "Social Post", icon: <ImageIcon className="w-5 h-5 xl:w-6 xl:h-6 2xl:w-7 2xl:h-7" /> },
    { id: "ad", name: "Ad Design", icon: <Megaphone className="w-5 h-5 xl:w-6 xl:h-6 2xl:w-7 2xl:h-7" /> },
    { id: "email", name: "Email Template", icon: <Mail className="w-5 h-5 xl:w-6 xl:h-6 2xl:w-7 2xl:h-7" /> },
    { id: "social", name: "Social Media", icon: <Share2 className="w-5 h-5 xl:w-6 xl:h-6 2xl:w-7 2xl:h-7" /> },
    { id: "other", name: "Other Design", icon: <Type className="w-5 h-5 xl:w-6 xl:h-6 2xl:w-7 2xl:h-7" /> },
];

export const CreateRequestView = ({
    onBack,
    onSubmit,
    uploadedFiles,
    onUpdateFiles,
    onFileUpload,
    onFileRemoved,
    onCancelUpload,
    isSubmitting = false
}: CreateRequestViewProps) => {
    const [title, setTitle] = useState("");
    const [category, setCategory] = useState("carousel");
    const [description, setDescription] = useState("");
    const isUploading = uploadedFiles.some(f => f.status === "uploading");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit({
            title,
            category,
            description,
            files: uploadedFiles
        });
    };

    return (
        <div className="w-full h-full bg-[#f4f6fb] overflow-y-auto premium-scrollbar px-3 xl:px-[24px] 2xl:px-[32px] pb-[20px] xl:pb-[32px]">
            {/* Header Area Container */}
            <div className="max-w-[800px] mx-auto w-full px-1">
                <div className="mt-3 lg:mt-5 xl:mt-[24px] bg-white border border-brand-stroke rounded-[10px] lg:rounded-[16px] xl:rounded-[20px] p-2.5 lg:p-4 xl:p-[16px] 2xl:p-[20px] flex flex-row items-center justify-between gap-3 lg:gap-4 sticky top-4 z-50 shadow-sm border-b-2">
                    <div className="flex items-center gap-2 lg:gap-3 xl:gap-[16px] 2xl:gap-[24px]">
                        <button
                            onClick={onBack}
                            className="w-6 h-6 lg:w-8 lg:h-8 xl:w-[36px] xl:h-[36px] 2xl:w-[42px] 2xl:h-[42px] flex items-center justify-center hover:bg-brand-bg rounded-full transition-all cursor-pointer group shrink-0"
                        >
                            <ArrowLeft size={16} className="text-brand-navy group-hover:-translate-x-1 transition-transform lg:w-4 lg:h-4 xl:w-[20px] xl:h-[20px] 2xl:w-[24px] 2xl:h-[24px]" />
                        </button>
                        <div className="flex flex-col">
                            <h1 className="text-brand-navy text-[15px] lg:text-[18px] xl:text-[22px] 2xl:text-[24px] font-bold leading-tight">New Design Request</h1>
                            <p className="text-brand-mute text-[9px] lg:text-[11px] xl:text-[13px] 2xl:text-[14px] font-medium tracking-tight mt-0.5 lg:mt-1">Fill in the details for your next design project</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-3 lg:mt-5 xl:mt-6 max-w-[800px] mx-auto px-1">
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 lg:gap-5">

                    {/* Main Detail Card */}
                    <div className="bg-white rounded-[10px] lg:rounded-[16px] xl:rounded-[20px] border border-brand-stroke p-3 lg:p-5 xl:p-[24px] 2xl:p-[32px] flex flex-col gap-5 lg:gap-6 xl:gap-[24px] shadow-sm">

                        {/* Project Title */}
                        <div className="flex flex-col gap-1.5 lg:gap-2.5 xl:gap-[12px]">
                            <label className="text-brand-navy text-[13px] lg:text-[15px] xl:text-[16px] 2xl:text-[18px] font-bold flex items-center gap-2 lg:gap-2.5">
                                <Type size={14} className="text-brand-blue lg:w-4 lg:h-4 xl:w-[18px] xl:h-[18px] 2xl:w-[20px] 2xl:h-[20px]" />
                                Project Title
                            </label>
                            <input
                                type="text"
                                required
                                disabled={isSubmitting}
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="e.g. Fintech Dashboard Redesign"
                                className="w-full h-[40px] lg:h-[48px] xl:h-[52px] 2xl:h-[56px] bg-brand-bg border border-brand-stroke/50 rounded-[8px] lg:rounded-[12px] xl:rounded-[14px] px-3 lg:px-4 xl:px-[16px] text-brand-navy font-medium outline-none focus:border-brand-blue/30 focus:bg-white transition-all text-[12px] lg:text-[14px] xl:text-[15px] 2xl:text-[16px] disabled:opacity-50"
                            />
                        </div>

                        {/* Category Selection */}
                        <div className="flex flex-col gap-1.5 lg:gap-2.5 xl:gap-[12px]">
                            <label className="text-brand-navy text-[13px] lg:text-[15px] xl:text-[16px] 2xl:text-[18px] font-bold flex items-center gap-2 lg:gap-2.5">
                                <Layout size={14} className="text-brand-blue lg:w-4 lg:h-4 xl:w-[18px] xl:h-[18px] 2xl:w-[20px] 2xl:h-[20px]" />
                                Design Category
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-[6px] lg:gap-[8px] xl:gap-[10px] 2xl:gap-[14px]">
                                {CATEGORIES.map((cat) => (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        disabled={isSubmitting}
                                        onClick={() => setCategory(cat.id)}
                                        className={cn(
                                            "flex flex-col items-center justify-center gap-1.5 lg:gap-2 xl:gap-2.5 p-1.5 lg:p-3 xl:p-4 xl:aspect-square rounded-[8px] lg:rounded-[12px] xl:rounded-[14px] border transition-all cursor-pointer",
                                            category === cat.id
                                                ? "bg-brand-blue/5 border-brand-blue text-brand-blue shadow-sm scale-[1.02]"
                                                : "border-brand-stroke text-brand-mute hover:border-brand-blue/30 hover:bg-brand-bg/50",
                                            isSubmitting && "opacity-50 cursor-not-allowed"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-7 h-7 lg:w-8 lg:h-8 xl:w-[40px] xl:h-[40px] 2xl:w-[48px] 2xl:h-[48px] rounded-full flex items-center justify-center",
                                            category === cat.id ? "bg-brand-blue text-white" : "bg-brand-bg text-brand-mute"
                                        )}>
                                            {cat.icon}
                                        </div>
                                        <span className="text-[9px] lg:text-[10px] xl:text-[11px] 2xl:text-[12px] font-bold text-center leading-tight">{cat.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Design Content (rich text + sentence check) */}
                        <div className="flex flex-col gap-1.5 lg:gap-2.5 xl:gap-[12px]">
                            <label className="text-brand-navy text-[13px] lg:text-[15px] xl:text-[16px] 2xl:text-[18px] font-bold flex items-center gap-2 lg:gap-2.5">
                                <FileText size={14} className="text-brand-blue lg:w-4 lg:h-4 xl:w-[18px] xl:h-[18px] 2xl:w-[20px] 2xl:h-[20px]" />
                                Design Content
                            </label>
                            <RichTextEditor
                                value={description}
                                onChange={(html) => setDescription(html)}
                                placeholder="Describe your design needs in detail. Include goals, target audience, and any specific requirements..."
                                disabled={isSubmitting}
                            />
                        </div>

                        {/* File Upload Integrated with AssetHub logic */}
                        <div className="flex flex-col gap-1.5 lg:gap-2.5 xl:gap-[12px]">
                            <div className="flex items-center justify-between">
                                <label className="text-brand-navy text-[13px] lg:text-[15px] xl:text-[16px] 2xl:text-[18px] font-bold flex items-center gap-2 lg:gap-2.5">
                                    <Upload size={14} className="text-brand-blue lg:w-4 lg:h-4 xl:w-[18px] xl:h-[18px] 2xl:w-[20px] 2xl:h-[20px]" />
                                    Reference & Assets
                                    <span className="text-brand-mute text-[9px] lg:text-[11px] xl:text-[12px] font-normal ml-2">(Optional)</span>
                                </label>
                                <span className="text-brand-mute text-[9px] lg:text-[11px] font-medium">{uploadedFiles.length} / 5</span>
                            </div>

                            <AssetHub
                                files={uploadedFiles}
                                onUpdateFiles={onUpdateFiles}
                                onFileAdded={onFileUpload}
                                onFileRemoved={onFileRemoved}
                                onCancelUpload={onCancelUpload}
                                maxFiles={5}
                                maxSizeMB={5}
                                title="Click to upload or drag and drop reference assets"
                                description="Vector preferred · SVG, AI, EPS, PDF, PNG (max 5MB each)"
                                icon="upload"
                            />
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row items-center gap-2.5 lg:gap-3.5 pt-1 lg:pt-3 xl:pt-[16px]">
                        <button
                            type="button"
                            onClick={onBack}
                            className="w-full sm:flex-1 h-9 lg:h-11 xl:h-[48px] 2xl:h-[54px] bg-white border border-brand-stroke text-brand-navy rounded-full font-bold text-[13px] lg:text-[15px] xl:text-[16px] 2xl:text-[18px] hover:bg-brand-bg transition-all active:scale-95"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!title || !description || isUploading || isSubmitting}
                            className={cn(
                                "w-full sm:flex-2 h-9 lg:h-11 xl:h-[48px] 2xl:h-[54px] rounded-full flex items-center justify-center gap-2 lg:gap-3 text-white font-bold text-[13px] lg:text-[15px] xl:text-[16px] 2xl:text-[18px] transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_5px_12px_rgba(0,53,193,0.15)] cursor-pointer",
                                (isUploading || isSubmitting) ? "opacity-50 cursor-not-allowed" : ""
                            )}
                            style={{ background: "linear-gradient(167.88deg, #0035C1 8.83%, #0575FF 86.3%)" }}
                        >
                            {isUploading ? "Uploading..." : isSubmitting ? "Submitting..." : (
                                <>
                                    <CheckCircle2 size={16} className="lg:w-4 lg:h-4 xl:w-[20px] xl:h-[20px]" />
                                    Submit Request
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
