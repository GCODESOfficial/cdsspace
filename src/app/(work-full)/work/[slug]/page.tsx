import type { Metadata } from "next";
import Image from "next/image";
import NextLink from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
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

type Params = Promise<{ slug: string }>;

const SITE_URL = "https://cdsspace.pro";

/**
 * Resolve a slug to a concrete work row. The `works` table has no slug column,
 * so we load all titles once and match in-memory. The set is small (portfolio
 * size); switching to a dedicated slug column is a drop-in replacement here.
 */
async function resolveWorkBySlug(slug: string): Promise<WorkRow | null> {
    const target = slug.toLowerCase();
    const { data } = await supabase
        .from("works")
        .select("id, title, description, category, cover_image, created_at, industry, project_scope, deliverables, timeline");
    const rows = (data as WorkRow[] | null) ?? [];
    return rows.find((w) => slugifyTitle(w.title) === target) ?? null;
}

async function fetchImages(workId: number): Promise<WorkImageRow[]> {
    const { data } = await supabase
        .from("work_images")
        .select("id, work_id, image_url, position")
        .eq("work_id", workId)
        .order("position", { ascending: true, nullsFirst: false });
    return (data as WorkImageRow[] | null) ?? [];
}

function pickHero(work: WorkRow | null, images: WorkImageRow[]): string | null {
    return work?.cover_image ?? images[0]?.image_url ?? null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
    const { slug } = await params;
    const work = await resolveWorkBySlug(slug);
    if (!work) {
        return {
            title: "Project not found — CDS Space",
            robots: { index: false, follow: false },
        };
    }

    const images = await fetchImages(work.id);
    const hero = pickHero(work, images);
    const url = `${SITE_URL}/work/${slugifyTitle(work.title)}`;
    const title = `${work.title} — CDS Space`;
    const description =
        work.description?.slice(0, 200) ??
        `A ${work.category ?? "design"} project by CDS Space.`;
    const keywords = [
        work.title,
        work.category,
        work.industry,
        "CDS Space",
        "branding",
        "design portfolio",
    ].filter(Boolean) as string[];

    return {
        title,
        description,
        keywords,
        alternates: { canonical: url },
        openGraph: {
            title,
            description,
            url,
            siteName: "CDS Space",
            type: "article",
            images: hero
                ? [{ url: hero, width: 1920, height: 1080, alt: work.title }]
                : undefined,
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            images: hero ? [hero] : undefined,
            site: "@cdsspace_",
            creator: "@cdsspace_",
        },
    };
}

function splitLines(input: string | null | undefined): string[] | null {
    if (!input) return null;
    const parts = input
        .split(/\r?\n|,/)
        .map((s) => s.trim())
        .filter(Boolean);
    return parts.length ? parts : null;
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

export default async function WorkDetailPage({ params }: { params: Params }) {
    const { slug } = await params;
    const work = await resolveWorkBySlug(slug);
    if (!work) notFound();

    const images = await fetchImages(work.id);
    const hero = pickHero(work, images);
    const gallery = hero ? images.filter((img) => img.image_url !== hero) : images;

    return (
        <main className="min-h-screen bg-brand-bg pb-24">
            <div className="max-w-[960px] mx-auto bg-white md:my-8 md:rounded-3xl overflow-hidden md:shadow-2xl">
                <header className="sticky top-0 z-20 bg-white/95 backdrop-blur px-5 md:px-10 py-4 flex items-center justify-between gap-3 border-b border-gray-100">
                    <div className="min-w-0 flex items-center gap-3">
                        <NextLink
                            href="/work"
                            aria-label="Back to work"
                            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 hover:text-[#040B37] transition"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            <span className="hidden sm:inline">Work</span>
                        </NextLink>
                        <h1 className="text-[#040B37] text-[18px] md:text-[22px] font-semibold tracking-tight truncate">
                            {work.title}
                        </h1>
                        {work.category && (
                            <span className="shrink-0 hidden sm:inline-block px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold uppercase tracking-wide">
                                Completed
                            </span>
                        )}
                    </div>
                </header>

                {hero && (
                    <div className="relative w-full aspect-video bg-gray-100">
                        <Image
                            src={hero}
                            alt={work.title}
                            fill
                            priority
                            sizes="(min-width: 960px) 960px, 100vw"
                            className="object-cover"
                        />
                    </div>
                )}

                <div className="px-5 md:px-10 py-8 md:py-12">
                    {work.description && (
                        <section className="mb-10 md:mb-14">
                            <p className="text-[#9CA3AF] text-xs md:text-sm font-medium uppercase tracking-wide mb-2">
                                About
                            </p>
                            <p className="text-[#4B5563] text-[15px] md:text-[17px] leading-[1.7] font-medium max-w-[720px]">
                                {work.description}
                            </p>
                        </section>
                    )}

                    <section className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 pb-10 md:pb-14 border-b border-gray-100">
                        <Meta label="Industry" lines={splitLines(work.industry)} />
                        <Meta
                            label="Project Scope"
                            lines={splitLines(work.project_scope) ?? splitLines(work.category)}
                        />
                        <Meta label="Deliverables" lines={splitLines(work.deliverables)} />
                        <Meta label="Timeline" lines={splitLines(work.timeline)} />
                    </section>

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
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
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

                    {gallery.length === 0 && !hero && (
                        <p className="mt-10 text-center text-gray-400 text-sm">
                            This project has no images uploaded yet.
                        </p>
                    )}
                </div>
            </div>
        </main>
    );
}
