"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Plus } from "lucide-react";

type Suggestion = { id: string; name: string; usage_count?: number };

/**
 * Generic searchable input with auto-suggestions + "use as new value" fallback.
 * Wired to `/api/admin/finance/expenditures/suggestions?field=…` by default,
 * but any endpoint returning `{ suggestions: [{ id, name }] }` works.
 */
export function SuggestionInput({
    field,
    value,
    onChange,
    placeholder,
    endpoint = "/api/admin/finance/expenditures/suggestions",
    className = "",
    inputClassName = "h-11 rounded-xl",
}: {
    field: "title" | "category";
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    endpoint?: string;
    className?: string;
    inputClassName?: string;
}) {
    const [open, setOpen] = useState(false);
    const [matches, setMatches] = useState<Suggestion[]>([]);
    const [query, setQuery] = useState(value);
    const wrapRef = useRef<HTMLDivElement | null>(null);

    // Keep the internal query mirrored to the parent `value` when the form
    // itself resets (e.g. new expenditure after submit).
    useEffect(() => {
        setQuery(value);
    }, [value]);

    useEffect(() => {
        const t = setTimeout(async () => {
            try {
                const url = `${endpoint}?field=${encodeURIComponent(field)}&q=${encodeURIComponent(query)}&limit=12`;
                const r = await fetch(url);
                if (!r.ok) { setMatches([]); return; }
                const d = await r.json();
                setMatches(Array.isArray(d.suggestions) ? d.suggestions : []);
            } catch {
                setMatches([]);
            }
        }, 150);
        return () => clearTimeout(t);
    }, [query, field, endpoint]);

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (!wrapRef.current) return;
            if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        window.addEventListener("mousedown", onClick);
        return () => window.removeEventListener("mousedown", onClick);
    }, []);

    const select = (s: Suggestion) => {
        onChange(s.name);
        setQuery(s.name);
        setOpen(false);
    };

    const exact = matches.find((m) => m.name.toLowerCase() === query.trim().toLowerCase());
    const showCreate = query.trim().length > 0 && !exact;

    return (
        <div ref={wrapRef} className={`relative ${className}`}>
            <input
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
                    onChange(e.target.value);
                    setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                placeholder={placeholder}
                autoComplete="off"
                className={`w-full px-3 border border-gray-200 text-sm bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 ${inputClassName}`}
            />
            {open && (matches.length > 0 || showCreate) && (
                <div className="absolute left-0 right-0 top-full mt-1 z-40 rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden">
                    {matches.map((s) => {
                        const active = s.name.toLowerCase() === query.trim().toLowerCase();
                        return (
                            <button
                                key={s.id}
                                type="button"
                                onMouseDown={(e) => { e.preventDefault(); select(s); }}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 transition ${active ? "bg-blue-50/60" : ""}`}
                            >
                                <span className="flex-1 truncate text-[13.5px] text-[#0D1B39]">{s.name}</span>
                                {active && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                                {typeof s.usage_count === "number" && (
                                    <span className="text-[10.5px] text-gray-400">×{s.usage_count}</span>
                                )}
                            </button>
                        );
                    })}
                    {showCreate && (
                        <button
                            type="button"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                onChange(query.trim());
                                setOpen(false);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left bg-gray-50 hover:bg-gray-100 transition border-t border-gray-100"
                        >
                            <Plus className="w-3.5 h-3.5 text-blue-600" />
                            <span className="text-[13px] text-[#0D1B39] font-medium truncate">
                                Use “{query.trim()}” as a new {field}
                            </span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
