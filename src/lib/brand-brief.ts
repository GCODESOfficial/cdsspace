/**
 * Shared types + field definitions for the Brand Brief flow.
 * Used by:
 *   - admin list & detail pages
 *   - public /brand-brief/[token] form
 *   - PDF exporter
 *   - share modal
 */

export type BrandBriefStatus = "pending" | "submitted" | "archived";

export interface BrandBrief {
    id: string;
    public_token: string;

    invite_label: string | null;
    invite_note: string | null;

    brand_name: string | null;
    brand_tagline: string | null;
    industry: string | null;
    brand_description: string | null;

    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;

    target_audience: string | null;
    competitors: string | null;
    unique_selling_point: string | null;

    brand_personality: string | null;
    brand_values: string | null;
    design_preferences: string | null;
    inspiration_references: string | null;

    assets_needed: string[];

    goals: string | null;
    long_term_vision: string | null;
    budget_range: string | null;
    timeline: string | null;
    additional_notes: string | null;

    status: BrandBriefStatus;
    submitted_at: string | null;
    expires_at: string | null;
    created_at: string;
    updated_at: string;
}

export const BUDGET_RANGES = [
    "Under ₦500k",
    "₦500k – ₦1M",
    "₦1M – ₦3M",
    "₦3M – ₦10M",
    "Above ₦10M",
    "Let's discuss",
] as const;

export const TIMELINE_OPTIONS = [
    "Less than 2 weeks",
    "2 – 4 weeks",
    "1 – 2 months",
    "2 – 3 months",
    "3+ months",
    "Flexible",
] as const;

export const ASSET_OPTIONS = [
    "Logo design",
    "Brand identity system",
    "Packaging design",
    "Website design",
    "Website development",
    "Social media kit",
    "Pitch deck",
    "Print collateral",
    "Photography / video",
    "Motion / animation",
    "Copywriting",
    "Brand strategy",
] as const;

/** Client-side field labels used by the form + PDF export. */
export const BRAND_BRIEF_FIELD_LABELS: Record<string, string> = {
    brand_name: "Brand name",
    brand_tagline: "Tagline / one-liner",
    industry: "Industry",
    brand_description: "What your brand does",
    contact_name: "Your name",
    contact_email: "Email",
    contact_phone: "Phone",
    target_audience: "Target audience",
    competitors: "Competitors",
    unique_selling_point: "What makes you different",
    brand_personality: "Brand personality",
    brand_values: "Brand values",
    design_preferences: "Design preferences",
    inspiration_references: "Inspiration & references",
    assets_needed: "Assets / services needed",
    goals: "Short-term goals",
    long_term_vision: "Long-term vision",
    budget_range: "Budget range",
    timeline: "Timeline",
    additional_notes: "Anything else we should know",
};

export interface BrandBriefDraft {
    brand_name: string;
    brand_tagline: string;
    industry: string;
    brand_description: string;
    contact_name: string;
    contact_email: string;
    contact_phone: string;
    target_audience: string;
    competitors: string;
    unique_selling_point: string;
    brand_personality: string;
    brand_values: string;
    design_preferences: string;
    inspiration_references: string;
    assets_needed: string[];
    goals: string;
    long_term_vision: string;
    budget_range: string;
    timeline: string;
    additional_notes: string;
}

export const EMPTY_BRAND_BRIEF_DRAFT: BrandBriefDraft = {
    brand_name: "",
    brand_tagline: "",
    industry: "",
    brand_description: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    target_audience: "",
    competitors: "",
    unique_selling_point: "",
    brand_personality: "",
    brand_values: "",
    design_preferences: "",
    inspiration_references: "",
    assets_needed: [],
    goals: "",
    long_term_vision: "",
    budget_range: "",
    timeline: "",
    additional_notes: "",
};

export function briefToDraft(b: BrandBrief): BrandBriefDraft {
    return {
        brand_name: b.brand_name ?? "",
        brand_tagline: b.brand_tagline ?? "",
        industry: b.industry ?? "",
        brand_description: b.brand_description ?? "",
        contact_name: b.contact_name ?? "",
        contact_email: b.contact_email ?? "",
        contact_phone: b.contact_phone ?? "",
        target_audience: b.target_audience ?? "",
        competitors: b.competitors ?? "",
        unique_selling_point: b.unique_selling_point ?? "",
        brand_personality: b.brand_personality ?? "",
        brand_values: b.brand_values ?? "",
        design_preferences: b.design_preferences ?? "",
        inspiration_references: b.inspiration_references ?? "",
        assets_needed: b.assets_needed ?? [],
        goals: b.goals ?? "",
        long_term_vision: b.long_term_vision ?? "",
        budget_range: b.budget_range ?? "",
        timeline: b.timeline ?? "",
        additional_notes: b.additional_notes ?? "",
    };
}
