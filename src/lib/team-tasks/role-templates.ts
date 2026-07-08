/**
 * Role-based compulsory daily task templates - from the CDS Space "Compulsory
 * Daily Tasks Addendum" (effective May 1, 2026).
 *
 * These live in code (not the DB) so they're easy to edit and version. The
 * My Day API turns them into per-member/day checklist rows (completion is
 * stored in `team_daily_checklist`, keyed by the stable `template_key`).
 *
 * Everyone gets UNIVERSAL_TASKS; each member additionally gets the task +
 * evidence list for their matched role (via `roleKeyFor`).
 */

export interface RoleTemplate {
    key: string;
    name: string;
    tasks: string[];
    evidence: string[];
}

/** Universal Daily Work Discipline - applies to every role. */
export const UNIVERSAL_TASKS: string[] = [
    "Check in on the team dashboard before starting work (and check out before closing).",
    "Review assigned tasks, deadlines, messages, and project updates before starting.",
    "Update task status at start of work, after lunch, and before close of work.",
    "Escalate any blocker, missing asset, client delay, or risk within 10 minutes of discovery.",
    "Upload completed work, source files, links, screenshots, or delivery evidence to the approved folder.",
    "Maintain professional communication across WhatsApp, email, calls, and internal channels.",
    "Keep workspace, equipment, and company files clean, secure, and organized.",
    "Submit a daily close-of-work update (completed, pending, blockers, next-day priorities).",
];

export const ROLE_TEMPLATES: RoleTemplate[] = [
    {
        key: "general_manager",
        name: "Managing Director / General Manager",
        tasks: [
            "Check emails, WhatsApp Business, CRM, and lead channels for leads, deals, and urgent client communication.",
            "Ensure WhatsApp client enquiries are acknowledged within 3 minutes during working hours.",
            "Review newly issued and unpaid invoices with Accounts and follow up until payment is secured.",
            "Confirm every active project timeline; ensure deliverables are ready 12 hours before delivery time.",
            "Run a daily operational check with Product, Creative, Production, Accounts, CRP, and Social Media.",
            "Monitor all team members and leads (including remote staff) for dashboard check-in and efficiency.",
            "Develop at least one daily action toward new clients, repeat business, referrals, or uptake.",
            "Document client follow-ups, operational issues, approvals, and revenue opportunities before close.",
            "Confirm office is secured before leaving (electronics off, windows/blinds closed, cleaned).",
            "Send a daily management summary to the CEO (operations, revenue, client issues, staff, decisions).",
        ],
        evidence: [
            "Dashboard check-in and check-out record.",
            "Daily management summary to CEO.",
            "Updated unpaid invoice follow-up status.",
            "Project delivery readiness report.",
            "Office closing checklist confirmation.",
        ],
    },
    {
        key: "accounts_manager",
        name: "Accounts Manager",
        tasks: [
            "Reconcile all accounts daily (bank inflows, outflows, transfers, petty cash, confirmed payments).",
            "Check paid invoices and mark them paid on the invoice tracker.",
            "Review unpaid invoices and notify the MD/GM early enough for same-day follow-up.",
            "Confirm payment evidence before any project is activated, produced, or released.",
            "Record daily income, expenses, receipts, and vendor payments with correct details.",
            "Check company account health daily (balance, obligations, expected inflows, liabilities).",
            "Flag discrepancies, failed transfers, missing receipts, or financial risks immediately.",
            "Prepare a short daily finance brief (paid, unpaid, expenses, cash position, concerns).",
            "File receipts, payment proofs, invoice records, and bank confirmations in the approved folder.",
            "Follow up politely but firmly with clients on payment matters.",
        ],
        evidence: [
            "Updated invoice tracker.",
            "Daily income and expense record.",
            "Daily finance brief.",
            "Payment confirmations and receipts filed.",
            "Unpaid invoice alert sent to management.",
        ],
    },
    {
        key: "product_manager",
        name: "Product Manager",
        tasks: [
            "Review all active project boards, briefs, pending deliverables, and assignments before 10:00am.",
            "Confirm the exact deliverables due today and align the responsible team members.",
            "Check each project timeline and flag delivery risk to the GM before it becomes urgent.",
            "Follow up with designers, developers, and contributors on assigned tasks and blockers.",
            "Update project status, deadlines, dependencies, and next actions on the dashboard.",
            "Review work-in-progress for scope alignment before it moves to final or client review.",
            "Maintain clean project documentation (briefs, links, approvals, file locations, decisions).",
            "Send client or internal progress updates for high-priority or time-sensitive projects.",
            "Confirm final deliverables are packaged and ready before the agreed handover time.",
            "Submit a daily project delivery summary (completed, pending, bottlenecks, next-day priorities).",
        ],
        evidence: [
            "Updated project dashboard.",
            "Daily project delivery summary.",
            "Client or internal progress updates.",
            "Documented blockers and next actions.",
        ],
    },
    {
        key: "creative_director",
        name: "Creative Director",
        tasks: [
            "Review the creative task queue and confirm priority deliverables with the GM and Product Manager.",
            "Assign creative tasks to designers, photographers, and videographers by urgency and skill fit.",
            "Review concepts, drafts, revisions, and final outputs before client or production handoff.",
            "Ensure every design follows the brief, brand strategy, visual standard, and quality expectations.",
            "Guide designers on direction, layout, typography, color, hierarchy, and presentation quality.",
            "Coordinate with the CPO to confirm print files are production-ready before printing.",
            "Translate client feedback into clear revision instructions for the creative team.",
            "Maintain a daily creative innovation habit (references, campaign ideas, improvement notes).",
            "Check that approved files are named, exported, archived, and attached to the correct folder.",
            "Submit a daily creative department status update (completed, pending, blocked, quality concerns).",
        ],
        evidence: [
            "Creative review notes.",
            "Approved design links or files.",
            "Updated creative task queue.",
            "Daily creative department status update.",
        ],
    },
    {
        key: "cpo",
        name: "Chief Production Officer",
        tasks: [
            "Review the daily production schedule, deadlines, material needs, and job priorities.",
            "Inspect machines, tools, finishing equipment, inks, materials, and safety conditions before work.",
            "Confirm each job has approved artwork, correct size, material spec, quantity, and timeline.",
            "Coordinate with Creative/Product where artwork, sizes, colors, or details are unclear.",
            "Supervise printing, cutting, lamination, packaging, and finishing to prevent errors and waste.",
            "Run quality control before, during, and after production (color, finishing, spelling, sizing).",
            "Track material usage, machine issues, wastage, reprints, and delays on the production log.",
            "Ensure completed jobs are packaged, labeled, stored, and handed over properly.",
            "Ensure machines and production areas are cleaned and maintained before close.",
            "Submit a daily production report (completed, pending, material needs, machine condition, errors).",
        ],
        evidence: [
            "Daily production schedule update.",
            "Production quality control checklist.",
            "Machine and material log.",
            "Daily production report.",
        ],
    },
    {
        key: "lead_developer",
        name: "Lead Software Developer",
        tasks: [
            "Review assigned tickets, requirements, UI files, bugs, deadlines, and technical priorities.",
            "Confirm unclear requirements with the Product Manager before development starts.",
            "Write, test, debug, and commit clean code using the approved repo and naming conventions.",
            "Review deployments, uptime, logs, errors, broken pages, and platforms needing maintenance.",
            "Coordinate with Product Designers on responsiveness, interactions, and implementation details.",
            "Document APIs, environment variables, deployment steps, and technical decisions as you go.",
            "Review/support junior developer tasks and prevent avoidable code-quality issues.",
            "Run basic QA on completed features before handing over for review.",
            "Push daily code updates, screenshots, links, and progress notes to the approved channel.",
            "Submit a daily technical report (completed, blockers, bugs, deployment status, next steps).",
        ],
        evidence: [
            "Repository commits or code update links.",
            "Daily technical report.",
            "Bug and deployment notes.",
            "Updated technical documentation.",
        ],
    },
    {
        key: "social_media_strategist",
        name: "Social Media Strategist",
        tasks: [
            "Review the content calendar, scheduled content, campaign priorities, and assets before posting.",
            "Confirm the daily posting target is met (≥3 videos, 1 photo/image, 1 short text/article where possible).",
            "Write or refine captions, hooks, CTAs, and platform-specific copy in the CDS Space voice.",
            "Coordinate with Creative, Videographers, Photographers, and Designers to secure media on time.",
            "Post, schedule, and monitor content with correct tags, links, formatting, and call to action.",
            "Respond to comments and messages within 45 minutes, or escalate sales enquiries to CRP/GM.",
            "Track daily metrics (reach, engagement, saves, shares, enquiries, followers, top content).",
            "Identify one daily content insight, trend, or campaign angle to help attract business.",
            "Document leads, enquiries, comments, and partnership opportunities from social media.",
            "Submit a daily social media report (posts, performance, feedback, leads, next-day needs).",
        ],
        evidence: [
            "Live post links.",
            "Updated content calendar.",
            "Daily social media report.",
            "Lead or enquiry handover record.",
        ],
    },
    {
        key: "senior_videographer",
        name: "Senior Videographer",
        tasks: [
            "Review the daily shoot, editing, and delivery schedule with Creative/Social Media.",
            "Prepare shot lists, angles, scripts, scene plans, equipment, and location requirements.",
            "Supervise or execute shoots with proper framing, lighting, audio, composition, and direction.",
            "Assign tasks to Junior Videographers and monitor execution, footage quality, and edits.",
            "Edit high-priority videos, ads, BTS, interviews, or campaign assets per deadlines.",
            "Review edited videos for pacing, captions, audio, branding, color, clarity, and export format.",
            "Back up all raw footage, project files, exports, thumbnails, and audio daily.",
            "Deliver approved video assets to Social/Creative/Project teams with labels and usage notes.",
            "Inspect and secure cameras, lights, mics, batteries, cards, tripods, and editing devices.",
            "Submit a daily video production update (captured, edited, pending, blockers, next-day plan).",
        ],
        evidence: [
            "Shot list or production plan.",
            "Video export links.",
            "Backup folder update.",
            "Daily video production update.",
        ],
    },
    {
        key: "junior_videographer",
        name: "Junior Videographer",
        tasks: [
            "Check daily assignments from the Senior Videographer and confirm expected outputs.",
            "Prepare cameras, batteries, lights, microphones, tripods, cards, and basic production setup.",
            "Assist during shoots with lighting, audio, camera support, BTS angles, and scene readiness.",
            "Edit assigned short-form videos, reels, BTS clips, captions, thumbnails, or cutdowns.",
            "Organize footage into correct folders by project, date, client, shoot type, and version.",
            "Back up footage and working project files before close to prevent loss.",
            "Implement corrections from the Senior Videographer or Creative Director within the timeline.",
            "Keep video equipment clean, arranged, charged, and ready for the next production day.",
            "Update the dashboard with work completed, links to edited clips, pending edits, and blockers.",
            "Submit a daily video assistant update before close of work.",
        ],
        evidence: [
            "Edited short-form video links.",
            "Footage backup confirmation.",
            "Equipment readiness confirmation.",
            "Daily video assistant update.",
        ],
    },
    {
        key: "print_production",
        name: "Print Production Personnel",
        tasks: [
            "Check assigned tasks, artwork, sizes, quantities, material specs, and deadlines before starting.",
            "Prepare required materials, inks, papers, vinyls, laminates, tools, and finishing items.",
            "Operate machines carefully per approved production instructions and supervisor guidance.",
            "Inspect materials before production to confirm they are clean, correct, and suitable.",
            "Check print output during production for color, spelling, alignment, trimming, and size.",
            "Report machine faults, material shortages, print errors, and risks to the CPO immediately.",
            "Package completed jobs neatly, label them, and move them to the approved storage area.",
            "Record daily job output, wastage, materials used, and pending jobs on the production log.",
            "Clean machines, tables, tools, and workspace before closing.",
            "Update the CPO before leaving on job status, material needs, errors, and next-day priorities.",
        ],
        evidence: [
            "Production log update.",
            "Completed job labels.",
            "Waste and material usage record.",
            "Workspace and machine cleaning confirmation.",
        ],
    },
    {
        key: "customer_relations",
        name: "Customer Relations Personnel / Social Media Manager",
        tasks: [
            "Monitor WhatsApp Business, calls, email, and DMs across all client communication channels.",
            "Respond to WhatsApp enquiries within 3 minutes; ensure no client message is left unattended.",
            "Log every enquiry, lead, complaint, payment question, and follow-up on the CRM/dashboard.",
            "Follow up with clients on pending info, approvals, revisions, payments, and activation.",
            "Send unpaid invoice reminders only after confirming status with the Accounts Manager.",
            "Escalate urgent complaints, dissatisfied clients, and high-value leads to the GM immediately.",
            "Coordinate with Product, Creative, Production, and Accounts for accurate client updates.",
            "Ensure client messages are professional, clear, and aligned with communication standards.",
            "Update client records, contact details, project notes, and payment status before close.",
            "Submit a daily client relations report (enquiries, responses, leads, complaints, follow-ups).",
        ],
        evidence: [
            "CRM or dashboard client updates.",
            "Daily client relations report.",
            "Escalation log for urgent matters.",
            "Client follow-up record.",
        ],
    },
    {
        key: "product_designer",
        name: "Product Designer",
        tasks: [
            "Review assigned product design tasks, briefs, user flows, references, feedback, and deadlines.",
            "Confirm unclear requirements, missing content, or scope questions with the Product Manager.",
            "Design wireframes, UI screens, prototypes, design systems, or user-flow updates assigned today.",
            "Maintain clean Figma files (naming, pages, components, auto layout, developer-friendly structure).",
            "Check usability, spacing, hierarchy, consistency, responsiveness, and design logic before submitting.",
            "Collaborate with developers on interaction states, responsive behavior, assets, and details.",
            "Apply approved feedback and revisions within the agreed timeline.",
            "Export or prepare required assets, icons, style guides, and handoff notes.",
            "Update the dashboard with Figma links, completed/pending screens, blockers, and next steps.",
            "Submit a daily product design progress update before close of work.",
        ],
        evidence: [
            "Figma links and version updates.",
            "Daily product design progress update.",
            "Handoff notes or design documentation.",
            "Dashboard task status update.",
        ],
    },
    {
        key: "creative_designer",
        name: "Creative Designer",
        tasks: [
            "Review assigned design tasks, briefs, deadlines, references, brand guides, and file formats.",
            "Confirm missing info, unclear briefs, or brand-direction issues with the Creative Director.",
            "Create assigned logos, brand assets, flyers, campaign designs, social graphics, or mockups.",
            "Apply typography, color, layout, spacing, hierarchy, and brand consistency to every design.",
            "Submit draft concepts or previews to the Creative Director for review before final export.",
            "Apply approved revisions accurately and avoid repeating corrected mistakes.",
            "Prepare final files in correct formats for client preview, print, social, or archive.",
            "Organize source files, exports, fonts, images, and links in the correct project folder.",
            "Update the dashboard with completed designs, pending revisions, blockers, and file links.",
            "Submit a daily design progress update before close of work.",
        ],
        evidence: [
            "Design previews and final file links.",
            "Organized project folders.",
            "Daily design progress update.",
            "Revision status update.",
        ],
    },
    {
        key: "brand_photographer",
        name: "Brand Photographer",
        tasks: [
            "Review daily photography needs, content requests, and shoot priorities with Creative/Social.",
            "Prepare camera, batteries, cards, lenses, lighting, backgrounds, props, and shoot setup.",
            "Capture high-quality photos of projects, team, BTS, production, products, and campaign assets.",
            "Review photos after shooting for sharpness, framing, exposure, composition, and usefulness.",
            "Edit selected photos using the approved brand look, crop, color correction, and export settings.",
            "Deliver edited photos to Creative/Social/Project teams with proper file names and folders.",
            "Organize raw and edited photos by date, project, client, and content category.",
            "Back up all photos daily to the approved storage location.",
            "Clean, arrange, and secure photography equipment before close of work.",
            "Submit a daily photography output update (shoot summary, edited count, links, pending, next-day).",
        ],
        evidence: [
            "Edited photo folder links.",
            "Raw photo backup confirmation.",
            "Daily photography output update.",
            "Equipment care confirmation.",
        ],
    },
    {
        key: "office_cleaner",
        name: "Office Cleaner",
        tasks: [
            "Clean and arrange all office areas every morning before work begins.",
            "Sweep, mop, and keep all floors clean, dry, and safe for movement.",
            "Clean desks, tables, chairs, shelves, counters, and visible surfaces daily.",
            "Empty all waste bins and dispose of waste properly before end of day.",
            "Clean reception, workstations, meeting areas, and production areas daily.",
            "Clean the restroom daily and keep it neat, hygienic, and supplied.",
            "Report damaged items, leaks, faulty bulbs, or maintenance issues to the MD/supervisor.",
            "Use cleaning materials properly (no waste) and store them safely after use.",
            "Wash, dry, and return all cleaning tools to storage; nothing left wet or scattered.",
            "Confirm all assigned cleaning duties are completed before signing out.",
        ],
        evidence: [
            "Check-in and task completion update on the dashboard.",
            "Confirmation to the MD or assigned supervisor.",
            "Immediate report of any facility issue discovered.",
        ],
    },
];

const BY_KEY: Record<string, RoleTemplate> = Object.fromEntries(
    ROLE_TEMPLATES.map((r) => [r.key, r]),
);

/**
 * Match a member's free-text role_title (and department fallback) to a role
 * key. Order matters - more specific matches come first.
 */
export function roleKeyFor(roleTitle?: string | null, department?: string | null): string | null {
    const s = `${roleTitle ?? ""} ${department ?? ""}`.toLowerCase();
    const rules: [RegExp, string][] = [
        [/managing director|general manager|\bgm\b/, "general_manager"],
        [/account/, "accounts_manager"],
        [/product manager/, "product_manager"],
        [/creative director/, "creative_director"],
        [/chief production|\bcpo\b|production officer/, "cpo"],
        [/lead .*develop|software develop|\bdeveloper\b|\bengineer\b/, "lead_developer"],
        [/social media strategist|strategist/, "social_media_strategist"],
        [/senior videographer/, "senior_videographer"],
        [/junior videographer|video assistant/, "junior_videographer"],
        [/print production|production personnel/, "print_production"],
        [/customer relations|\bcrp\b|social media manager|client relations/, "customer_relations"],
        [/product designer|ui\/?ux|ux designer|ui designer/, "product_designer"],
        [/creative designer|graphic designer|brand designer|\bdesigner\b/, "creative_designer"],
        [/photographer/, "brand_photographer"],
        [/cleaner|janitor|custodian/, "office_cleaner"],
        [/videographer/, "senior_videographer"],
    ];
    for (const [re, key] of rules) if (re.test(s)) return key;
    return null;
}

export function roleTemplateFor(roleTitle?: string | null, department?: string | null): RoleTemplate | null {
    const key = roleKeyFor(roleTitle, department);
    return key ? BY_KEY[key] ?? null : null;
}

export interface ChecklistTemplateItem {
    template_key: string;
    role_key: string;
    kind: "task" | "evidence";
    label: string;
}

/** Build the full ordered checklist template (universal + role) for a member. */
export function checklistTemplateFor(
    roleTitle?: string | null,
    department?: string | null,
): ChecklistTemplateItem[] {
    const items: ChecklistTemplateItem[] = UNIVERSAL_TASKS.map((label, i) => ({
        template_key: `universal:task:${i}`,
        role_key: "universal",
        kind: "task" as const,
        label,
    }));
    const role = roleTemplateFor(roleTitle, department);
    if (role) {
        role.tasks.forEach((label, i) =>
            items.push({ template_key: `${role.key}:task:${i}`, role_key: role.key, kind: "task", label }),
        );
        role.evidence.forEach((label, i) =>
            items.push({ template_key: `${role.key}:evidence:${i}`, role_key: role.key, kind: "evidence", label }),
        );
    }
    return items;
}
