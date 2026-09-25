/**
 * Everything a tutorial can be filed under: the tools, modules and pages of
 * the platform.
 *
 * A tutorial used to belong to exactly one tool, so a video covering, say,
 * letterheads across the CREATE studio and the Executive Board had to be
 * uploaded twice. Tutorials now carry tags from this catalogue, and appear on
 * every screen they are tagged with.
 *
 * The labels match the screen names used everywhere else in the product, so
 * an admin tagging a video recognises what they are choosing.
 */
export type TutorialTargetKind = "tool" | "module" | "page";

export type TutorialTarget = {
  slug: string;
  label: string;
  kind: TutorialTargetKind;
  /** Which portal the screen belongs to, shown beside the label when tagging. */
  portal: "Admin" | "Team" | "Client";
};

export const TUTORIAL_TARGETS: TutorialTarget[] = [
  // The original single-tool slugs, kept so tutorials uploaded before tagging
  // keep working and keep showing on the screens they were filed under.
  { slug: "official-letterhead", label: "Create letterhead", kind: "tool", portal: "Admin" },
  { slug: "create-studio", label: "Create Studio", kind: "tool", portal: "Client" },
  { slug: "cdrive", label: "cDrive", kind: "tool", portal: "Client" },
  { slug: "chat", label: "Chat", kind: "tool", portal: "Client" },
  { slug: "cmeet", label: "cMeet", kind: "tool", portal: "Client" },
  { slug: "brand-brief", label: "Brand brief", kind: "page", portal: "Client" },
  { slug: "brand-identity", label: "Brand identity", kind: "page", portal: "Client" },
  { slug: "banners", label: "Banners", kind: "tool", portal: "Client" },
  { slug: "merch", label: "Merch", kind: "tool", portal: "Client" },
  { slug: "invoices", label: "Invoices", kind: "page", portal: "Client" },

  { slug: "team-dashboard", label: "Team overview", kind: "page", portal: "Team" },
  { slug: "team-taskboard", label: "Taskboard", kind: "tool", portal: "Team" },
  { slug: "team-timebook", label: "Attendance", kind: "page", portal: "Team" },
  { slug: "team-work", label: "Projects", kind: "module", portal: "Team" },
  { slug: "team-deliveries", label: "Delivery drafts", kind: "page", portal: "Team" },
  { slug: "team-work-tracking", label: "Weekly report", kind: "page", portal: "Team" },
  { slug: "team-compliance", label: "Team compliance", kind: "module", portal: "Team" },
  { slug: "team-equipment", label: "My equipment", kind: "tool", portal: "Team" },
  { slug: "team-protect-docs", label: "Protect docs", kind: "page", portal: "Team" },
  { slug: "team-cmeet", label: "cMeet", kind: "tool", portal: "Team" },
  { slug: "team-cdocs", label: "cDocs", kind: "tool", portal: "Team" },
  { slug: "team-csign", label: "cSign", kind: "tool", portal: "Team" },
  { slug: "team-settings", label: "Settings", kind: "page", portal: "Team" },
  { slug: "team-screening", label: "Screening questions", kind: "page", portal: "Team" },
  { slug: "admin-dashboard", label: "Admin dashboard", kind: "page", portal: "Admin" },
  { slug: "admin-finance", label: "Finance home", kind: "module", portal: "Admin" },
  { slug: "admin-finance-invoices", label: "Invoices", kind: "page", portal: "Admin" },
  { slug: "admin-finance-quotations", label: "Quotations", kind: "page", portal: "Admin" },
  { slug: "admin-finance-expenditures", label: "Expenditures", kind: "page", portal: "Admin" },
  { slug: "admin-finance-payroll", label: "Payroll", kind: "page", portal: "Admin" },
  { slug: "admin-finance-pricelists", label: "Pricelists", kind: "tool", portal: "Admin" },
  { slug: "admin-finance-audit", label: "Financial audit", kind: "page", portal: "Admin" },
  { slug: "admin-executive-board", label: "Executive board", kind: "module", portal: "Admin" },
  { slug: "admin-executive-board-budgets", label: "Budgets", kind: "page", portal: "Admin" },
  { slug: "admin-executive-board-expansion-budgets", label: "Expansion budgets", kind: "page", portal: "Admin" },
  { slug: "admin-executive-board-targets", label: "Targets", kind: "page", portal: "Admin" },
  { slug: "admin-executive-board-revenue-models", label: "Revenue models", kind: "page", portal: "Admin" },
  { slug: "admin-executive-board-vault", label: "Document vault", kind: "tool", portal: "Admin" },
  { slug: "admin-executive-board-letterhead", label: "Create LH doc", kind: "tool", portal: "Admin" },
  { slug: "admin-deals", label: "Deals", kind: "module", portal: "Admin" },
  { slug: "admin-deals-proposals", label: "Proposals", kind: "page", portal: "Admin" },
  { slug: "admin-deals-brand-audits", label: "Brand audits", kind: "page", portal: "Admin" },
  { slug: "admin-deals-prospect-generation", label: "Prospect generation", kind: "page", portal: "Admin" },
  { slug: "admin-deals-prospects", label: "Prospect checklist", kind: "page", portal: "Admin" },
  { slug: "admin-deals-pipeline", label: "Prospect pipeline", kind: "page", portal: "Admin" },
  { slug: "admin-clients", label: "Sales hub", kind: "module", portal: "Admin" },
  { slug: "admin-clients-list", label: "Client directory", kind: "page", portal: "Admin" },
  { slug: "admin-clients-deliveries", label: "Client deliveries", kind: "page", portal: "Admin" },
  { slug: "admin-clients-mailings", label: "Client mailings", kind: "page", portal: "Admin" },
  { slug: "admin-clients-banners", label: "Banner configuration", kind: "tool", portal: "Admin" },
  { slug: "admin-clients-merch", label: "Merch commerce", kind: "tool", portal: "Admin" },
  { slug: "admin-clients-modules", label: "Dashboard modules", kind: "page", portal: "Admin" },
  { slug: "admin-clients-sales-scripts", label: "Sales scripts", kind: "page", portal: "Admin" },
  { slug: "admin-clients-sales-settings", label: "Sales settings", kind: "page", portal: "Admin" },
  { slug: "admin-orders", label: "Client orders", kind: "page", portal: "Admin" },
  { slug: "admin-consultations", label: "Consultation requests", kind: "page", portal: "Admin" },
  { slug: "admin-announcements", label: "Announcements", kind: "page", portal: "Admin" },
  { slug: "admin-content-hub", label: "Content hub", kind: "module", portal: "Admin" },
  { slug: "admin-content-hub-calendar", label: "Content calendar", kind: "page", portal: "Admin" },
  { slug: "admin-content-hub-create", label: "Create content", kind: "tool", portal: "Admin" },
  { slug: "admin-content-hub-library", label: "Content library", kind: "page", portal: "Admin" },
  { slug: "admin-content-hub-visual-library", label: "Visual library", kind: "page", portal: "Admin" },
  { slug: "admin-content-hub-approvals", label: "Approval queue", kind: "page", portal: "Admin" },
  { slug: "admin-equipment-inventory", label: "Equipment inventory", kind: "tool", portal: "Admin" },
  { slug: "admin-legal", label: "Legal documents", kind: "page", portal: "Admin" },
  { slug: "admin-audit-report", label: "Audit and report", kind: "page", portal: "Admin" },
  { slug: "admin-departments", label: "Departments", kind: "page", portal: "Admin" },
  { slug: "admin-applications", label: "Applicants", kind: "page", portal: "Admin" },
  { slug: "admin-hrm", label: "HRM", kind: "module", portal: "Admin" },
  { slug: "admin-taskboard", label: "Taskboard", kind: "tool", portal: "Admin" },
  { slug: "admin-team-compliance", label: "Team compliance", kind: "module", portal: "Admin" },
  { slug: "admin-csign", label: "cSign", kind: "tool", portal: "Admin" },
  { slug: "admin-cdocs", label: "cDocs", kind: "tool", portal: "Admin" },
  { slug: "admin-cmeet", label: "cMeet", kind: "tool", portal: "Admin" },
  { slug: "admin-tutorials", label: "Tutorials", kind: "tool", portal: "Admin" },
  { slug: "client-dashboard", label: "Dashboard", kind: "page", portal: "Client" },
  { slug: "client-orders", label: "My orders", kind: "page", portal: "Client" },
  { slug: "client-invoices", label: "My invoices", kind: "page", portal: "Client" },
  { slug: "client-documents", label: "cDrive", kind: "page", portal: "Client" },
  { slug: "client-cdrive", label: "cDrive", kind: "tool", portal: "Client" },
  { slug: "client-brand-brief", label: "Your brand brief", kind: "page", portal: "Client" },
  { slug: "client-brand-identity", label: "Brand identity", kind: "page", portal: "Client" },
  { slug: "client-cmeet", label: "cMeet", kind: "tool", portal: "Client" },
  { slug: "client-book-session", label: "Book a session", kind: "page", portal: "Client" },
  { slug: "client-subscription", label: "Subscription", kind: "module", portal: "Client" },
  { slug: "client-settings", label: "Account settings", kind: "page", portal: "Client" },
  { slug: "client-banners", label: "Banners", kind: "tool", portal: "Client" },
  { slug: "client-merch", label: "Merch studio", kind: "tool", portal: "Client" },
  { slug: "client-cgifts", label: "cGifts", kind: "tool", portal: "Client" },
  { slug: "client-blog", label: "CDS Space Intelligence", kind: "page", portal: "Client" },
  { slug: "client-intelligence", label: "CDS Space Intelligence", kind: "module", portal: "Client" },
  { slug: "client-tutorials", label: "Tutorials", kind: "tool", portal: "Client" },
  { slug: "admin-upload-works", label: "Upload new work", kind: "page", portal: "Admin" },
  { slug: "admin-faqs", label: "FAQs", kind: "page", portal: "Admin" },
  { slug: "admin-brand-briefs", label: "Brand briefs", kind: "page", portal: "Admin" },
  { slug: "admin-pricing", label: "Plan pricing", kind: "page", portal: "Admin" },
  { slug: "admin-intelligence", label: "Intelligence", kind: "module", portal: "Admin" },
  { slug: "admin-intelligence-library", label: "Publication library", kind: "page", portal: "Admin" },
  { slug: "admin-intelligence-create", label: "Create publication", kind: "tool", portal: "Admin" },
  { slug: "admin-intelligence-private", label: "Private reports", kind: "page", portal: "Admin" },
  { slug: "admin-intelligence-comments", label: "Comment moderation", kind: "page", portal: "Admin" },
  { slug: "admin-intelligence-analytics", label: "Intelligence analytics", kind: "page", portal: "Admin" },
  { slug: "admin-intelligence-authors", label: "Authors and contributors", kind: "page", portal: "Admin" },
  { slug: "admin-intelligence-taxonomy", label: "Taxonomy", kind: "page", portal: "Admin" },
  { slug: "admin-intelligence-archive", label: "Publication archive", kind: "page", portal: "Admin" },
  { slug: "admin-intelligence-settings", label: "Intelligence settings", kind: "page", portal: "Admin" },
  { slug: "admin-ai-system", label: "AI system", kind: "page", portal: "Admin" },
  { slug: "admin-cmeet-api", label: "cMeet API access", kind: "tool", portal: "Admin" },
  { slug: "admin-cresume", label: "cResume", kind: "tool", portal: "Admin" },
  { slug: "admin-team-members", label: "Team members", kind: "page", portal: "Admin" },
  { slug: "admin-work-tracking", label: "Work activity", kind: "page", portal: "Admin" },
  { slug: "admin-team-reports", label: "Team reports", kind: "page", portal: "Admin" },
  { slug: "admin-sub-admins", label: "Sub-admins", kind: "page", portal: "Admin" },
  { slug: "admin-screening", label: "Applicant screening", kind: "page", portal: "Admin" },
  { slug: "admin-team-payroll", label: "Team payroll", kind: "page", portal: "Admin" },
  { slug: "admin-projects", label: "Projects", kind: "module", portal: "Admin" },
  { slug: "admin-vendors", label: "Vendors", kind: "page", portal: "Admin" },
  { slug: "admin-testimonials", label: "Testimonials", kind: "page", portal: "Admin" },];

const BY_SLUG = new Map(TUTORIAL_TARGETS.map((target) => [target.slug, target]));

export function tutorialTarget(slug: string) {
  return BY_SLUG.get(slug) || null;
}

export function tutorialTargetLabel(slug: string) {
  return BY_SLUG.get(slug)?.label || slug;
}

export function isTutorialTarget(slug: unknown): slug is string {
  return typeof slug === "string" && BY_SLUG.has(slug);
}

/** Type-ahead matching: label, portal and slug, so "invoice" finds every invoice screen. */
export function searchTutorialTargets(query: string, limit = 12) {
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const scored = TUTORIAL_TARGETS.map((target) => {
    const haystack = `${target.label} ${target.portal} ${target.kind} ${target.slug}`.toLocaleLowerCase();
    if (!terms.every((term) => haystack.includes(term))) return null;
    const label = target.label.toLocaleLowerCase();
    // A name that starts with what was typed is what the person meant.
    const score = terms.every((term) => label.startsWith(term)) ? 0 : label.includes(terms[0] || "") ? 1 : 2;
    return { target, score };
  }).filter(Boolean) as Array<{ target: TutorialTarget; score: number }>;
  scored.sort((a, b) => a.score - b.score || a.target.label.localeCompare(b.target.label));
  return scored.slice(0, limit).map((entry) => entry.target);
}
