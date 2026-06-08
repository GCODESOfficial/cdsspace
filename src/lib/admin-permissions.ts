/**
 * Admin permission definitions — grouped & granular.
 *
 * Every top-level menu in the sidebar maps to a parent permission
 * (page access). Each parent also carries sub-permissions for the
 * individual actions available on that page.
 *
 * Rules:
 *   - Granting any sub-permission implies access to the parent route.
 *   - Granting the parent permission alone gives full access to that section.
 *   - `all` is the super-admin wildcard.
 */

export interface Permission {
  key: string;
  label: string;
  description: string;
}

export interface PermissionGroup {
  key: string;          // route-level key
  label: string;
  route?: string;
  permissions: Permission[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  // ─────────────── Core surface ───────────────
  {
    key: "dashboard",
    label: "Dashboard",
    route: "/admin",
    permissions: [
      { key: "dashboard.view", label: "View Dashboard", description: "Access the dashboard page" },
      { key: "dashboard.stats", label: "View Stats", description: "See traffic, works count, and analytics" },
      { key: "dashboard.quick_actions", label: "Quick Actions", description: "Use Feature Brands, Manage Ads, Career Link" },
      { key: "dashboard.works_table", label: "Works Table", description: "View uploaded works on dashboard" },
    ],
  },
  {
    key: "upload_works",
    label: "Upload Works",
    route: "/admin/upload-works",
    permissions: [
      { key: "upload_works.view", label: "View Works", description: "View uploaded works list" },
      { key: "upload_works.create", label: "Create Works", description: "Upload new portfolio works" },
      { key: "upload_works.edit", label: "Edit Works", description: "Modify existing works" },
      { key: "upload_works.delete", label: "Delete Works", description: "Remove portfolio works" },
      { key: "upload_works.assign", label: "Assign Team", description: "Pick who works on a project" },
    ],
  },

  // ─────────────── Client-facing comms ───────────────
  {
    key: "messages",
    label: "Client Conversation",
    route: "/admin/messages",
    permissions: [
      { key: "messages.view", label: "View Client Conversation", description: "Read client conversations" },
      { key: "messages.send", label: "Send Client Conversation", description: "Reply to clients" },
      { key: "messages.delete", label: "Delete Messages", description: "Remove messages or threads" },
    ],
  },
  {
    key: "integrations",
    label: "Integrations",
    permissions: [
      { key: "integrations.whatsapp", label: "WhatsApp", description: "Configure the WhatsApp integration" },
      { key: "integrations.meta", label: "Facebook / Instagram", description: "Configure the Meta integration" },
    ],
  },
  {
    key: "team_chat",
    label: "Team Chat",
    route: "/admin/chat",
    permissions: [
      { key: "team_chat.view", label: "View Chat", description: "See internal team conversations" },
      { key: "team_chat.send", label: "Send Messages", description: "Post in chat threads" },
      { key: "team_chat.broadcast", label: "Broadcast", description: "Send company-wide announcements" },
      { key: "team_chat.manage_threads", label: "Manage Threads", description: "Create, rename, archive threads" },
    ],
  },

  // ─────────────── Public-facing funnels ───────────────
  {
    key: "consultations",
    label: "Consultations",
    route: "/admin/consultations",
    permissions: [
      { key: "consultations.view", label: "View Consultations", description: "See booked consultation requests" },
      { key: "consultations.manage", label: "Manage", description: "Update status, add notes" },
      { key: "consultations.delete", label: "Delete", description: "Remove consultation requests" },
    ],
  },
  {
    key: "portfolio",
    label: "Portfolio",
    route: "/admin/portfolio-designs",
    permissions: [
      { key: "portfolio.view", label: "View Portfolio", description: "See portfolio designs" },
      { key: "portfolio.upload", label: "Upload Designs", description: "Add new portfolio designs" },
      { key: "portfolio.edit", label: "Edit Designs", description: "Reorder, rename, reassign" },
      { key: "portfolio.delete", label: "Delete Designs", description: "Remove portfolio designs" },
    ],
  },
  {
    key: "faqs",
    label: "FAQs",
    route: "/admin/faqs",
    permissions: [
      { key: "faqs.view", label: "View FAQs", description: "See all FAQs" },
      { key: "faqs.create", label: "Create FAQs", description: "Add new FAQs" },
      { key: "faqs.edit", label: "Edit FAQs", description: "Modify FAQs and reorder" },
      { key: "faqs.delete", label: "Delete FAQs", description: "Remove FAQs" },
    ],
  },
  {
    key: "legal",
    label: "Legal Documents",
    route: "/admin/legal",
    permissions: [
      { key: "legal.view", label: "View Legal", description: "See Privacy Policy and Terms of Service" },
      { key: "legal.edit", label: "Edit Legal", description: "Edit, download, and upload legal documents" },
    ],
  },
  {
    key: "brand_briefs",
    label: "Brand Briefs",
    route: "/admin/brand-briefs",
    permissions: [
      { key: "brand_briefs.view", label: "View Briefs", description: "See submitted brand briefs" },
      { key: "brand_briefs.create", label: "Create / Request", description: "Generate new brief links" },
      { key: "brand_briefs.edit", label: "Edit Briefs", description: "Modify brief contents" },
      { key: "brand_briefs.delete", label: "Delete Briefs", description: "Remove briefs" },
      { key: "brand_briefs.archive", label: "Archive", description: "Archive / reactivate briefs" },
      { key: "brand_briefs.convert", label: "Convert", description: "Generate invoices or projects from briefs" },
    ],
  },
  {
    key: "pricing",
    label: "Pricing",
    route: "/admin/pricing",
    permissions: [
      { key: "pricing.view", label: "View Pricing", description: "See subscription prices" },
      { key: "pricing.edit", label: "Edit Pricing", description: "Modify prices per industry" },
    ],
  },

  // ─────────────── Orders + Clients ───────────────
  {
    key: "orders",
    label: "Client Orders",
    route: "/admin/orders",
    permissions: [
      { key: "orders.view", label: "View Orders", description: "See all client orders" },
      { key: "orders.update_status", label: "Update Status", description: "Change order status" },
      { key: "orders.archive", label: "Archive", description: "Archive completed orders" },
      { key: "orders.delete", label: "Delete", description: "Permanently remove orders" },
      { key: "orders.export", label: "Export", description: "Download order history as CSV" },
    ],
  },
  {
    key: "clients",
    label: "Clients / Brands",
    route: "/admin/clients",
    permissions: [
      { key: "clients.view", label: "View Clients", description: "See the client / brand directory" },
      { key: "clients.create", label: "Create Clients", description: "Add new clients / brands" },
      { key: "clients.edit", label: "Edit Clients", description: "Update client contact & brand details" },
      { key: "clients.delete", label: "Delete Clients", description: "Remove clients from the directory" },
      { key: "clients.export", label: "Export", description: "Download client lists" },
    ],
  },
  {
    key: "testimonials",
    label: "Testimonials",
    route: "/admin/testimonials",
    permissions: [
      { key: "testimonials.view", label: "View", description: "See all testimonials" },
      { key: "testimonials.create", label: "Add", description: "Create new testimonials" },
      { key: "testimonials.edit", label: "Edit", description: "Modify testimonials & photos" },
      { key: "testimonials.delete", label: "Delete", description: "Remove testimonials" },
    ],
  },

  // ─────────────── Finance ───────────────
  {
    key: "finance",
    label: "Finance Overview",
    route: "/admin/finance",
    permissions: [
      { key: "finance.view", label: "View Finance", description: "Access the finance section" },
      { key: "finance.manage", label: "Manage Finance", description: "Full cross-section access" },
    ],
  },
  {
    key: "finance_invoices",
    label: "Invoices",
    route: "/admin/finance/invoices",
    permissions: [
      { key: "finance_invoices.view", label: "View Invoices", description: "Read-only access to invoices" },
      { key: "finance_invoices.create", label: "Create Invoices", description: "Issue new invoices" },
      { key: "finance_invoices.edit", label: "Edit Invoices", description: "Modify items, terms, delivery" },
      { key: "finance_invoices.delete", label: "Delete Invoices", description: "Permanently remove invoices" },
      { key: "finance_invoices.mark_paid", label: "Mark Paid", description: "Update payment status" },
      { key: "finance_invoices.export", label: "Download / Share", description: "Export PDF and copy share links" },
    ],
  },
  {
    key: "finance_pricelist",
    label: "Price List",
    route: "/admin/finance/price-list",
    permissions: [
      { key: "finance_pricelist.view", label: "View Price List", description: "Browse saved price items" },
      { key: "finance_pricelist.create", label: "Create", description: "Add new price items" },
      { key: "finance_pricelist.edit", label: "Edit", description: "Modify existing price items" },
      { key: "finance_pricelist.delete", label: "Delete", description: "Remove price items" },
    ],
  },
  {
    key: "finance_expenditures",
    label: "Expenditures",
    route: "/admin/finance/expenditures",
    permissions: [
      { key: "finance_expenditures.view", label: "View Expenditures", description: "See all tracked expenses" },
      { key: "finance_expenditures.create", label: "Create", description: "Log new expenditures" },
      { key: "finance_expenditures.edit", label: "Edit", description: "Modify logged expenditures" },
      { key: "finance_expenditures.delete", label: "Delete", description: "Remove expenditures" },
      { key: "finance_expenditures.manage_suggestions", label: "Manage Suggestions", description: "Curate title + category dropdowns" },
    ],
  },
  {
    key: "finance_payroll",
    label: "Payroll Runs",
    route: "/admin/finance/payroll",
    permissions: [
      { key: "finance_payroll.view", label: "View Payroll", description: "Browse payroll runs" },
      { key: "finance_payroll.create", label: "Create Run", description: "Build a new payroll batch" },
      { key: "finance_payroll.edit", label: "Edit Run", description: "Modify a payroll batch" },
      { key: "finance_payroll.process", label: "Process / Pay", description: "Execute a payroll run" },
      { key: "finance_payroll.delete", label: "Delete Run", description: "Remove a payroll run" },
    ],
  },
  {
    key: "finance_audit",
    label: "Financial Audit",
    route: "/admin/finance/audit",
    permissions: [
      { key: "finance_audit.view", label: "View Audit", description: "See reconciliation reports" },
      { key: "finance_audit.export", label: "Export", description: "Download audit reports" },
    ],
  },

  // ─────────────── Projects ───────────────
  {
    key: "projects",
    label: "Projects",
    route: "/admin/projects",
    permissions: [
      { key: "projects.view", label: "View Projects", description: "See active & archived projects" },
      { key: "projects.create", label: "Create Projects", description: "Start new projects" },
      { key: "projects.edit", label: "Edit Projects", description: "Rename, reassign, change currency" },
      { key: "projects.delete", label: "Delete Projects", description: "Permanently remove projects" },
      { key: "projects.manage_milestones", label: "Milestones", description: "Add / pay / close milestones" },
      { key: "projects.manage_contractors", label: "Sub-contractors", description: "Assign and pay sub-contractors" },
      { key: "projects.manage_subscriptions", label: "Subscriptions", description: "Create and cancel retainer subscriptions" },
    ],
  },

  // ─────────────── HRM ───────────────
  {
    key: "applicants",
    label: "Applicants",
    route: "/admin/applications",
    permissions: [
      { key: "applicants.view", label: "View Applicants", description: "See career applicants list" },
      { key: "applicants.assign_role", label: "Assign Roles", description: "Assign role categories" },
      { key: "applicants.export", label: "Export CSV", description: "Download applicant data" },
      { key: "applicants.archive", label: "Archive", description: "Archive/restore applicants" },
      { key: "applicants.delete", label: "Delete", description: "Remove applicants" },
      { key: "applicants.manage_openings", label: "Manage Openings", description: "Open & close job roles" },
      { key: "applicants.manage_certifications", label: "Certifications", description: "Track staff certifications" },
    ],
  },
  {
    key: "team_members",
    label: "Team Members",
    route: "/admin/team-members",
    permissions: [
      { key: "team_members.view", label: "View Members", description: "See the team roster" },
      { key: "team_members.invite", label: "Invite", description: "Create accounts & generate invite links" },
      { key: "team_members.edit", label: "Edit Members", description: "Update roles, departments, contact info" },
      { key: "team_members.promote", label: "Promote to Sub-admin", description: "Grant or revoke sub-admin access" },
      { key: "team_members.delete", label: "Remove Members", description: "Delete accounts" },
      { key: "team_members.edit_bank", label: "Edit Bank Details", description: "Manage each member's bank info directly" },
    ],
  },
  {
    key: "timebook",
    label: "Team Timebook",
    route: "/admin/timebook",
    permissions: [
      { key: "timebook.view", label: "View Timebook", description: "See attendance, time logs, and compliance reports" },
      { key: "timebook.manage_schedules", label: "Manage Schedules", description: "Assign work modes and hybrid office days" },
      { key: "timebook.correct_entries", label: "Correct Entries", description: "Apply attendance corrections and exceptions" },
      { key: "timebook.review_leave", label: "Review Leave", description: "Approve or reject leave requests" },
      { key: "timebook.export", label: "Export Reports", description: "Download payroll attendance exports" },
    ],
  },
  {
    key: "work_tracking",
    label: "Work Tracking",
    route: "/admin/work-tracking",
    permissions: [
      { key: "work_tracking.view", label: "View Tracking", description: "See productivity dashboards, summaries, and scorecards" },
      { key: "work_tracking.screenshots", label: "View Screenshots", description: "Open retained screenshot timeline images before retention expiry" },
      { key: "work_tracking.reports", label: "Generate Reports", description: "Generate daily reports, weekly rollups, and employee-report comparisons" },
      { key: "work_tracking.settings", label: "Manage Settings", description: "Update capture interval, idle threshold, retention, and access policy" },
      { key: "work_tracking.retention", label: "Run Retention", description: "Delete expired raw screenshots while preserving summaries and metadata" },
    ],
  },
  {
    key: "team_payroll",
    label: "Team Payroll",
    route: "/admin/team-payroll",
    permissions: [
      { key: "team_payroll.view", label: "View Payroll", description: "See team-member payroll entries" },
      { key: "team_payroll.create", label: "Create Entries", description: "Log new payroll entries (single or bulk)" },
      { key: "team_payroll.edit", label: "Edit Entries", description: "Adjust amounts, status, dates" },
      { key: "team_payroll.approve", label: "Approve", description: "Approve pending entries" },
      { key: "team_payroll.mark_paid", label: "Mark Paid", description: "Record payment + reference" },
      { key: "team_payroll.delete", label: "Delete Entries", description: "Remove payroll entries" },
      { key: "team_payroll.bank_edit", label: "Edit Bank Details", description: "Update bank info for any member" },
      { key: "team_payroll.bank_approve", label: "Review Bank Requests", description: "Approve or reject bank-change requests" },
      { key: "team_payroll.export", label: "Export CSV", description: "Download payroll history" },
    ],
  },
  {
    key: "departments",
    label: "Departments",
    route: "/admin/departments",
    permissions: [
      { key: "departments.view", label: "View Departments", description: "See all departments" },
      { key: "departments.manage", label: "Manage Departments", description: "Create, rename, delete departments" },
    ],
  },
  {
    key: "sub_admins",
    label: "Sub-admins & Roles",
    route: "/admin/sub-admins",
    permissions: [
      { key: "sub_admins.view", label: "View Sub-admins", description: "See the sub-admin roster" },
      { key: "sub_admins.create", label: "Create Sub-admins", description: "Add new sub-admin accounts" },
      { key: "sub_admins.edit", label: "Edit Sub-admins", description: "Update permissions, activate / deactivate" },
      { key: "sub_admins.delete", label: "Delete Sub-admins", description: "Remove sub-admin accounts" },
      { key: "admin_roles.view", label: "View Roles", description: "See the role catalogue" },
      { key: "admin_roles.manage", label: "Manage Roles", description: "Create, edit, delete roles" },
    ],
  },

  // ─────────────── Workspace ───────────────
  {
    key: "workspace",
    label: "Workspace",
    permissions: [
      { key: "workspace.protect_docs", label: "Protect Docs", description: "Manage secure team documents" },
      { key: "workspace.cmeet", label: "cMeet", description: "Create and moderate meetings" },
      { key: "workspace.cdocs", label: "cDocs", description: "Create and edit internal docs" },
      { key: "workspace.csign", label: "cSign", description: "Request signatures on documents" },
      { key: "workspace.cresume", label: "cResume", description: "View team member resumes" },
      { key: "workspace.ai_system", label: "AI System", description: "Manage AI settings, knowledge docs, and templates" },
    ],
  },
];

/** Flat list of all permissions, for validation and role-catalogue UIs. */
export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.permissions);

/**
 * Check if a permissions array grants access to a specific permission key.
 * - "all" → super admin, grants everything
 * - Granting any group permission grants the parent route too
 */
export function hasPermission(permissions: string[], key: string): boolean {
  if (permissions.includes("all")) return true;
  if (permissions.includes(key)) return true;
  if (key.startsWith("finance_") && permissions.includes("finance.manage")) return true;
  const owningGroup = PERMISSION_GROUPS.find((g) => g.permissions.some((p) => p.key === key));
  if (owningGroup && permissions.includes(owningGroup.key)) return true;
  const group = PERMISSION_GROUPS.find((g) => g.key === key);
  if (group) {
    return group.permissions.some((p) => permissions.includes(p.key));
  }
  return false;
}

/** Map a pathname to the route-level permission key for it, or null. */
export function getPermissionForRoute(pathname: string): string | null {
  // Most-specific routes first.
  if (pathname === "/admin") return "dashboard";
  if (pathname.startsWith("/admin/upload-works")) return "upload_works";
  if (pathname.startsWith("/admin/works/")) return "upload_works";
  if (pathname.startsWith("/admin/ai-system")) return "workspace.ai_system";
  if (pathname.startsWith("/admin/protect-docs")) return "workspace";
  if (pathname.startsWith("/admin/cmeet")) return "workspace";
  if (pathname.startsWith("/admin/cdocs")) return "workspace";
  if (pathname.startsWith("/admin/csign")) return "workspace";
  if (pathname.startsWith("/admin/cresume")) return "workspace";

  if (pathname.startsWith("/admin/messages")) return "messages";
  if (pathname.startsWith("/admin/chat")) return "team_chat";
  if (pathname.startsWith("/admin/announcements")) return "team_chat.broadcast";
  if (pathname.startsWith("/admin/integrations/whatsapp")) return "integrations.whatsapp";
  if (pathname.startsWith("/admin/integrations/meta")) return "integrations.meta";

  if (pathname.startsWith("/admin/consultations")) return "consultations";
  if (pathname.startsWith("/admin/portfolio-designs")) return "portfolio";
  if (pathname.startsWith("/admin/faqs")) return "faqs";
  if (pathname.startsWith("/admin/legal")) return "legal";
  if (pathname.startsWith("/admin/brand-briefs")) return "brand_briefs";
  if (pathname.startsWith("/admin/pricing")) return "pricing";

  if (pathname.startsWith("/admin/orders")) return "orders";
  if (pathname.startsWith("/admin/clients")) return "clients";
  if (pathname.startsWith("/admin/testimonials")) return "testimonials";

  if (pathname.startsWith("/admin/finance/invoices")) return "finance_invoices";
  if (pathname.startsWith("/admin/finance/price-list")) return "finance_pricelist";
  if (pathname.startsWith("/admin/finance/expenditures")) return "finance_expenditures";
  if (pathname.startsWith("/admin/finance/payroll")) return "finance_payroll";
  if (pathname.startsWith("/admin/finance/audit")) return "finance_audit";
  if (pathname.startsWith("/admin/finance")) return "finance";

  if (pathname.startsWith("/admin/projects")) return "projects";

  if (pathname.startsWith("/admin/applications")) return "applicants";
  if (pathname.startsWith("/admin/hrm/roles")) return "applicants";
  if (pathname.startsWith("/admin/hrm/certifications")) return "applicants";
  if (pathname.startsWith("/admin/hrm")) return "applicants";

  if (pathname.startsWith("/admin/team-members")) return "team_members";
  if (pathname.startsWith("/admin/timebook")) return "timebook";
  if (pathname.startsWith("/admin/work-tracking")) return "work_tracking";
  if (pathname.startsWith("/admin/team-payroll")) return "team_payroll";
  if (pathname.startsWith("/admin/departments")) return "departments";
  if (pathname.startsWith("/admin/sub-admins")) return "sub_admins";

  const group = PERMISSION_GROUPS.find((g) => g.route === pathname);
  return group?.key ?? null;
}

// ============================================
// Backwards compatibility shim
// ============================================
// Old code may import PERMISSION_DEFS - keep working
export const PERMISSION_DEFS = PERMISSION_GROUPS.map((g) => ({
  key: g.key,
  label: g.label,
  description: `Full ${g.label} access`,
  route: g.route,
}));

export type PermissionKey = string;
