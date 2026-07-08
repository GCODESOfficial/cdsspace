/**
 * Seed pricelist - the CDS Space "Professional Brand Identity Pricing"
 * catalog (effective May 1, 2026) across NGN, USD and RWF.
 *
 * This is used two ways:
 *   1. As the fallback returned by the server layer when the `pricing_lists`
 *      table is empty or the migration hasn't run yet (mirrors how the legal
 *      pages fall back to default-content).
 *   2. As the reference shape the PDF extractor targets.
 */
import type { PricingListData } from "./types";

export const BRAND_IDENTITY_SLUG = "brand-identity";

export const BRAND_IDENTITY_SEED: PricingListData = {
    id: "seed-brand-identity",
    slug: BRAND_IDENTITY_SLUG,
    title: "Professional Brand Identity Pricing",
    subtitle:
        "Strategy, design consistency, customer trust, and stronger market positioning - for founders, SMEs, institutions, and growing brands.",
    currencies: ["ngn", "usd", "rwf"],
    currencyMeta: {
        ngn: {
            market: "Nigeria Market",
            note: "This Nigeria pricing is listed in NGN and rounded for easier client quotation and invoicing. Pricing is localized for the Nigeria market and should be confirmed before proposal issuance.",
        },
        usd: {
            market: "International Market",
            note: "This international pricing is listed in USD for remote and cross-border engagements. Local taxes, transfer charges, and third-party fees may apply where relevant.",
        },
        rwf: {
            market: "Rwanda Market",
            note: "This Rwanda pricing is listed in RWF and rounded for easier client quotation and invoicing. Pricing is localized for the Rwanda market and should be confirmed before proposal issuance.",
        },
    },
    preparedBy: "CDS Space Branding Agency",
    website: "cdsspace.pro",
    email: "support@cdsspace.pro",
    effectiveDate: "May 1, 2026",
    tagline: "Best attracts Best",
    contextNote:
        "This price list covers brand strategy, identity design, collateral design, and creative direction. It does not cover print production, signage materials, installation, paid advertising, photography, video production, legal registration, travel, or third-party tools unless those items are quoted separately.",
    packages: [
        {
            id: "logo-identity-starter",
            name: "Logo Identity Starter",
            tagline: "Professional logo foundation for new brands.",
            price: { amounts: { ngn: "230,000", usd: "180", rwf: "280,000" } },
            bestFor:
                "Founders and small businesses that need a clean logo system and basic identity direction.",
            timeline: "5 to 7 working days",
            revision: "2 revision rounds",
            deliverables: [
                "Brand discovery questionnaire and identity brief.",
                "Two initial logo concepts with one selected direction developed to final.",
                "Primary logo, secondary layout, logo icon or favicon.",
                "Logo rationale, typography recommendation, and core color palette.",
                "Full color, black, white, and monochrome logo versions.",
                "Final export files in PNG, JPG, PDF, and SVG formats.",
                "Simple logo usage note for correct application.",
            ],
            notIncluded:
                "Full brand guideline, stationery suite, social templates, packaging, signage, and strategy workshop.",
        },
        {
            id: "brand-identity-essentials",
            name: "Brand Identity Essentials",
            tagline: "Recommended for SMEs that need market-ready brand basics.",
            price: { amounts: { ngn: "420,000", usd: "320", rwf: "480,000" } },
            bestFor:
                "SMEs, service businesses, consultants, retail brands, and startups preparing for public launch.",
            timeline: "10 to 14 working days",
            revision: "3 revision rounds",
            deliverables: [
                "Everything in Logo Identity Starter.",
                "Mini brand guide with logo usage, colors, typography, spacing, and visual tone.",
                "Letterhead design, business card design, and email signature direction.",
                "Social media cover or digital banner design.",
                "Corporate flyer design for brand introduction or service promotion.",
                "Basic collateral: invoice or receipt template plus staff ID card design.",
                "Social media profile icon and basic brand display assets.",
            ],
            notIncluded:
                "Full brand strategy, extended collateral suite, one month social media content, website, print production, and installation.",
        },
        {
            id: "brand-growth-system",
            name: "Brand Growth System",
            tagline: "Deeper identity system for brands ready to grow visibility.",
            price: { amounts: { ngn: "780,000", usd: "600", rwf: "880,000" } },
            bestFor:
                "Growing companies that need a more complete identity, stronger positioning, and repeatable design assets.",
            timeline: "2 to 3 weeks",
            revision: "3 revision rounds",
            popular: true,
            deliverables: [
                "Brand discovery call and focused positioning session.",
                "Three logo concept directions with one direction developed to final.",
                "Logo system, color system, typography system, and image style direction.",
                "Complete stationery suite: letterhead, business card, invoice, receipt, envelope, stamp, and staff ID.",
                "Social media design kit with 10 unique designs or reusable templates.",
                "Corporate flyer and brand introduction assets.",
                "Three collateral or merchandise mockups such as T-shirt, cap, bag, packaging, badge, or delivery bag.",
                "Basic signage concept direction for external or office use.",
                "Full brand style guide for consistent use across digital and print channels.",
            ],
            notIncluded:
                "Brand profile, product catalogue, office branding design, one month creative support, website development, and production management.",
        },
        {
            id: "premium-brand-system",
            name: "Premium Brand System",
            tagline: "Complete identity package for serious launches, rebrands, and expansion.",
            price: { amounts: { ngn: "1,350,000", usd: "1,000", rwf: "1,450,000" } },
            bestFor:
                "Companies, schools, clinics, hospitality brands, real estate brands, event brands, and institutions with multiple touchpoints.",
            timeline: "3 to 5 weeks",
            revision: "4 revision rounds",
            deliverables: [
                "Two brand strategy and creative direction sessions.",
                "Brand audit, positioning summary, audience direction, and messaging foundation.",
                "Complete logo system with variants, usage rules, typography, colors, and visual identity language.",
                "Expanded brand collateral suite: letterhead, business card, invoice, receipt, ID card, stamp, envelope, badge, T-shirt, cap, pack, delivery bag, and key stationery as relevant.",
                "Social media content design for one month, usually 15 to 18 branded designs.",
                "Brand profile or brochure design, up to 12 pages.",
                "Product or service catalogue design, up to 12 pages.",
                "Signage design direction and environmental branding concepts for up to 3 key zones.",
                "Complete brand style guideline, usually 35 to 50 pages depending on scope.",
                "Creative support for 1 month after final handover.",
            ],
            notIncluded:
                "Website development, print production, physical installation, paid ads, photography, video production, and extensive multi-location rollout.",
        },
        {
            id: "brand-strategy-identity-buildout",
            name: "Brand Strategy + Identity Buildout",
            tagline: "Strategy, identity, launch assets, and execution support.",
            price: { from: true, amounts: { ngn: "3,200,000", usd: "2,300", rwf: "3,400,000" } },
            bestFor:
                "Founders, funded startups, corporate teams, public campaigns, and brands entering a new market or launching a serious product.",
            timeline: "6 to 10 weeks",
            revision: "Milestone-based revisions",
            deliverables: [
                "Brand discovery sprint with leadership or stakeholder alignment.",
                "Brand roadmap covering goals, audience, positioning, offer structure, and rollout priorities.",
                "Brand strategy document with positioning, messaging, customer persona, competitor frame, tone, and creative direction.",
                "Premium Brand System deliverables included as the identity foundation.",
                "Marketing design direction, launch campaign concepts, and ad creative framework.",
                "Website structure, customer onboarding flow, and landing page direction. Development can be included after technical scope approval.",
                "Market strategy plan and implementation checklist.",
                "Project review session before final delivery and handover.",
            ],
            notIncluded:
                "Heavy research studies, media buying, third-party subscriptions, field activation, print production, app development, and travel costs unless quoted.",
        },
        {
            id: "enterprise-brand-infrastructure",
            name: "Enterprise Brand Infrastructure",
            tagline: "Custom identity and rollout infrastructure for complex organizations.",
            price: { from: true, amounts: { ngn: "6,500,000", usd: "4,600", rwf: "6,900,000" } },
            bestFor:
                "Multi-branch companies, franchised businesses, government projects, events across multiple venues, and brands operating across cities or countries.",
            timeline: "Custom timeline after scope mapping",
            revision: "Milestone-based revisions",
            deliverables: [
                "Enterprise brand audit, brand architecture, naming system, and identity hierarchy where required.",
                "Complete visual identity system across parent brand, sub-brands, departments, products, or locations.",
                "Digital brand system for marketing, presentations, social media, website, internal documents, and customer communication.",
                "Signage, wayfinding, office branding, retail, event, or environmental brand design system.",
                "Implementation manual for internal teams, external vendors, and production partners.",
                "Rollout planning for multiple venues, cities, branches, or campaigns.",
                "Optional production and installation management under a separate execution budget.",
                "Executive review sessions and post-launch creative direction support.",
            ],
            notIncluded:
                "Production materials, installation labor, travel, venue permits, manufacturing, hardware, paid media, legal registration, and third-party platform fees.",
        },
    ],
    recommendedPaths: [
        { when: "New business with limited budget", choose: "Start with Logo Identity Starter or Brand Identity Essentials." },
        { when: "SME preparing for a better market image", choose: "Choose Brand Identity Essentials or Brand Growth System." },
        { when: "Business launching, rebranding, or expanding", choose: "Choose Premium Brand System." },
        { when: "Serious founder, corporate team, or market-entry project", choose: "Choose Brand Strategy + Identity Buildout." },
        { when: "Multi-location, multi-product, or multi-city project", choose: "Request an Enterprise Brand Infrastructure scope." },
    ],
    addOns: [
        { name: "Brand strategy session", price: { amounts: { ngn: "250,000", usd: "180", rwf: "280,000" } } },
        { name: "Brand naming and tagline development", price: { amounts: { ngn: "390,000", usd: "275", rwf: "420,000" } } },
        { name: "Brand audit report", price: { amounts: { ngn: "320,000", usd: "230", rwf: "340,000" } } },
        { name: "Company profile or brochure, up to 12 pages", price: { amounts: { ngn: "460,000", usd: "320", rwf: "480,000" } } },
        { name: "Product or service catalogue, up to 12 pages", price: { amounts: { ngn: "500,000", usd: "365", rwf: "550,000" } } },
        { name: "Social media design kit, 10 designs", price: { amounts: { ngn: "320,000", usd: "230", rwf: "340,000" } } },
        { name: "Motion logo intro", price: { amounts: { ngn: "320,000", usd: "230", rwf: "340,000" } } },
        { name: "Packaging label design per SKU", price: { from: true, amounts: { ngn: "230,000", usd: "165", rwf: "250,000" } } },
        { name: "Signage and wayfinding design", price: { from: true, amounts: { ngn: "390,000", usd: "275", rwf: "420,000" } } },
        { name: "Website UI design", price: { from: true, amounts: { ngn: "780,000", usd: "550", rwf: "830,000" } } },
        { name: "Website development", price: { from: true, amounts: { ngn: "1,300,000", usd: "900", rwf: "1,380,000" } } },
        {
            name: "Print production or installation management",
            text: {
                ngn: "15% of production budget or from NGN 250,000",
                usd: "15% of production budget or from USD 180",
                rwf: "15% of production budget or from RWF 280,000",
            },
        },
        {
            name: "Monthly creative support retainer",
            text: { ngn: "From NGN 1,000,000 per month", usd: "From USD 730 per month", rwf: "From RWF 1,100,000 per month" },
        },
        {
            name: "Rush delivery fee",
            text: { ngn: "+30% to +50% of project fee", usd: "+30% to +50% of project fee", rwf: "+30% to +50% of project fee" },
        },
    ],
    deliveryProcess: [
        { title: "Discovery", detail: "Client completes brand brief, shares business information, goals, references, and required materials." },
        { title: "Strategy and direction", detail: "CDS Space defines the visual and strategic direction based on the selected package." },
        { title: "Identity design", detail: "Logo system, typography, colors, visual language, and key brand assets are created." },
        { title: "Collateral design", detail: "Corporate materials, marketing assets, social media assets, signage, or environmental design are prepared where included." },
        { title: "Review and refinement", detail: "Client feedback is collected in clear revision rounds and applied based on package scope." },
        { title: "Handover", detail: "Final exports, guidelines, and source files are released after full payment." },
        { title: "Optional rollout support", detail: "CDS Space may support production, installation, campaign deployment, or monthly creative direction under a separate quote." },
    ],
    terms: [
        { label: "Payment structure", detail: "Logo and Essentials projects may require full payment or 70% upfront and 30% before handover. Growth and Premium projects use 70% upfront and 30% before final files. Strategy and Enterprise projects may use 50% kickoff, 30% milestone, and 20% before handover." },
        { label: "Project start", detail: "Timeline begins after payment confirmation, completed brand brief, and required client materials." },
        { label: "Revision rule", detail: "A revision round means one consolidated feedback list from the client. Change of direction after approval may require a new quote." },
        { label: "Final files", detail: "Editable source files and final exports are released after full payment." },
        { label: "Validity", detail: "Prices are valid for 14 days from proposal date because of currency volatility, software costs, production cost changes, and project capacity." },
        { label: "Exclusions", detail: "Prices exclude taxes, print production, installation, media buying, photography, video production, legal registration, travel, accommodation, venue permits, hardware, and third-party subscriptions unless stated in writing." },
        { label: "Production support", detail: "CDS Space can manage print production, signage, wayfinding, and installation across venues or cities under a separate production quote and project management fee." },
        { label: "Refunds and cancellation", detail: "Strategy and design services are non-refundable once work begins. Approved milestones, completed work, and booked capacity are billable." },
    ],
    published: true,
};
