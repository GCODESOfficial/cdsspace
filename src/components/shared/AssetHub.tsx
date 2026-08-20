"use client";

import React, { useRef, useState } from "react";
import { X, Plus, UploadCloud, FolderOpen, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Enhanced File interface for internal preview management
 */
export interface AssetFile extends File {
    preview?: string | null;
    previewKind?: "image" | "pdf";
    status?: "idle" | "uploading" | "success" | "error";
    progress?: number;
    storagePath?: string;
}

interface AssetHubProps {
    files: AssetFile[];
    onUpdateFiles: (files: AssetFile[]) => void;
    onFileAdded?: (file: File, index: number) => Promise<void>;
    onFileRemoved?: (file: AssetFile, index: number) => Promise<void>;
    onCancelUpload?: (index: number) => void;
    maxFiles?: number;
    maxSizeMB?: number;
    acceptedTypes?: string;
    title?: string;
    description?: string;
    icon?: "upload" | "folder";
    className?: string;
}

/**
 * AssetHub - A high-fidelity, reusable file management component.
 * Features: Drag & Drop, Horizontal Carousel, MIME-type smart previews, and responsive scaling.
 */
export const AssetHub = ({
    files,
    onUpdateFiles,
    onFileAdded,
    onFileRemoved,
    onCancelUpload,
    maxFiles = 5,
    maxSizeMB = 5,
    acceptedTypes = ".svg,.ai,.eps,.pdf,image/svg+xml,image/png,image/jpeg",
    title = "Click to upload or drag and drop",
    description = "Vector preferred · SVG, AI, EPS, PDF, PNG (max 5MB each)",
    icon = "upload",
    className
}: AssetHubProps) => {
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const maxBytes = maxSizeMB * 1024 * 1024;
    const activeFileCount = files.filter((file) => file.status !== "error").length;

    const matchesAcceptedType = (file: File) => {
        const rules = acceptedTypes.split(",").map((rule) => rule.trim().toLowerCase()).filter(Boolean);
        if (rules.length === 0) return true;
        const fileName = file.name.toLowerCase();
        const mimeType = file.type.toLowerCase();
        return rules.some((rule) => {
            if (rule.startsWith(".")) return fileName.endsWith(rule);
            if (rule.endsWith("/*")) return mimeType.startsWith(rule.slice(0, -1));
            return mimeType === rule;
        });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(e.target.files || []);
        addFiles(selectedFiles);
    };

    const addFiles = (newFiles: File[]) => {
        // Failed uploads are replaceable and must never consume an upload slot.
        const remainingSlots = maxFiles - activeFileCount;
        if (remainingSlots <= 0) return;

        // Validate size and type for both picker and drag-and-drop uploads.
        const oversize = newFiles.filter(f => f.size > maxBytes);
        const unsupported = newFiles.filter((file) => !matchesAcceptedType(file));
        if (oversize.length > 0 || unsupported.length > 0) {
            const messages = [
                oversize.length > 0 ? `${oversize.length} file${oversize.length > 1 ? "s" : ""} exceeded ${maxSizeMB}MB` : null,
                unsupported.length > 0 ? `${unsupported.length} file${unsupported.length > 1 ? "s use" : " uses"} an unsupported format` : null,
            ].filter(Boolean);
            setError(`${messages.join(" and ")}; ${messages.length > 1 ? "they were" : "it was"} skipped.`);
            setTimeout(() => setError(null), 4000);
        }
        const validFiles = newFiles.filter((file) => file.size <= maxBytes && matchesAcceptedType(file));
        const filesToAdd = validFiles.slice(0, remainingSlots);
        if (filesToAdd.length === 0) return;

        const retainedFiles = files.filter((file) => file.status !== "error");
        files
            .filter((file) => file.status === "error" && file.preview)
            .forEach((file) => {
                if (file.preview?.startsWith("blob:")) URL.revokeObjectURL(file.preview);
            });
        const startIndex = retainedFiles.length;

        const processedFiles = filesToAdd.map(file => {
            const extension = file.name.split(".").pop()?.toLowerCase();
            const isImage = file.type.startsWith("image/") || ["png", "jpg", "jpeg", "svg"].includes(extension || "");
            const isPdf = file.type === "application/pdf" || extension === "pdf";
            const assetFile = file as AssetFile;
            assetFile.preview = isImage || isPdf ? URL.createObjectURL(file) : null;
            assetFile.previewKind = isImage ? "image" : isPdf ? "pdf" : undefined;
            assetFile.status = onFileAdded ? "uploading" : "idle";
            assetFile.progress = 0;
            return assetFile;
        });

        const updatedFiles = [...retainedFiles, ...processedFiles];
        onUpdateFiles(updatedFiles);

        // Trigger uploads for new files
        if (onFileAdded) {
            processedFiles.forEach((file, idx) => {
                onFileAdded(file, startIndex + idx);
            });
        }
    };

    const removeFile = (index: number) => {
        const newFiles = [...files];
        const fileToRemove = newFiles[index];

        if (fileToRemove.status === "uploading" && onCancelUpload) {
            onCancelUpload(index);
        }

        if (fileToRemove.preview?.startsWith("blob:")) {
            URL.revokeObjectURL(fileToRemove.preview);
        }

        if (onFileRemoved) {
            onFileRemoved(fileToRemove, index);
        }

        newFiles.splice(index, 1);
        onUpdateFiles(newFiles);
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
        const droppedFiles = Array.from(e.dataTransfer.files);
        addFiles(droppedFiles);
    };

    const IconComponent = icon === "folder" ? FolderOpen : UploadCloud;

    return (
        <div className="space-y-2">
            {error && (
                <div className="text-[12px] font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {error}
                </div>
            )}
        <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
                "border-2 border-dashed rounded-[20px] lg:rounded-[24px] transition-all relative min-h-[140px] lg:min-h-[180px] flex items-center justify-center overflow-hidden",
                isDragging ? "border-brand-blue bg-brand-blue/5 scale-[1.01]" : "border-brand-stroke-ii hover:border-brand-blue/30 bg-brand-bg/30",
                className
            )}
        >
            <input
                type="file"
                multiple={maxFiles > 1}
                hidden
                ref={fileInputRef}
                onChange={handleFileChange}
                accept={acceptedTypes}
                disabled={activeFileCount >= maxFiles}
            />

            {files.length === 0 ? (
                <div
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center text-center gap-[12px] p-[24px] lg:p-[32px] w-full h-full cursor-pointer group"
                >
                    <div className="w-[48px] h-[48px] lg:w-[56px] lg:h-[56px] bg-white rounded-full flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-300">
                        <IconComponent className="text-brand-blue" size={20} />
                    </div>
                    <div className="flex flex-col gap-[2px]">
                        <p className="text-brand-navy font-semibold text-[14px] lg:text-[16px]">{title}</p>
                        <p className="text-brand-body text-[11px] lg:text-[13px]">{description}</p>
                    </div>
                </div>
            ) : (
                <div className="w-full h-full p-[12px] lg:p-[16px] overflow-x-auto premium-scrollbar-horizontal">
                    <div className="flex items-center gap-[10px] lg:gap-[12px] min-w-max h-full">
                        {files.map((file, idx) => (
                            <div key={idx} className="relative group w-[80px] h-[80px] lg:w-[100px] lg:h-[100px] shrink-0 rounded-[12px] overflow-hidden border border-brand-stroke bg-white shadow-sm flex flex-col items-center justify-center">
                                {file.preview && file.previewKind === "image" ? (
                                    <img
                                        src={file.preview}
                                        alt="Preview"
                                        loading="lazy"
                                        decoding="async"
                                        className={cn("absolute inset-0 h-full w-full object-cover", file.status === "uploading" && "opacity-40 grayscale")}
                                        onError={(event) => {
                                            const fallback = file.storagePath
                                                ? `/api/banners/file?path=${encodeURIComponent(file.storagePath)}`
                                                : null;
                                            if (fallback && event.currentTarget.src !== new URL(fallback, window.location.origin).href) {
                                                event.currentTarget.src = fallback;
                                                return;
                                            }
                                            event.currentTarget.hidden = true;
                                        }}
                                    />
                                ) : (
                                    <div className={cn("flex flex-col items-center gap-2 p-3 text-center", file.status === "uploading" && "opacity-40")}>
                                        <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-brand-bg flex items-center justify-center">
                                            <span className="text-[10px] lg:text-[12px] font-bold text-brand-blue uppercase">
                                                {file.name.split('.').pop()}
                                            </span>
                                        </div>
                                        <span className="text-[10px] lg:text-[11px] font-bold text-brand-navy truncate w-full px-1">
                                            {file.name}
                                        </span>
                                    </div>
                                )}

                                {file.status === "uploading" && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-20">
                                        <div className="w-6 h-6 border-2 border-brand-blue border-t-transparent rounded-full animate-spin" />
                                        <span className="text-[10px] font-bold text-brand-blue">{file.progress}%</span>
                                    </div>
                                )}

                                {file.status === "error" && (
                                    <div className="absolute inset-0 bg-red-50/80 flex flex-col items-center justify-center gap-1 z-20 pointer-events-none">
                                        <X size={20} className="text-red-500" />
                                        <span className="text-[10px] font-bold text-red-500 uppercase">Fail</span>
                                    </div>
                                )}
                                <button
                                    type="button"
                                    aria-label={`Remove ${file.name}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeFile(idx);
                                    }}
                                    className={cn(
                                        "absolute top-1.5 right-1.5 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white transition-opacity shadow-md cursor-pointer hover:bg-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-red-500",
                                        file.status === "error" ? "opacity-100 z-30" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 z-30"
                                    )}
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ))}

                        {activeFileCount < maxFiles && (
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="w-[80px] h-[80px] lg:w-[100px] lg:h-[100px] shrink-0 rounded-[12px] border-2 border-dashed border-brand-stroke hover:border-brand-blue/50 hover:bg-brand-blue/5 transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer group"
                            >
                                <div className="w-7 h-7 rounded-full bg-brand-bg flex items-center justify-center group-hover:bg-brand-blue/10 transition-colors">
                                    <Plus size={16} className="text-brand-blue" />
                                </div>
                                <span className="text-brand-mute text-[9px] lg:text-[11px] font-medium group-hover:text-brand-blue">Add more</span>
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
        </div>
    );
};
