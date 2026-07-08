"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import { UploadCloud, X, FileText, Image as ImageIcon, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface FileWithPreview extends File {
    preview?: string;
}

/**
 * ConsultationForm - 1:1 Figma Alignment
 * Enhanced with drag-and-drop, live mini-previews, and brand styling.
 */
export const ConsultationForm = () => {
    const [uploadedFiles, setUploadedFiles] = useState<FileWithPreview[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [form, setForm] = useState({ full_name: "", email: "", company: "", budget_range: "", message: "", how_heard: "" });
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg("");
        if (!form.full_name || !form.email) {
            setErrorMsg("Please enter your name and email.");
            return;
        }
        setSubmitting(true);
        const fd = new FormData();
        Object.entries(form).forEach(([k, v]) => fd.append(k, v));
        uploadedFiles.forEach((f) => fd.append("files", f));
        try {
            const res = await fetch("/api/consultation", { method: "POST", body: fd });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.error || "Submission failed");
            }
            setSubmitted(true);
            setForm({ full_name: "", email: "", company: "", budget_range: "", message: "", how_heard: "" });
            setUploadedFiles([]);
        } catch (err) {
            setErrorMsg((err as Error).message);
        } finally {
            setSubmitting(false);
        }
    };

    const processFiles = (files: File[]) => {
        const validFiles = files.filter(file => {
            const isValidType = ['image/png', 'image/jpeg', 'image/svg+xml', 'application/pdf'].includes(file.type);
            const isValidSize = file.size <= 10 * 1024 * 1024; // 10MB limit for consultation
            return isValidType && isValidSize;
        }).map(file => {
            const fileWithPreview = file as FileWithPreview;
            if (file.type.startsWith('image/')) {
                fileWithPreview.preview = URL.createObjectURL(file);
            }
            return fileWithPreview;
        });

        setUploadedFiles(prev => [...prev, ...validFiles].slice(0, 5));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            processFiles(Array.from(e.target.files));
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files) {
            processFiles(Array.from(e.dataTransfer.files));
        }
    };

    const removeFile = (index: number) => {
        setUploadedFiles(prev => {
            const newFiles = [...prev];
            if (newFiles[index].preview) {
                URL.revokeObjectURL(newFiles[index].preview!);
            }
            return newFiles.filter((_, i) => i !== index);
        });
    };

    useEffect(() => {
        return () => {
            uploadedFiles.forEach(file => {
                if (file.preview) URL.revokeObjectURL(file.preview);
            });
        };
    }, []);

    return (
        <section className="w-full bg-brand-bg relative pb-20 sm:pb-24 md:pb-32">
            <div className="max-w-[1232px] mx-auto sm:border-l sm:border-r border-dashed border-brand-stroke-ii px-4 sm:px-6">

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="max-w-[900px] mx-auto bg-white rounded-[28px] sm:rounded-[40px] border border-brand-stroke-ii p-5 sm:p-8 md:p-12 shadow-sm"
                >
                    {submitted && (
                        <div className="mb-6 flex items-start gap-3 rounded-2xl bg-emerald-50 border border-emerald-200 p-4">
                            <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="font-bold text-emerald-900">Thanks - we&apos;ve received your request!</p>
                                <p className="text-sm text-emerald-800 mt-0.5">Our team will reach out within 24 hours to schedule your session.</p>
                            </div>
                        </div>
                    )}
                    {errorMsg && (
                        <div className="mb-6 rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-800">{errorMsg}</div>
                    )}
                    <form className="space-y-6 sm:space-y-8" onSubmit={submit}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
                            <div className="space-y-3">
                                <label className="text-brand-navy text-base font-bold tracking-tight uppercase">Full name</label>
                                <input
                                    type="text"
                                    value={form.full_name}
                                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                                    placeholder="Enter your full name"
                                    className="w-full bg-[#F4F6FB] border border-transparent focus:border-brand-blue/30 rounded-2xl px-4 sm:px-6 py-3.5 sm:py-4 outline-none transition-all placeholder:text-brand-body/40 text-brand-navy font-medium"
                                />
                            </div>

                            <div className="space-y-3">
                                <label className="text-brand-navy text-base font-bold tracking-tight uppercase">Email address</label>
                                <input
                                    type="email"
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                    placeholder="Enter your email"
                                    className="w-full bg-[#F4F6FB] border border-transparent focus:border-brand-blue/30 rounded-2xl px-4 sm:px-6 py-3.5 sm:py-4 outline-none transition-all placeholder:text-brand-body/40 text-brand-navy font-medium"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
                            <div className="space-y-3">
                                <label className="text-brand-navy text-base font-bold tracking-tight uppercase">Company / Brand</label>
                                <input
                                    type="text"
                                    value={form.company}
                                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                                    placeholder="Your company or brand name"
                                    className="w-full bg-[#F4F6FB] border border-transparent focus:border-brand-blue/30 rounded-2xl px-4 sm:px-6 py-3.5 sm:py-4 outline-none transition-all placeholder:text-brand-body/40 text-brand-navy font-medium"
                                />
                            </div>

                            <div className="space-y-3">
                                <label className="text-brand-navy text-base font-bold tracking-tight uppercase">Budget range</label>
                                <input
                                    type="text"
                                    value={form.budget_range}
                                    onChange={(e) => setForm({ ...form, budget_range: e.target.value })}
                                    placeholder="Estimated budget ($)"
                                    className="w-full bg-[#F4F6FB] border border-transparent focus:border-brand-blue/30 rounded-2xl px-4 sm:px-6 py-3.5 sm:py-4 outline-none transition-all placeholder:text-brand-body/40 text-brand-navy font-medium"
                                />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="text-brand-navy text-base font-bold tracking-tight uppercase">What do you want to discuss?</label>
                            <textarea
                                rows={4}
                                value={form.message}
                                onChange={(e) => setForm({ ...form, message: e.target.value })}
                                placeholder="Tell us briefly about your project or idea"
                                className="w-full bg-brand-bg border border-transparent focus:border-brand-blue/30 rounded-2xl px-4 sm:px-6 py-3.5 sm:py-4 outline-none transition-all placeholder:text-brand-body/40 text-brand-navy font-medium resize-none"
                            ></textarea>
                        </div>

                        {/* ENHANCED DRAG & DROP UPLOAD */}
                        <div className="space-y-3">
                            <label className="text-brand-navy text-base font-bold tracking-tight uppercase">Upload brief or assets (Optional)</label>
                            <div
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                                className={cn(
                                    "w-full min-h-[160px] bg-brand-bg border-2 border-dashed rounded-[24px] flex flex-col items-center justify-center p-6 sm:p-8 transition-all cursor-pointer group relative overflow-hidden",
                                    isDragging ? "border-brand-blue bg-brand-blue/5 scale-[1.01]" : "border-brand-stroke-ii hover:bg-white hover:border-brand-blue/30"
                                )}
                            >
                                <input
                                    type="file"
                                    className="hidden"
                                    multiple
                                    ref={fileInputRef}
                                    onChange={handleFileChange}
                                    accept=".png,.jpg,.jpeg,.svg,.pdf"
                                />
                                {uploadedFiles.length === 0 ? (
                                    <>
                                        <div className="w-16 h-16 rounded-full bg-brand-blue/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-500">
                                            <UploadCloud className="text-brand-blue opacity-40 group-hover:opacity-100 transition-opacity" size={32} />
                                        </div>
                                        <p className="text-brand-navy font-bold text-base sm:text-lg text-center">
                                            <span className="text-brand-blue">Click to upload</span> or drag and drop
                                        </p>
                                        <p className="text-brand-body/40 text-sm mt-1 text-center">PDF, PNG, JPG or SVG (max. 10MB per file)</p>
                                    </>
                                ) : (
                                    <div className="w-full space-y-4">
                                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-stroke-ii pb-4">
                                            <p className="text-brand-navy font-bold text-base">{uploadedFiles.length} file(s) selected</p>
                                            <button className="text-brand-blue text-sm font-bold hover:underline">Add more</button>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <AnimatePresence mode="popLayout">
                                                {uploadedFiles.map((file, idx) => (
                                                    <motion.div
                                                        key={file.name + idx}
                                                        initial={{ opacity: 0, scale: 0.9 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        exit={{ opacity: 0, scale: 0.9 }}
                                                        className="bg-white border border-brand-stroke-ii rounded-xl p-3 flex items-center justify-between group/file hover:shadow-md transition-shadow"
                                                    >
                                                        <div className="flex items-center gap-3 overflow-hidden">
                                                            <div className="w-10 h-10 rounded-lg bg-brand-bg flex items-center justify-center shrink-0 relative overflow-hidden">
                                                                {file.preview ? (
                                                                    <Image
                                                                        src={file.preview}
                                                                        alt="Preview"
                                                                        fill
                                                                        className="object-cover"
                                                                    />
                                                                ) : (
                                                                    file.type.includes('pdf') ? <FileText size={18} className="text-brand-blue opacity-40" /> : <ImageIcon size={18} className="text-brand-blue opacity-40" />
                                                                )}
                                                            </div>
                                                            <div className="flex flex-col min-w-0">
                                                                <span className="text-sm font-bold text-brand-navy truncate">{file.name}</span>
                                                                <span className="text-[10px] text-brand-body/40 font-medium">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                                                            className="p-1.5 hover:bg-red-50 text-brand-body/30 hover:text-red-500 rounded-md transition-colors cursor-pointer"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </motion.div>
                                                ))}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-3 pb-4">
                            <label className="text-brand-navy text-base font-bold tracking-tight uppercase">How did you hear about us?</label>
                            <input
                                type="text"
                                value={form.how_heard}
                                onChange={(e) => setForm({ ...form, how_heard: e.target.value })}
                                placeholder="X, referral, search, friend..."
                                className="w-full bg-brand-bg border border-transparent focus:border-brand-blue/30 rounded-2xl px-4 sm:px-6 py-3.5 sm:py-4 outline-none transition-all placeholder:text-brand-body/40 text-brand-navy font-medium"
                            />
                        </div>

                        <button type="submit" disabled={submitting} className="w-full text-white font-bold py-4 sm:py-5 rounded-full text-base sm:text-lg shadow-lg hover:shadow-xl active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed" style={{ background: 'var(--color-brand-gradient)' }}>
                            {submitting ? "Sending…" : "Schedule a call"}
                        </button>
                    </form>
                </motion.div>

            </div>
        </section>
    );
};
