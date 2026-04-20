"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronDown, UploadCloud, ChevronRight, File, FileText, Image as ImageIcon } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface BannerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const bannerTypes = [
    'Standard (33" x 79")',
    'Economy (24" x 63")',
    'Deluxe (36" x 79")',
    'Premium (39" x 79")',
    'Jumbo (47" x 79")'
];

interface FileWithPreview extends File {
    preview?: string;
}

export const BannerModal = ({ isOpen, onClose }: BannerModalProps) => {
    const [selectedType, setSelectedType] = useState("");
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [uploadedFiles, setUploadedFiles] = useState<FileWithPreview[]>([]);
    const [isDragging, setIsDragging] = useState(false);

    const dropdownRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const processFiles = (files: File[]) => {
        const validFiles = files.filter(file => {
            const isValidType = ['image/png', 'image/jpeg', 'image/svg+xml'].includes(file.type);
            const isValidSize = file.size <= 5 * 1024 * 1024; // 5MB limit
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

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            uploadedFiles.forEach(file => {
                if (file.preview) URL.revokeObjectURL(file.preview);
            });
        };
    }, []);

    // Lock body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "unset";
        }
        return () => { document.body.style.overflow = "unset"; };
    }, [isOpen]);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-[100] bg-[#040B37]/20 backdrop-blur-sm hidden md:block"
                    />

                    <div className="fixed inset-0 z-[101] flex items-center justify-center pointer-events-none">
                        <motion.div
                            initial={{ x: "0%", y: "100%" }}
                            animate={{ x: 0, y: 0 }}
                            exit={{ x: "0%", y: "100%" }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className={cn(
                                "w-full h-full md:h-auto md:max-h-[90vh] md:max-w-[960px] bg-white md:rounded-[40px] shadow-2xl overflow-y-auto premium-scrollbar pointer-events-auto relative flex flex-col"
                            )}
                        >
                            {/* MOBILE HEADER */}
                            <div className="md:hidden flex items-center justify-between px-6 pt-8 pb-4">
                                <button
                                    onClick={onClose}
                                    className="flex items-center gap-2 text-sm font-medium hover:opacity-70 transition-opacity cursor-pointer"
                                >
                                    <ChevronRight size={14} className="text-brand-body rotate-180" />
                                    <span className="text-brand-body opacity-60 font-semibold tracking-tight">Back</span>
                                </button>
                                <div className="flex items-center gap-2 text-sm font-medium">
                                    <span className="text-brand-body opacity-60">Banners</span>
                                    <ChevronRight size={14} className="text-brand-body opacity-60" />
                                    <span className="text-brand-navy">Get banner</span>
                                </div>
                            </div>

                            {/* DESKTOP CLOSE BUTTON */}
                            <button
                                onClick={onClose}
                                className="hidden md:flex absolute top-8 right-8 w-12 h-12 rounded-full border border-brand-stroke-ii items-center justify-center text-brand-navy hover:bg-brand-bg transition-colors group z-10 cursor-pointer"
                            >
                                <X size={24} className="group-hover:rotate-90 transition-transform duration-300" />
                            </button>

                            <div className="p-6 md:p-12 pt-4 md:pt-16 uppercase">
                                <div className="text-left md:text-center mb-8 md:mb-12">
                                    <h2 className="text-brand-navy text-3xl md:text-[48px] font-bold leading-[1.1] tracking-[-1.12px] md:tracking-[-1.44px] mb-4 text-balance">
                                        Let&apos;s create your banner
                                    </h2>
                                    <p className="text-brand-body text-base md:text-xl font-medium opacity-70">
                                        Tell us about your project and we&apos;ll get it done!
                                    </p>
                                </div>

                                <form className="space-y-6 md:space-y-8" onSubmit={(e) => e.preventDefault()}>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                                        <div className="space-y-3">
                                            <label className="text-brand-navy text-base font-bold tracking-tight">Name</label>
                                            <input
                                                type="text"
                                                placeholder="Enter your name"
                                                className="w-full bg-brand-bg border border-transparent focus:border-brand-blue/20 rounded-[16px] px-6 py-4 outline-none transition-all placeholder:text-brand-body/30 text-brand-navy font-medium"
                                            />
                                        </div>

                                        <div className="space-y-3">
                                            <label className="text-brand-navy text-base font-bold tracking-tight">Email address</label>
                                            <input
                                                type="email"
                                                placeholder="Enter your email"
                                                className="w-full bg-brand-bg border border-transparent focus:border-brand-blue/20 rounded-[16px] px-6 py-4 outline-none transition-all placeholder:text-brand-body/30 text-brand-navy font-medium"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                                        <div className="space-y-3">
                                            <label className="text-brand-navy text-base font-bold tracking-tight">Company name</label>
                                            <input
                                                type="text"
                                                placeholder="Enter your company name"
                                                className="w-full bg-brand-bg border border-transparent focus:border-brand-blue/20 rounded-[16px] px-6 py-4 outline-none transition-all placeholder:text-brand-body/30 text-brand-navy font-medium"
                                            />
                                        </div>

                                        <div className="space-y-3 relative" ref={dropdownRef}>
                                            <label className="text-brand-navy text-base font-bold tracking-tight">Banner type</label>
                                            <button
                                                type="button"
                                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                                className="w-full bg-[#F4F6FB] border border-transparent hover:border-brand-stroke-ii rounded-[16px] px-6 py-4 flex items-center justify-between transition-all cursor-pointer outline-none"
                                            >
                                                <span className={cn(
                                                    "font-medium normal-case",
                                                    selectedType ? "text-brand-navy" : "text-brand-body/30"
                                                )}>
                                                    {selectedType || "Select banner type"}
                                                </span>
                                                <ChevronDown className={cn(
                                                    "text-brand-body/40 transition-transform duration-300",
                                                    isDropdownOpen && "rotate-180"
                                                )} size={20} />
                                            </button>

                                            <AnimatePresence>
                                                {isDropdownOpen && (
                                                    <motion.div
                                                        initial={{ opacity: 0, scale: 0.98, y: -10 }}
                                                        animate={{ opacity: 1, scale: 1, y: 5 }}
                                                        exit={{ opacity: 0, scale: 0.98, y: -10 }}
                                                        className="absolute z-50 w-full bg-[#F4F6FB] border border-brand-stroke-ii rounded-[16px] shadow-xl p-2 top-full overflow-hidden"
                                                    >
                                                        {bannerTypes.map((type) => (
                                                            <button
                                                                key={type}
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedType(type);
                                                                    setIsDropdownOpen(false);
                                                                }}
                                                                className="w-full text-left px-5 py-3.5 hover:bg-white rounded-[12px] transition-colors text-brand-body font-medium normal-case cursor-pointer"
                                                            >
                                                                {type}
                                                            </button>
                                                        ))}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <label className="text-brand-navy text-base font-bold tracking-tight">Tell us about your project</label>
                                        <textarea
                                            rows={4}
                                            placeholder="Tell us briefly about your project or idea"
                                            className="w-full bg-[#F4F6FB] border border-transparent focus:border-brand-blue/20 rounded-[16px] px-6 py-4 outline-none transition-all placeholder:text-brand-body/30 text-brand-navy font-medium resize-none normal-case"
                                        />
                                    </div>

                                    {/* ENHANCED DRAG & DROP UPLOAD */}
                                    <div className="space-y-4">
                                        <label className="text-brand-navy text-base font-bold tracking-tight">Upload logo (Optional)</label>
                                        <div
                                            onDragOver={handleDragOver}
                                            onDragLeave={handleDragLeave}
                                            onDrop={handleDrop}
                                            onClick={() => fileInputRef.current?.click()}
                                            className={cn(
                                                "w-full min-h-[160px] bg-[#F4F6FB] border-2 border-dashed rounded-[24px] flex flex-col items-center justify-center p-8 transition-all cursor-pointer group relative overflow-hidden",
                                                isDragging ? "border-brand-blue bg-brand-blue/5 scale-[1.01]" : "border-brand-stroke-ii hover:bg-white hover:border-brand-blue/30"
                                            )}
                                        >
                                            <input
                                                type="file"
                                                className="hidden"
                                                multiple
                                                ref={fileInputRef}
                                                onChange={handleFileChange}
                                                accept=".png,.jpg,.jpeg,.svg"
                                            />

                                            {uploadedFiles.length === 0 ? (
                                                <div className="text-center flex flex-col items-center pointer-events-none">
                                                    <div className="w-14 h-14 rounded-full bg-brand-blue/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-500">
                                                        <UploadCloud className="text-brand-blue opacity-40 group-hover:opacity-100 transition-opacity" size={28} />
                                                    </div>
                                                    <p className="text-brand-navy font-bold text-lg normal-case">
                                                        <span className="text-brand-blue">Click to upload</span> or drag and drop
                                                    </p>
                                                    <p className="text-brand-body/40 text-sm mt-1 lowercase">PNG, JPG or SVG (max. 5MB per file)</p>
                                                </div>
                                            ) : (
                                                <div className="w-full space-y-4 normal-case">
                                                    <div className="flex items-center justify-between border-b border-brand-stroke-ii pb-4">
                                                        <p className="text-brand-navy font-bold text-base">{uploadedFiles.length} file(s) selected</p>
                                                        <p className="text-brand-blue text-xs font-bold hover:underline cursor-pointer">Add more</p>
                                                    </div>

                                                    {/* LIVE MINI PREVIEWS */}
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                        {uploadedFiles.map((file, idx) => (
                                                            <div key={idx} className="bg-white border border-brand-stroke-ii rounded-xl p-2 flex items-center gap-3 group/file hover:shadow-md transition-all">
                                                                <div className="w-10 h-10 rounded-lg bg-brand-bg flex items-center justify-center shrink-0 relative overflow-hidden">
                                                                    {file.preview ? (
                                                                        <Image
                                                                            src={file.preview}
                                                                            alt="Preview"
                                                                            fill
                                                                            className="object-cover"
                                                                        />
                                                                    ) : (
                                                                        <ImageIcon size={18} className="text-brand-blue opacity-40" />
                                                                    )}
                                                                </div>
                                                                <div className="flex-1 overflow-hidden">
                                                                    <p className="text-[12px] font-bold text-brand-navy truncate">{file.name}</p>
                                                                    <p className="text-[10px] text-brand-body/40 font-medium lowercase">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                                                </div>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                                                                    className="p-1.5 hover:bg-red-50 text-brand-body/30 hover:text-red-500 rounded-md transition-colors cursor-pointer"
                                                                >
                                                                    <X size={14} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <button
                                        className="w-full py-5 rounded-full text-white font-bold text-lg shadow-lg transition-all active:scale-[0.98] mt-4 cursor-pointer"
                                        style={{ background: 'var(--color-brand-gradient)' }}
                                    >
                                        Send request
                                    </button>
                                </form>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
};
