/**
 * Admin permission definitions — grouped & granular.
 *
 * Each top-level menu has a parent permission (page access) plus
 * sub-permissions for individual actions inside that page.
 *
 * - Granting any sub-permission implies access to the parent route.
 * - Granting the parent permission alone gives full access to that section.
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
    ],
  },
  {
    key: "generate_codes",
    label: "Generate Codes",
    route: "/admin/generate-code",
    permissions: [
      { key: "generate_codes.view", label: "View Generator", description: "Access the code generator page" },
      { key: "generate_codes.create", label: "Create Codes", description: "Generate new access codes" },
    ],
  },
  {
    key: "view_codes",
    label: "View Codes",
    route: "/admin/viewcodes",
    permissions: [
      { key: "view_codes.view", label: "View Codes", description: "See all generated codes" },
      { key: "view_codes.resend", label: "Resend Codes", description: "Send codes via WhatsApp" },
      { key: "view_codes.delete", label: "Delete Codes", description: "Remove access codes" },
    ],
  },
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
    ],
  },
  {
    key: "messages",
    label: "Client Conversation",
    route: "/admin/messages",
    permissions: [
      { key: "messages.view", label: "View Client Conversation", description: "Read client conversations" },
      { key: "messages.send", label: "Send Client Conversation", description: "Reply to clients" },
    ],
  },
  {
    key: "orders",
    label: "Client Orders",
    route: "/admin/orders",
    permissions: [
      { key: "orders.view", label: "View Orders", description: "See all client orders" },
      { key: "orders.update_status", label: "Update Status", description: "Change order status" },
      { key: "orders.archive", label: "Archive", description: "Archive completed orders" },
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
  {
    key: "portfolio",
    label: "Portfolio",
    route: "/admin/portfolio-designs",
    permissions: [
      { key: "portfolio.view", label: "View Portfolio", description: "See portfolio designs" },
      { key: "portfolio.upload", label: "Upload Designs", description: "Add new portfolio designs" },
      { key: "portfolio.delete", label: "Delete Designs", description: "Remove portfolio designs" },
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
  {
    key: "consultations",
    label: "Consultations",
    route: "/admin/consultations",
    permissions: [
      { key: "consultations.view", label: "View Consultations", description: "See booked consultation requests" },
      { key: "consultations.manage", label: "Manage", description: "Update status, add notes, delete" },
    ],
  },
  {
    key: "finance",
    label: "Finance",
    route: "/admin/finance",
    permissions: [
      { key: "finance.view", label: "View Finance", description: "Access the finance section" },
      { key: "finance.manage", label: "Manage Finance", description: "Create/edit projects, invoices, payroll, etc." },
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
    key: "team_chat",
    label: "Team Chat",
    route: "/admin/chat",
    permissions: [
      { key: "team_chat.view", label: "View Chat", description: "See internal team conversations" },
      { key: "team_chat.send", label: "Send Messages", description: "Post in chat threads" },
      { key: "team_chat.broadcast", label: "Broadcast", description: "Send company-wide announcements" },
    ],
  },
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
  {
    key: "team_payroll",
    label: "Team Payroll",
    route: "/admin/team-payroll",
    permissions: [
      { key: "team_payroll.view", label: "View Payroll", description: "See team member payroll entries" },
      { key: "team_payroll.edit", label: "Edit Payroll", description: "Create and update payroll entries" },
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
    key: "upload_works_edit",
    label: "Works Team",
    permissions: [
      { key: "upload_works.assign", label: "Assign Team Members", description: "Pick who works on a project" },
    ],
  },
];

/** Flat list of all permissions, for validation */
export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap(g => g.permissions);

/**
 * Check if a permissions array grants access to a specific permission key.
 * - "all" → super admin, grants everything
 * - Granting any group permission grants the parent route too
 */
export function hasPermission(permissions: string[], key: string): boolean {
  if (permissions.includes("all")) return true;
  if (permissions.includes(key)) return true;

  // Parent route key check: if any sub-permission of this group is granted, allow
  const group = PERMISSION_GROUPS.find(g => g.key === key);
  if (group) {
    return group.permissions.some(p => permissions.includes(p.key));
  }

  return false;
}

/** Get the route-level permission key for a given pathname */
export function getPermissionForRoute(pathname: string): string | null {
  const exact = PERMISSION_GROUPS.find(g => g.route === pathname);
  if (exact) return exact.key;

  const prefix = PERMISSION_GROUPS.find(g => g.route && pathname.startsWith(g.route + "/"));
  if (prefix) return prefix.key;

  if (pathname.startsWith("/admin/works/")) return "upload_works";
  if (pathname.startsWith("/admin/ai-system")) return "workspace.ai_system";

  // Workspace group — individual sub-routes all fall under one permission group
  if (
    pathname.startsWith("/admin/protect-docs") ||
    pathname.startsWith("/admin/cmeet") ||
    pathname.startsWith("/admin/cdocs") ||
    pathname.startsWith("/admin/csign") ||
    pathname.startsWith("/admin/cresume")
  ) {
    return "workspace";
  }

  if (pathname.startsWith("/admin/team-members")) return "team_members";
  if (pathname.startsWith("/admin/departments")) return "departments";
  if (pathname.startsWith("/admin/chat")) return "team_chat";
  if (pathname.startsWith("/admin/team-payroll")) return "team_payroll";

  return null;
}

// ============================================
// Backwards compatibility shim
// ============================================
// Old code may import PERMISSION_DEFS - keep working
export const PERMISSION_DEFS = PERMISSION_GROUPS.map(g => ({
  key: g.key,
  label: g.label,
  description: `Full ${g.label} access`,
  route: g.route,
}));

export type PermissionKey = string;
