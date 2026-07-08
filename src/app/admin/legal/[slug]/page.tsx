"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
    ArrowLeft,
    Save,
    Download,
    Upload,
    Loader2,
    ExternalLink,
    Eye,
    Code,
    Wand2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { RichTextEditor } from "@/components/admin/RichTextEditor";

interface DocRow {
    slug: string;
    title: string;
    subtitle: string | null;
    content: string;
    effective_date: string;
    version: number;
    updated_at: string;
    updated_by: string | null;
}

type ViewMode = "visual" | "html" | "preview";

export default function LegalEditorPage() {
    const params = useParams();
    const router = useRouter();
    const slug = String(params?.slug ?? "");
    const { toast } = useToast();

    const [doc, setDoc] = useState<DocRow | null>(null);
    const [title, setTitle] = useState("");
    const [subtitle, setSubtitle] = useState("");
    const [effectiveDate, setEffectiveDate] = useState("");
    const [content, setContent] = useState("");

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [mode, setMode] = useState<ViewMode>("visual");

    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (slug !== "privacy" && slug !== "terms") {
            router.replace("/admin/legal");
            return;
        }

        fetch(`/api/admin/legal/${slug}`)
            .then(async (res) => {
                if (!res.ok) throw new Error("Failed to load");
                const json = await res.json();
                const d = json.document as DocRow;
                setDoc(d);
                setTitle(d.title);
                setSubtitle(d.subtitle ?? "");
                setEffectiveDate(d.effective_date);
                setContent(d.content);
            })
            .catch((e) => toast({ title: "Error", description: e.message, variant: "destructive" }))
            .finally(() => setLoading(false));
    }, [slug, router, toast]);

    async function handleSave() {
        setSaving(true);
        try {
            const res = await fetch(`/api/admin/legal/${slug}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: title.trim(),
                    subtitle: subtitle.trim() || null,
                    content,
                    effective_date: effectiveDate,
                }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Save failed");
            setDoc(json.document);
            toast({ title: "Saved", description: `v${json.document.version} is now live.`, variant: "success" });
        } catch (e) {
            const message = e instanceof Error ? e.message : "Save failed";
            toast({ title: "Error", description: message, variant: "destructive" });
        } finally {
            setSaving(false);
        }
    }

    async function handleDownload() {
        setDownloading(true);
        try {
            const res = await fetch(`/api/admin/legal/${slug}/download`);
            if (!res.ok) throw new Error("Download failed");
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download =
                res.headers
                    .get("Content-Disposition")
                    ?.match(/filename="?([^";]+)"?/)?.[1] ?? `${slug}.docx`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            const message = e instanceof Error ? e.message : "Download failed";
            toast({ title: "Error", description: message, variant: "destructive" });
        } finally {
            setDownloading(false);
        }
    }

    async function handleUpload(file: File) {
        setUploading(true);
        try {
            const form = new FormData();
            form.append("file", file);
            const res = await fetch(`/api/admin/legal/${slug}/upload`, { method: "POST", body: form });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Upload failed");
            const d = json.document as DocRow;
            setDoc(d);
            setTitle(d.title);
            setSubtitle(d.subtitle ?? "");
            setEffectiveDate(d.effective_date);
            setContent(d.content);
            toast({
                title: "Uploaded",
                description: `v${d.version} replaced from ${file.name}.`,
                variant: "success",
            });
        } catch (e) {
            const message = e instanceof Error ? e.message : "Upload failed";
            toast({ title: "Error", description: message, variant: "destructive" });
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    }

    if (loading) {
        return (
            <div className="p-8 flex items-center gap-2 text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading document…
            </div>
        );
    }

    const isSeed = doc?.version === 0;
    const publicHref = `/${slug}`;
    const label = slug === "privacy" ? "Privacy Policy" : "Terms of Service";

    return (
        <div className="p-8 max-w-[1400px]">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 mb-6">
                <div className="min-w-0">
                    <Link
                        href="/admin/legal"
                        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#0A4FE8] mb-2"
                    >
                        <ArrowLeft className="w-4 h-4" /> Back to Legal Documents
                    </Link>
                    <h1 className="text-[26px] font-bold text-[#0D1B39] flex items-center gap-3">
                        {label}
                        {isSeed ? (
                            <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
                                Default (unsaved)
                            </span>
                        ) : (
                            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                                v{doc?.version}
                            </span>
                        )}
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Last updated {doc ? new Date(doc.updated_at).toLocaleString() : "-"}
                        {doc?.updated_by && !isSeed ? ` by ${doc.updated_by}` : ""}
                    </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <Link
                        href={publicHref}
                        target="_blank"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:border-[#0A4FE8] hover:text-[#0A4FE8]"
                    >
                        <ExternalLink className="w-4 h-4" /> View live
                    </Link>

                    <button
                        onClick={handleDownload}
                        disabled={downloading}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:border-[#0A4FE8] hover:text-[#0A4FE8] disabled:opacity-60"
                    >
                        {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Download .docx
                    </button>

                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:border-[#0A4FE8] hover:text-[#0A4FE8] disabled:opacity-60"
                    >
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        Upload .docx
                    </button>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        className="hidden"
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleUpload(f);
                        }}
                    />

                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0A4FE8] text-white text-sm font-medium hover:bg-[#083EC0] disabled:opacity-60"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save
                    </button>
                </div>
            </div>

            {/* Metadata fields */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_200px] gap-4 mb-5">
                <Field label="Title">
                    <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#0A4FE8]"
                    />
                </Field>
                <Field label="Subtitle (shown under the title on the public page)">
                    <input
                        value={subtitle}
                        onChange={(e) => setSubtitle(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#0A4FE8]"
                    />
                </Field>
                <Field label="Effective date">
                    <input
                        type="date"
                        value={effectiveDate}
                        onChange={(e) => setEffectiveDate(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#0A4FE8]"
                    />
                </Field>
            </div>

            {/* Mode toggle */}
            <div className="flex items-center justify-between mb-3">
                <div className="inline-flex items-center bg-gray-100 rounded-xl p-1 text-sm">
                    <button
                        onClick={() => setMode("visual")}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                            mode === "visual" ? "bg-white shadow-sm text-[#0D1B39]" : "text-gray-500"
                        }`}
                    >
                        <Wand2 className="w-4 h-4" /> Edit
                    </button>
                    <button
                        onClick={() => setMode("preview")}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                            mode === "preview" ? "bg-white shadow-sm text-[#0D1B39]" : "text-gray-500"
                        }`}
                    >
                        <Eye className="w-4 h-4" /> Preview
                    </button>
                    <button
                        onClick={() => setMode("html")}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                            mode === "html" ? "bg-white shadow-sm text-[#0D1B39]" : "text-gray-500"
                        }`}
                        title="Advanced: edit raw HTML"
                    >
                        <Code className="w-4 h-4" /> HTML
                    </button>
                </div>
                <p className="text-xs text-gray-400">
                    Use the toolbar to format text. For a polished pass, <strong>Download .docx</strong>, edit in Word, then <strong>Upload</strong>.
                </p>
            </div>

            {/* Editor / preview pane */}
            {mode === "visual" && (
                <RichTextEditor
                    value={content}
                    onChange={setContent}
                    placeholder="Write the policy content…"
                />
            )}

            {mode === "html" && (
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    spellCheck={false}
                    className="w-full min-h-[560px] font-mono text-[13px] leading-relaxed bg-white border border-gray-200 rounded-2xl p-5 focus:outline-none focus:border-[#0A4FE8]"
                />
            )}

            {mode === "preview" && (
                <div className="bg-white border border-gray-200 rounded-2xl p-8 min-h-[560px]">
                    <div className="mb-6 pb-6 border-b border-gray-100">
                        <h1 className="text-3xl font-semibold text-[#0D1B39] mb-2">{title || "(untitled)"}</h1>
                        {subtitle && <p className="text-gray-600">{subtitle}</p>}
                        <p className="text-sm text-gray-400 mt-3">Effective date: {effectiveDate}</p>
                    </div>
                    <div className="legal-prose" dangerouslySetInnerHTML={{ __html: content }} />
                </div>
            )}
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-gray-500">{label}</span>
            {children}
        </label>
    );
}
