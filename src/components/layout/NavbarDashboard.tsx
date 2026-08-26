"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    ArrowRight,
    FileText,
    FolderOpen,
    LayoutDashboard,
    Library,
    Loader2,
    MessageSquare,
    Palette,
    ReceiptText,
    Search,
    Settings,
    ShoppingBag,
    X,
} from "lucide-react";
import NotificationBell from "@/components/notifications/notification-bell";
import { useClientAccount } from "@/components/dashboard/ClientAccountProvider";

interface NavbarDashboardProps {
    onMenuClick?: () => void;
}

interface DashboardSearchResult {
    id: string;
    group: string;
    title: string;
    description: string;
    href: string;
}

const dashboardSearchPages = [
    { id: "page:dashboard", group: "Pages", title: "Dashboard", description: "Overview, quick actions and recent activity", href: "/dashboard", keywords: "home overview activity word of the day" },
    { id: "page:intelligence", group: "Pages", title: "Intelligence", description: "Research, audits and market insights", href: "/dashboard/intelligence", keywords: "articles blog publications reports intelligence research audit insights" },
    { id: "page:brief", group: "Pages", title: "Brand Brief", description: "Build, edit or upload your brand brief", href: "/dashboard/brand-brief", keywords: "brand strategy identity brief company audience goals" },
    { id: "page:identity", group: "Pages", title: "Brand Identity", description: "View completed identity work and brand assets", href: "/dashboard/brand-identity", keywords: "logo guidelines assets fonts colours files delivery" },
    { id: "page:messages", group: "Pages", title: "Chat/Meet", description: "Messages, documents, and calls with CDS Space", href: "/dashboard/messages", keywords: "message chat meet call conversation support" },
    { id: "page:orders", group: "Pages", title: "Orders", description: "Design, banner, merch and recurring orders", href: "/dashboard/orders", keywords: "jobs projects requests banner merch design recurring status" },
    { id: "page:invoices", group: "Pages", title: "Invoices", description: "Billing documents, balances and payment status", href: "/dashboard/invoices", keywords: "billing payment quote receipt currency budget finance" },
    { id: "page:documents", group: "Pages", title: "Documents", description: "Files and documents shared with your account", href: "/dashboard/documents", keywords: "files uploads downloads project documents" },
    { id: "page:settings", group: "Pages", title: "Account Config", description: "Profile, password, payment method and billing preferences", href: "/dashboard/settings", keywords: "settings profile company account password billing currency payment card paystack subscription preference" },
] as const;

const resultIcons: Record<string, typeof Search> = {
    Pages: LayoutDashboard,
    Intelligence: Library,
    "Brand workspace": Palette,
    Orders: ShoppingBag,
    Invoices: ReceiptText,
    Documents: FolderOpen,
    Messages: MessageSquare,
};

function pageMatches(query: string) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return dashboardSearchPages.filter((page) =>
        `${page.title} ${page.description} ${page.keywords}`.toLowerCase().includes(normalized),
    );
}

export const NavbarDashboard = ({ onMenuClick }: NavbarDashboardProps) => {
    const router = useRouter();
    const { account, dashboardPath } = useClientAccount();
    const searchRootRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const listboxId = useId();
    const [query, setQuery] = useState("");
    const [remoteResults, setRemoteResults] = useState<DashboardSearchResult[]>([]);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const userName = account.fullName || account.email.split("@")[0] || "User";
    const userCompany = account.companyName || "Best Client Account";
    const parts = userName.trim().split(/\s+/).filter(Boolean);
    const userInitials = parts.length > 1
        ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
        : userName.substring(0, 2).toUpperCase();

    const localResults = useMemo<DashboardSearchResult[]>(() => pageMatches(query).map((page) => ({
        id: page.id,
        group: page.group,
        title: page.title,
        description: page.description,
        href: page.href,
    })), [query]);
    const results = useMemo(() => [...localResults, ...remoteResults], [localResults, remoteResults]);
    const groupedResults = useMemo(() => {
        const groups = new Map<string, Array<{ result: DashboardSearchResult; index: number }>>();
        results.forEach((result, index) => {
            const group = groups.get(result.group) || [];
            group.push({ result, index });
            groups.set(result.group, group);
        });
        return Array.from(groups.entries());
    }, [results]);

    useEffect(() => {
        const normalized = query.trim();
        setActiveIndex(0);
        setSearchError(false);
        if (normalized.length < 2) {
            setRemoteResults([]);
            setSearching(false);
            return;
        }

        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            setSearching(true);
            try {
                const response = await fetch(`/api/client/search?q=${encodeURIComponent(normalized)}`, {
                    credentials: "include",
                    cache: "no-store",
                    signal: controller.signal,
                });
                if (!response.ok) throw new Error("Search unavailable");
                const payload = await response.json() as { results?: DashboardSearchResult[] };
                setRemoteResults(Array.isArray(payload.results) ? payload.results : []);
            } catch (error) {
                if ((error as Error).name !== "AbortError") {
                    setRemoteResults([]);
                    setSearchError(true);
                }
            } finally {
                if (!controller.signal.aborted) setSearching(false);
            }
        }, 220);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [query]);

    useEffect(() => {
        const closeOnOutsideClick = (event: MouseEvent) => {
            if (!searchRootRef.current?.contains(event.target as Node)) setSearchOpen(false);
        };
        const focusSearch = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                searchInputRef.current?.focus();
                setSearchOpen(true);
            }
        };
        document.addEventListener("mousedown", closeOnOutsideClick);
        document.addEventListener("keydown", focusSearch);
        return () => {
            document.removeEventListener("mousedown", closeOnOutsideClick);
            document.removeEventListener("keydown", focusSearch);
        };
    }, []);

    const openResult = (result: DashboardSearchResult) => {
        const href = result.href.startsWith("/dashboard") ? dashboardPath(result.href) : result.href;
        setQuery("");
        setRemoteResults([]);
        setSearchOpen(false);
        router.push(href);
    };

    const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Escape") {
            setSearchOpen(false);
            searchInputRef.current?.blur();
            return;
        }
        if (!results.length) return;
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setSearchOpen(true);
            setActiveIndex((current) => (current + 1) % results.length);
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setSearchOpen(true);
            setActiveIndex((current) => (current - 1 + results.length) % results.length);
        } else if (event.key === "Enter") {
            event.preventDefault();
            openResult(results[activeIndex] || results[0]);
        }
    };

    return (
        <header className="h-[64px] 2xl:h-[80px] bg-white border-b border-[#E3E8F4]/40 w-full px-3 sm:px-4 lg:px-6 2xl:px-8 flex items-center justify-between gap-2 lg:gap-0 sticky top-0 z-30">
            {/* Mobile Logo */}
            <div className="lg:hidden shrink-0">
                <Image src="/dashboard/Group 1000004159.svg" alt="Logo" width={46} height={18} />
            </div>

            {/* Search */}
            <div className="flex min-w-0 flex-1 justify-center px-1 sm:px-2 lg:justify-end lg:ps-3 lg:pe-3">
                <div data-dashboard-tools className="flex items-center gap-2 sm:gap-3 2xl:gap-4 min-w-0 w-full lg:w-auto">
                    <div ref={searchRootRef} className={cn(
                        "relative",
                        "w-full max-w-[190px] sm:max-w-[260px] lg:w-[480px] lg:max-w-none xl:w-[600px] 2xl:w-[760px]"
                    )}>
                        <div className="h-10 2xl:h-11 border border-[#E3E8F4]/60 rounded-xl px-3.5 2xl:px-4 flex items-center gap-2.5 bg-[#F8F9FC] transition-all focus-within:bg-white focus-within:border-brand-blue/30 focus-within:shadow-[0_0_0_3px_rgba(5,117,255,0.06)]">
                            {searching ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-blue" /> : <Search className="h-4 w-4 shrink-0 text-[#B0B9D1]" strokeWidth={2} />}
                            <input
                                ref={searchInputRef}
                                type="search"
                                value={query}
                                onChange={(event) => {
                                    setQuery(event.target.value);
                                    setSearchOpen(Boolean(event.target.value.trim()));
                                }}
                                onFocus={() => setSearchOpen(Boolean(query.trim()))}
                                onKeyDown={handleSearchKeyDown}
                                placeholder="Search everything..."
                                autoComplete="off"
                                role="combobox"
                                aria-label="Search dashboard, Intelligence and account records"
                                aria-expanded={searchOpen && Boolean(query.trim())}
                                aria-controls={listboxId}
                                aria-activedescendant={searchOpen && results[activeIndex] ? `${listboxId}-option-${activeIndex}` : undefined}
                                className="flex-1 bg-transparent outline-none text-brand-navy text-[13px] 2xl:text-[14px] font-medium placeholder:text-[#B0B9D1] min-w-0 [&::-webkit-search-cancel-button]:hidden"
                            />
                            {query && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setQuery("");
                                        setRemoteResults([]);
                                        setSearchOpen(false);
                                        searchInputRef.current?.focus();
                                    }}
                                    className="grid size-6 shrink-0 place-items-center rounded-[8px] text-[#8E99B7] transition hover:bg-[#EDF2FB] hover:text-brand-navy"
                                    aria-label="Clear search"
                                >
                                    <X className="size-3.5" />
                                </button>
                            )}
                        </div>

                        {searchOpen && Boolean(query.trim()) && (
                            <div className="fixed left-3 right-3 top-[58px] z-[80] max-h-[min(70vh,560px)] overflow-y-auto rounded-[16px] border border-[#E3E8F4] bg-white p-2 shadow-[0_22px_60px_rgba(15,35,80,0.18)] scrollbar-hide sm:absolute sm:left-1/2 sm:right-auto sm:top-[calc(100%+10px)] sm:w-[500px] sm:-translate-x-1/2 lg:left-auto lg:right-0 lg:w-[600px] lg:translate-x-0" id={listboxId} role="listbox">
                                {groupedResults.map(([group, items]) => {
                                    const GroupIcon = resultIcons[group] || FileText;
                                    return (
                                        <div key={group} className="py-1">
                                            <div className="flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#9AA5BF]">
                                                <GroupIcon className="size-3.5" /> {group}
                                            </div>
                                            <div className="space-y-0.5">
                                                {items.map(({ result, index }) => (
                                                    <button
                                                        key={result.id}
                                                        id={`${listboxId}-option-${index}`}
                                                        type="button"
                                                        role="option"
                                                        aria-selected={activeIndex === index}
                                                        onMouseEnter={() => setActiveIndex(index)}
                                                        onClick={() => openResult(result)}
                                                        className={cn(
                                                            "group flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-start transition",
                                                            activeIndex === index ? "bg-[#F1F5FD]" : "hover:bg-[#F7F9FC]",
                                                        )}
                                                    >
                                                        <span className="grid size-9 shrink-0 place-items-center rounded-[8px] bg-[#EEF4FF] text-brand-blue">
                                                            <GroupIcon className="size-4" strokeWidth={1.9} />
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block truncate text-[13px] font-semibold text-brand-navy">{result.title}</span>
                                                            <span className="mt-0.5 block truncate text-[11px] text-[#7B87A6]">{result.description}</span>
                                                        </span>
                                                        <ArrowRight className="size-4 shrink-0 text-[#B0B9D1] transition group-hover:translate-x-0.5 group-hover:text-brand-blue rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}

                                {!results.length && !searching && (
                                    <div className="px-5 py-10 text-center">
                                        <Search className="mx-auto mb-3 size-7 text-[#C1C9DA]" />
                                        <p className="text-[13px] font-semibold text-brand-navy">{searchError ? "Search is temporarily unavailable" : "No matching results"}</p>
                                        <p className="mt-1 text-[11px] text-[#8E99B7]">Try a page name, article, invoice number, order, document or message.</p>
                                    </div>
                                )}

                                <div className="flex items-center justify-between border-t border-[#EEF1F7] px-3 pb-1 pt-2 text-[10px] text-[#9AA5BF]">
                                    <span>Account results are private to {userName}.</span>
                                    <span className="hidden sm:inline">↑↓ navigate · Enter open · Esc close</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <NotificationBell />

                    <div className="hidden lg:block w-px h-7 bg-[#E3E8F4]/40 mx-1 shrink-0" />
                </div>
            </div>

            {/* Mobile Menu */}
            <button
                type="button"
                onClick={onMenuClick}
                className="group flex h-10 w-10 shrink-0 flex-col items-end justify-center gap-[5px] rounded-full bg-[#F4F6FB] p-2.5 shadow-sm lg:hidden"
                aria-label="Open navigation"
            >
                <div className="h-[2px] w-full rounded-full bg-brand-navy transition-all group-hover:w-[80%]" />
                <div className="h-[2px] w-[80%] rounded-full bg-brand-navy transition-all group-hover:w-full" />
                <div className="h-[2px] w-full rounded-full bg-brand-navy transition-all group-hover:w-[80%]" />
            </button>

            {/* Profile (Desktop) */}
            <Link
                href={dashboardPath("/dashboard/settings")}
                data-dashboard-profile
                aria-label={`Open Account Config for ${userName}`}
                title="Open Account Config"
                className="group hidden shrink-0 items-center gap-3 rounded-xl px-1.5 py-1 outline-none transition hover:bg-[#F6F8FC] focus-visible:ring-2 focus-visible:ring-brand-blue/40 lg:flex"
            >
                <div className="flex flex-col items-end">
                    <span className="max-w-[180px] truncate text-[14px] font-semibold leading-tight text-brand-navy transition-colors group-hover:text-brand-blue 2xl:text-[15px]">{userName}</span>
                    <span className="max-w-[180px] truncate text-[11px] font-medium text-[#8E99B7] 2xl:text-[12px]">{userCompany}</span>
                </div>
                <div className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-brand-blue shadow-[0_2px_8px_rgba(28,78,209,0.2)] transition-transform group-hover:scale-105 2xl:h-10 2xl:w-10">
                    {account.avatarUrl ? (
                        <Image
                            src={account.avatarUrl}
                            alt={`${userName} profile photo`}
                            fill
                            sizes="40px"
                            className="object-cover"
                        />
                    ) : (
                        <span className="text-[13px] font-semibold text-white 2xl:text-[14px]">{userInitials}</span>
                    )}
                </div>
            </Link>
        </header>
    );
};
