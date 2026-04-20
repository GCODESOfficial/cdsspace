"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface WorkRow {
    id: number;
    title: string;
    description: string | null;
    category: string | null;
    cover_image: string | null;
    created_at: string;
    industry: string | null;
    project_scope: string | null;
    deliverables: string | null;
    timeline: string | null;
}

interface WorkImageRow {
    id: number;
    work_id: number;
    image_url: string;
    position: number | null;
}

interface WorkDetailOverlayProps {
    workId: number | null;
    onClose: () => void;
}

/**
 * Full-screen overlay shown when a work card is clicked.
 *
 * Hero selection (escalating match):
 *   1. First image measured to be ~1920x1080 (±50 px tolerance).
 *   2. Any 16:9-ish image (aspect 1.7–1.85) with width >= 1200 px.
 *   3. The work's `cover_image`.
 *   4. The first row from `work_images`.
 *
 * Dimensions are read client-side with `new Image()` — no DB column needed.
 */
export function WorkDetailOverlay({ workId, onClose }: WorkDetailOverlayProps) {
    const [work, setWork] = useState<WorkRow | null>(null);
    const [images, setImages] = useState<WorkImageRow[]>([]);
    const [heroUrl, setHeroUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Fetch work + images whenever a new workId is set.
    useEffect(() => {
        if (workId == null) {
            setWork(null);
            setImages([]);
            setHeroUrl(null);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setHeroUrl(null);

        (async () => {
            const [{ data: w }, { data: imgs }] = await Promise.all([
                supabase
                    .from("works")
                    .select("id, title, description, category, cover_image, created_at, industry, project_scope, deliverables, timeline")
                    .eq("id", workId)
                    .maybeSingle(),
                supabase
                    .from("work_images")
                    .select("id, work_id, image_url, position")
                    .eq("work_id", workId)
                    .order("position", { ascending: true, nullsFirst: false }),
            ]);

            if (cancelled) return;
            setWork((w as WorkRow | null) ?? null);
            setImages((imgs as WorkImageRow[] | null) ?? []);
            setLoading(false);
        })();

        return () => {
            cancelled = true;
        };
    }, [workId]);

    // Pick the hero once images are loaded by probing real pixel sizes.
    useEffect(() => {
        if (!work && images.length === 0) return;

        let cancelled = false;

        (async () => {
            const urls = images.map((i) => i.image_url).filter(Boolean);

            // Measure each candidate once, up-front.
            const measured = await Promise.all(
                urls.map(async (url) => {
                    const d = await getImageDims(url);
                    return d ? { url, ...d } : null;
                })
            );
            if (cancelled) return;

            const valid = measured.filter(Boolean) as { url: string; w: number; h: number }[];

            // 1. Exact 1920x1080 (±50 px)
            const exact = valid.find(
                (m) => Math.abs(m.w - 1920) <= 50 && Math.abs(m.h - 1080) <= 50
            );
            if (exact) {
                setHeroUrl(exact.url);
                return;
            }

            // 2. 16:9-ish with width >= 1200
            const widescreen = valid.find((m) => {
                const ratio = m.w / m.h;
                return ratio >= 1.7 && ratio <= 1.85 && m.w >= 1200;
            });
            if (widescreen) {
                setHeroUrl(widescreen.url);
                return;
            }

            // 3. cover_image, 4. first work_image
            setHeroUrl(work?.cover_image ?? urls[0] ?? null);
        })();

        return () => {
            cancelled = true;
        };
    }, [images, work]);

    // Lock body scroll while open, Escape to close.
    useEffect(() => {
        if (workId == null) return;

        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);

        return () => {
            document.body.style.overflow = prevOverflow;
            document.removeEventListener("keydown", onKey);
        };
    }, [workId, onClose]);

    const gallery = heroUrl ? images.filter((img) => img.image_url !== heroUrl) : images;

    return (
        <AnimatePresence>
            {workId != null && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={onClose}
                    className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm overflow-y-auto"
                >
                    <motion.div
                        initial={{ y: 40, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 40, opacity: 0 }}
                        transition={{ type: "spring", damping: 30, stiffness: 260 }}
                        onClick={(e) => e.stopPropagation()}
                        className="relative min-h-full w-full md:max-w-[960px] mx-auto bg-white md:my-8 md:rounded-3xl overflow-hidden shadow-2xl"
                    >
                        {/* Header */}
                        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur px-5 md:px-10 py-4 flex items-center justify-between gap-3 border-b border-gray-100">
                            <div className="min-w-0 flex items-center gap-3">
                                <h2 className="text-[#040B37] text-[18px] md:text-[22px] font-semibold tracking-tight truncate">
                                    {work?.title ?? (loading ? "Loading…" : "—")}
                                </h2>
                                {work?.category && (
                                    <span className="shrink-0 hidden sm:inline-block px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold uppercase tracking-wide">
                                        Completed
                                    </span>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label="Close project"
                                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 hover:text-[#040B37] transition"
                            >
                                Close <X className="w-4 h-4" />
                            </button>
                        </header>

                        {loading && !work ? (
                            <div className="py-24 flex items-center justify-center text-gray-400">
                                <Loader2 className="w-5 h-5 animate-spin" />
                            </div>
                        ) : (
                            <>
                                {/* Hero image */}
                                {heroUrl && (
                                    <div className="relative w-full aspect-video bg-gray-100">
                                        <Image
                                            src={heroUrl}
                                            alt={work?.title ?? ""}
                                            fill
                                            priority
                                            sizes="(min-width: 960px) 960px, 100vw"
                                            className="object-cover"
                                        />
                                    </div>
                                )}

                                <div className="px-5 md:px-10 py-8 md:py-12">
                                    {/* About */}
                                    {work?.description && (
                                        <section className="mb-10 md:mb-14">
                                            <p className="text-[#9CA3AF] text-xs md:text-sm font-medium uppercase tracking-wide mb-2">
                                                About
                                            </p>
                                            <p className="text-[#4B5563] text-[15px] md:text-[17px] leading-[1.7] font-medium max-w-[720px]">
                                                {work.description}
                                            </p>
                                        </section>
                                    )}

                                    {/* Metadata grid */}
                                    <section className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 pb-10 md:pb-14 border-b border-gray-100">
                                        <Meta label="Industry" lines={splitLines(work?.industry)} />
                                        <Meta
                                            label="Project Scope"
                                            lines={splitLines(work?.project_scope) ?? splitLines(work?.category)}
                                        />
                                        <Meta label="Deliverables" lines={splitLines(work?.deliverables)} />
                                        <Meta label="Timeline" lines={splitLines(work?.timeline)} />
                                    </section>

                                    {/* Gallery */}
                                    {gallery.length > 0 && (
                                        <section className="mt-10 md:mt-14">
                                            <p className="text-[#9CA3AF] text-xs md:text-sm font-medium uppercase tracking-wide mb-4">
                                                Gallery
                                            </p>
                                            <div className="flex flex-col gap-3 md:gap-5">
                                                {gallery.map((img) => (
                                                    <div
                                                        key={img.id}
                                                        className="relative w-full rounded-xl md:rounded-2xl overflow-hidden bg-gray-100"
                                                    >
                                                        <img
                                                            src={img.image_url}
                                                            alt=""
                                                            loading="lazy"
                                                            className="w-full h-auto block"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                    )}

                                    {/* Empty state */}
                                    {gallery.length === 0 && !heroUrl && (
                                        <p className="mt-10 text-center text-gray-400 text-sm">
                                            This project has no images uploaded yet.
                                        </p>
                                    )}
                                </div>
                            </>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

function Meta({ label, lines }: { label: string; lines: string[] | null }) {
    return (
        <div>
            <p className="text-[#9CA3AF] text-[11px] md:text-xs font-semibold uppercase tracking-wide mb-2">
                {label}
            </p>
            {lines && lines.length > 0 ? (
                <ul className="flex flex-col gap-1">
                    {lines.map((item, i) => (
                        <li key={i} className="text-[#040B37] text-sm md:text-[15px] font-medium leading-snug">
                            {item}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-[#9CA3AF] text-sm md:text-[15px] font-medium">—</p>
            )}
        </div>
    );
}

/**
 * Normalize a possibly-null text field into an array of non-empty, trimmed
 * lines. Accepts newline- or comma-separated input. Returns null when there
 * are no usable values.
 */
function splitLines(input: string | null | undefined): string[] | null {
    if (!input) return null;
    const parts = input
        .split(/\r?\n|,/)
        .map((s) => s.trim())
        .filter(Boolean);
    return parts.length ? parts : null;
}

/**
 * Measure an image's real pixel dimensions by loading it in a detached
 * `<img>` element. Resolves null on error. Runs client-side only.
 */
function getImageDims(src: string): Promise<{ w: number; h: number } | null> {
    return new Promise((resolve) => {
        if (typeof window === "undefined") return resolve(null);
        const img = new window.Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve(null);
        img.src = src;
    });
}
