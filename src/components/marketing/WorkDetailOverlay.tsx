"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import NextLink from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X, Loader2, Maximize2, Share2, Check, Link as LinkIcon, Mail } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { slugifyTitle } from "@/lib/work-slug";

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
    const [copied, setCopied] = useState(false);

    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Keep the URL in sync with the open workId so a shareable deep link exists.
    useEffect(() => {
        if (typeof window === "undefined") return;
        const currentId = searchParams.get("id");
        if (workId != null && currentId !== String(workId)) {
            const next = new URLSearchParams(searchParams.toString());
            next.set("id", String(workId));
            router.replace(`${pathname}?${next.toString()}`, { scroll: false });
        } else if (workId == null && currentId) {
            const next = new URLSearchParams(searchParams.toString());
            next.delete("id");
            const qs = next.toString();
            router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        }
    }, [workId, pathname, router, searchParams]);

    const slug = work?.title ? slugifyTitle(work.title) : null;
    const detailHref = slug ? `/work/${slug}` : null;
    const shareUrl =
        typeof window !== "undefined" && detailHref
            ? `${window.location.origin}${detailHref}`
            : "";

    const [shareOpen, setShareOpen] = useState(false);

    const handleCopyLink = async () => {
        if (!shareUrl) return;
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            window.prompt("Copy this link:", shareUrl);
        }
    };

    // Close the share menu when workId changes (another card opened)
    useEffect(() => {
        setShareOpen(false);
    }, [workId]);

    const shareText = work?.title
        ? `${work.title} — by CDS Space`
        : "Check out this project by CDS Space.";
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedText = encodeURIComponent(shareText);

    const socialTargets: { label: string; href: string; icon: React.ReactNode }[] = [
        {
            label: "X (Twitter)",
            href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`,
            icon: (
                <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
                    <path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
            ),
        },
        {
            label: "Facebook",
            href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
            icon: (
                <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
                    <path fill="currentColor" d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.51 1.49-3.9 3.77-3.9 1.1 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.77l-.44 2.89h-2.33v6.99A10 10 0 0 0 22 12z" />
                </svg>
            ),
        },
        {
            label: "LinkedIn",
            href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
            icon: (
                <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
                    <path fill="currentColor" d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.05-1.86-3.05-1.86 0-2.14 1.45-2.14 2.95v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.86 3.37-1.86 3.6 0 4.27 2.37 4.27 5.45v6.3zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.23 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45C23.2 24 24 23.23 24 22.28V1.72C24 .77 23.2 0 22.23 0z" />
                </svg>
            ),
        },
        {
            label: "WhatsApp",
            href: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
            icon: (
                <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
                    <path fill="currentColor" d="M20.52 3.48A11.93 11.93 0 0 0 12 0C5.37 0 0 5.37 0 12c0 2.11.55 4.17 1.6 5.98L0 24l6.2-1.62A11.92 11.92 0 0 0 12 24c6.63 0 12-5.37 12-12 0-3.2-1.25-6.21-3.48-8.52zM12 22a9.96 9.96 0 0 1-5.08-1.39l-.36-.21-3.68.97.98-3.58-.23-.37A9.95 9.95 0 0 1 2 12c0-5.52 4.48-10 10-10 2.67 0 5.18 1.04 7.07 2.93A9.93 9.93 0 0 1 22 12c0 5.52-4.48 10-10 10zm5.47-7.44c-.3-.15-1.77-.87-2.05-.97-.28-.1-.48-.15-.68.15-.2.3-.78.97-.96 1.17-.18.2-.35.22-.65.07-.3-.15-1.27-.47-2.42-1.49-.9-.8-1.5-1.79-1.67-2.09-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.68-1.63-.93-2.23-.24-.58-.49-.5-.68-.5h-.58c-.2 0-.52.07-.8.37-.27.3-1.05 1.03-1.05 2.5s1.07 2.9 1.22 3.1c.15.2 2.1 3.2 5.1 4.5 2.23.96 2.62.77 3.1.72.47-.05 1.52-.62 1.73-1.22.2-.6.2-1.1.15-1.22-.05-.1-.27-.17-.57-.32z" />
                </svg>
            ),
        },
        {
            label: "Email",
            href: `mailto:?subject=${encodedText}&body=${encodedText}%0A%0A${encodedUrl}`,
            icon: <Mail className="w-4 h-4" />,
        },
    ];

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
                            <div className="shrink-0 flex items-center gap-2">
                                {detailHref && (
                                    <>
                                        <NextLink
                                            href={detailHref}
                                            aria-label="Open full project view"
                                            title="Open full view"
                                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 hover:text-[#040B37] transition"
                                        >
                                            <Maximize2 className="w-4 h-4" />
                                            <span className="hidden sm:inline">Expand</span>
                                        </NextLink>
                                        <div className="relative">
                                            <button
                                                type="button"
                                                onClick={() => setShareOpen((o) => !o)}
                                                aria-label="Share project"
                                                aria-haspopup="menu"
                                                aria-expanded={shareOpen}
                                                title="Share project"
                                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 hover:text-[#040B37] transition"
                                            >
                                                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4" />}
                                                <span className="hidden sm:inline">{copied ? "Copied" : "Share"}</span>
                                            </button>
                                            {shareOpen && (
                                                <>
                                                    {/* Backdrop to dismiss */}
                                                    <button
                                                        type="button"
                                                        aria-label="Close share menu"
                                                        onClick={() => setShareOpen(false)}
                                                        className="fixed inset-0 z-30 cursor-default"
                                                    />
                                                    <div
                                                        role="menu"
                                                        className="absolute right-0 mt-2 z-40 w-56 rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden"
                                                    >
                                                        <button
                                                            type="button"
                                                            role="menuitem"
                                                            onClick={() => {
                                                                handleCopyLink();
                                                                setShareOpen(false);
                                                            }}
                                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#040B37] hover:bg-gray-50 transition"
                                                        >
                                                            {copied ? (
                                                                <Check className="w-4 h-4 text-emerald-600" />
                                                            ) : (
                                                                <LinkIcon className="w-4 h-4 text-gray-500" />
                                                            )}
                                                            <span className="font-medium">
                                                                {copied ? "Link copied" : "Copy link"}
                                                            </span>
                                                        </button>
                                                        <div className="h-px bg-gray-100" />
                                                        {socialTargets.map((t) => (
                                                            <a
                                                                key={t.label}
                                                                role="menuitem"
                                                                href={t.href}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                onClick={() => setShareOpen(false)}
                                                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#040B37] hover:bg-gray-50 transition"
                                                            >
                                                                <span className="text-gray-500">{t.icon}</span>
                                                                <span className="font-medium">{t.label}</span>
                                                            </a>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </>
                                )}
                                <button
                                    type="button"
                                    onClick={onClose}
                                    aria-label="Close project"
                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 hover:text-[#040B37] transition"
                                >
                                    <span className="hidden sm:inline">Close</span>
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
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
                                            quality={92}
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
