import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Two-letter initials for avatars/logos. Uses the first letter of the first two
 * words (e.g. "Chris John" -> "CJ", "CDS Space Super Admin" -> "CS"), falling
 * back to the first two letters of a single word ("Chris" -> "CH"), or "?" when
 * empty. We render these instead of uploaded images across the app.
 */
export function initials(name?: string | null): string {
    const words = (name || "").trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "?";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Convert a title (or any string) into a URL-safe slug.
 * Lowercases, strips diacritics, replaces non-alphanumerics with single hyphens.
 */
export function getSlugFromTitle(title: string): string {
    return (title || "")
        .toString()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}