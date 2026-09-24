/**
 * Admin permission definitions - grouped & granular.
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
  key: string; // route-level key
  label: string;
  route?: string;
  permissions: Permission[];
}

/**
 * Seeing who a client is, is a grant of its own.
 *
 * Kept out of the ordinary inheritance rules below: an admin can be given the
 * whole Clients section and still not be shown a single name, email or phone
 * number until this exact key is ticked for them. Only the super admin's `all`
 * wildcard carries it implicitly.
 */
export const CLIENT_IDENTITY_PERMISSION = "clients.pii.view";

export const PERMISSION_GROUPS: PermissionGroup[] = [
  // ─────────────── Core surface ───────────────
  {
    key: "dashboard",
    label: "Dashboard",
    route: "/admin",
    permissions: [
      {
        key: "dashboard.view",
        label: "View Dashboard",
        description: "Access the dashboard page",
      },
      {
        key: "dashboard.stats",
        label: "View Stats",
        description: "See traffic, works count, and analytics",
      },
      {
        key: "dashboard.quick_actions",
        label: "Quick Actions",
        description: "Use Feature Brands, Manage Ads, Career Link",
      },
      {
        key: "dashboard.works_table",
        label: "Works Table",
        description: "View uploaded works on dashboard",
      },
    ],
  },
  {
    key: "upload_works",
    label: "Upload Works",
    route: "/admin/upload-works",
    permissions: [
      {
        key: "upload_works.view",
        label: "View Works",
        description: "View uploaded works list",
      },
      {
        key: "upload_works.create",
        label: "Create Works",
        description: "Upload new portfolio works",
      },
      {
        key: "upload_works.edit",
        label: "Edit Works",
        description: "Modify existing works",
      },
      {
        key: "upload_works.delete",
        label: "Delete Works",
        description: "Remove portfolio works",
      },
      {
        key: "upload_works.assign",
        label: "Assign Team",
        description: "Pick who works on a project",
      },
    ],
  },
  {
    key: "audit_report",
    label: "Audit & Report",
    route: "/admin/audit-report",
    permissions: [
      {
        key: "audit_report.view",
        label: "View Audit & Report",
        description:
          "See platform-wide activity, actor, and operations reports",
      },
      {
        key: "audit_report.export",
        label: "Export Reports",
        description: "Download audit reports as PNG or PDF",
      },
    ],
  },

  // ─────────────── Client-facing comms ───────────────
  {
    key: "messages",
    label: "Chat/Meet",
    route: "/admin/messages",
    permissions: [
      {
        key: "messages.view",
        label: "View Chat/Meet",
        description: "Read client conversations and meeting invitations",
      },
      {
        key: "messages.send",
        label: "Send Chat/Meet Messages",
        description: "Reply to clients and initiate meetings",
      },
      {
        key: "messages.delete",
        label: "Delete Messages",
        description: "Remove messages or threads",
      },
    ],
  },
  {
    key: "integrations",
    label: "Integrations",
    permissions: [
      {
        key: "integrations.whatsapp",
        label: "WhatsApp",
        description: "Configure the WhatsApp integration",
      },
      {
        key: "integrations.meta",
        label: "Facebook / Instagram",
        description: "Configure the Meta integration",
      },
    ],
  },
  {
    key: "team_chat",
    label: "Team Chat",
    route: "/admin/chat",
    permissions: [
      {
        key: "team_chat.view",
        label: "View Chat",
        description: "See internal team conversations",
      },
      {
        key: "team_chat.send",
        label: "Send Messages",
        description: "Post in chat threads",
      },
      {
        key: "team_chat.broadcast",
        label: "Broadcast",
        description: "Send company-wide announcements",
      },
      {
        key: "team_chat.manage_threads",
        label: "Manage Threads",
        description: "Create, rename, archive threads",
      },
    ],
  },

  // ─────────────── Public-facing funnels ───────────────
  {
    key: "consultations",
    label: "Consultations",
    route: "/admin/consultations",
    permissions: [
      {
        key: "consultations.view",
        label: "View Consultations",
        description: "See booked consultation requests",
      },
      {
        key: "consultations.manage",
        label: "Manage",
        description: "Update status, add notes",
      },
      {
        key: "consultations.delete",
        label: "Delete",
        description: "Remove consultation requests",
      },
    ],
  },
  {
    key: "portfolio",
    label: "Portfolio",
    route: "/admin/portfolio-designs",
    permissions: [
      {
        key: "portfolio.view",
        label: "View Portfolio",
        description: "See portfolio designs",
      },
      {
        key: "portfolio.upload",
        label: "Upload Designs",
        description: "Add new portfolio designs",
      },
      {
        key: "portfolio.edit",
        label: "Edit Designs",
        description: "Reorder, rename, reassign",
      },
      {
        key: "portfolio.delete",
        label: "Delete Designs",
        description: "Remove portfolio designs",
      },
    ],
  },
  {
    key: "faqs",
    label: "FAQs",
    route: "/admin/faqs",
    permissions: [
      { key: "faqs.view", label: "View FAQs", description: "See all FAQs" },
      { key: "faqs.create", label: "Create FAQs", description: "Add new FAQs" },
      {
        key: "faqs.edit",
        label: "Edit FAQs",
        description: "Modify FAQs and reorder",
      },
      { key: "faqs.delete", label: "Delete FAQs", description: "Remove FAQs" },
    ],
  },
  {
    key: "legal",
    label: "Legal Documents",
    route: "/admin/legal",
    permissions: [
      {
        key: "legal.view",
        label: "View Legal",
        description: "See Privacy Policy and Terms of Service",
      },
      {
        key: "legal.edit",
        label: "Edit Legal",
        description: "Edit, download, and upload legal documents",
      },
    ],
  },
  {
    key: "brand_briefs",
    label: "Brand Briefs",
    route: "/admin/brand-briefs",
    permissions: [
      {
        key: "brand_briefs.view",
        label: "View Briefs",
        description: "See submitted brand briefs",
      },
      {
        key: "brand_briefs.create",
        label: "Create / Request",
        description: "Generate new brief links",
      },
      {
        key: "brand_briefs.edit",
        label: "Edit Briefs",
        description: "Modify brief contents",
      },
      {
        key: "brand_briefs.delete",
        label: "Delete Briefs",
        description: "Remove briefs",
      },
      {
        key: "brand_briefs.archive",
        label: "Archive",
        description: "Archive / reactivate briefs",
      },
      {
        key: "brand_briefs.convert",
        label: "Convert",
        description: "Generate invoices or projects from briefs",
      },
    ],
  },
  {
    key: "deliveries",
    label: "Client Deliveries",
    route: "/admin/clients/deliveries",
    permissions: [
      {
        key: "deliveries.view",
        label: "View Client Deliveries",
        description: "See finished-work handovers and their client recipients",
      },
      {
        key: "deliveries.create",
        label: "Prepare Client Deliveries",
        description:
          "Create drafts and upload finished brand identity or design files",
      },
      {
        key: "deliveries.send",
        label: "Approve & Send Client Deliveries",
        description:
          "Approve prepared finished work and release it to client accounts",
      },
      {
        key: "deliveries.assign",
        label: "Legacy Delivery Assignment",
        description: "Compatibility permission for earlier delivery records",
      },
      {
        key: "deliveries.approve",
        label: "Legacy Delivery Approval",
        description: "Compatibility permission for earlier delivery records",
      },
    ],
  },
  {
    key: "pricing",
    label: "Pricing",
    route: "/admin/pricing",
    permissions: [
      {
        key: "pricing.view",
        label: "View Pricing",
        description: "See subscription prices",
      },
      {
        key: "pricing.edit",
        label: "Edit Pricing",
        description: "Modify prices per industry",
      },
    ],
  },

  // ─────────────── Orders + Clients ───────────────
  {
    key: "orders",
    label: "Client Orders",
    route: "/admin/orders",
    permissions: [
      {
        key: "orders.view",
        label: "View Orders",
        description: "See all client orders",
      },
      {
        key: "orders.update_status",
        label: "Update Status",
        description: "Change order status",
      },
      {
        key: "orders.archive",
        label: "Archive",
        description: "Archive completed orders",
      },
      {
        key: "orders.delete",
        label: "Delete",
        description: "Permanently remove orders",
      },
      {
        key: "orders.export",
        label: "Export",
        description: "Download order history as CSV",
      },
    ],
  },
  {
    key: "clients",
    label: "Clients / Brands",
    route: "/admin/clients",
    permissions: [
      {
        key: "clients.view",
        label: "View Clients",
        description: "See the client / brand directory",
      },
      {
        key: "clients.create",
        label: "Create Clients",
        description: "Add new clients / brands",
      },
      {
        key: "clients.edit",
        label: "Edit Clients",
        description: "Update client contact & brand details",
      },
      {
        key: "clients.delete",
        label: "Delete Clients",
        description: "Remove clients from the directory",
      },
      {
        key: "clients.export",
        label: "Export",
        description: "Download client lists",
      },
      {
        key: "clients.banners.view",
        label: "View Banner Commerce",
        description:
          "See banner sizes, materials, design fees, and client edit requests",
      },
      {
        key: "clients.banners.edit",
        label: "Manage Banner Commerce",
        description:
          "Set banner production and design prices used for client invoices",
      },
      {
        key: "clients.merch.view",
        label: "View Merch Commerce",
        description:
          "See the merch catalogue, product visuals, variants, pricing, and orders",
      },
      {
        key: "clients.merch.edit",
        label: "Manage Merch Commerce",
        description:
          "Manage merch products, presentation visuals, variants, production prices, and design fees",
      },
      {
        key: "clients.sales_settings.view",
        label: "View Sales Settings",
        description:
          "See shared offers, countries, pickup locations, and delivery rules",
      },
      {
        key: "clients.sales_settings.edit",
        label: "Manage Sales Settings",
        description:
          "Manage shared offers and fulfilment rules used across client orders",
      },
      {
        key: "clients.sales_scripts.view",
        label: "View Sales Scripts",
        description: "See approved sales, marketing, and client experience wording",
      },
      {
        key: "clients.sales_scripts.edit",
        label: "Manage Sales Scripts",
        description: "Create, edit, publish, archive, and restore Sales Hub scripts",
      },
      {
        key: "clients.growth.view",
        label: "View Growth Engine",
        description:
          "See company research, campaigns, prospects, and draft outreach",
      },
      {
        key: "clients.growth.create",
        label: "Build Growth Campaigns",
        description:
          "Research public sources and create campaigns, prospects, contacts, emails, hooks, and proposals",
      },
      {
        key: "clients.growth.approve",
        label: "Approve Outreach",
        description: "Approve an email immediately before delivery",
      },
      {
        key: "clients.growth.send",
        label: "Send Outreach",
        description:
          "Deliver an approved email through the CDS Space email account",
      },
      {
        key: CLIENT_IDENTITY_PERMISSION,
        label: "See Client Identity",
        description:
          "See client names, email addresses and phone numbers. Withheld from every admin until it is granted here, and never implied by any other permission.",
      },
      {
        key: "clients.modules.view",
        label: "View Dashboard Modules",
        description: "See which client dashboard sections are switched on",
      },
      {
        key: "clients.modules.edit",
        label: "Manage Dashboard Modules",
        description:
          "Turn client dashboard sections on or off platform-wide or per client",
      },
      {
        key: "clients.mailings.view",
        label: "View client mailings",
        description:
          "View mailing drafts, scheduled emails, and delivery history",
      },
      {
        key: "clients.mailings.create",
        label: "Create client mailings",
        description:
          "Add lead recipients, write, rewrite, and attach campaign imagery",
      },
      {
        key: "clients.mailings.send",
        label: "Send client mailings",
        description:
          "Send now or schedule, edit, and delete future client emails",
      },
    ],
  },
  {
    key: "deals",
    label: "Deals",
    route: "/admin/deals",
    permissions: [
      {
        key: "deals.view",
        label: "View Deals",
        description: "See the Deals overview and activity totals",
      },
      {
        key: "deals.proposals",
        label: "Manage Proposals",
        description:
          "Generate, edit, download, and send source-backed proposals",
      },
      {
        key: "deals.audits",
        label: "Manage Brand Audits",
        description: "Generate and review evidence-led public brand audits",
      },
      {
        key: "deals.prospects",
        label: "Manage Prospect Checklist",
        description:
          "Create, update, and follow up prospect records, and run prospect generation research",
      },
    ],
  },
  {
    key: "testimonials",
    label: "Testimonials",
    route: "/admin/testimonials",
    permissions: [
      {
        key: "testimonials.view",
        label: "View",
        description: "See all testimonials",
      },
      {
        key: "testimonials.create",
        label: "Add",
        description: "Create new testimonials",
      },
      {
        key: "testimonials.edit",
        label: "Edit",
        description: "Modify testimonials & photos",
      },
      {
        key: "testimonials.delete",
        label: "Delete",
        description: "Remove testimonials",
      },
    ],
  },

  // ─────────────── Executive Board ───────────────
  {
    key: "executive_board",
    label: "Executive Board",
    route: "/admin/executive-board",
    permissions: [
      {
        key: "executive_board.view",
        label: "View Executive Board",
        description:
          "See budgets, expansion plans, targets, revenue models, and the vault index",
      },
      {
        key: "executive_board.budgets",
        label: "Manage Budgets",
        description: "Create, edit, and delete budget lines",
      },
      {
        key: "executive_board.expansion_budgets",
        label: "Manage expansion budgets",
        description: "Plan and update future company expansion budgets",
      },
      {
        key: "executive_board.targets",
        label: "Manage Targets",
        description: "Create, edit, and delete company targets",
      },
      {
        key: "executive_board.models",
        label: "Manage Revenue Models",
        description:
          "Create revenue models and their step-by-step execution plans",
      },
      {
        key: "executive_board.vault_view",
        label: "Open Vault Files",
        description:
          "Download legal documents and attachments held in the vault",
      },
      {
        key: "executive_board.vault_manage",
        label: "Manage Vault",
        description:
          "Upload files, build folders, set passwords, and issue share links",
      },
      {
        key: "executive_board.letterhead_manage",
        label: "Set Company Letterhead",
        description:
          "Replace the CDS Space letterhead applied to every official letter",
      },
    ],
  },

  // ─────────────── Finance ───────────────
  {
    key: "finance",
    label: "Finance Overview",
    route: "/admin/finance",
    permissions: [
      {
        key: "finance.view",
        label: "View Finance",
        description: "Access the finance section",
      },
      {
        key: "finance.manage",
        label: "Manage Finance",
        description: "Full cross-section access",
      },
    ],
  },
  {
    key: "finance_pricelists",
    label: "Pricelists",
    route: "/admin/finance/pricelists",
    permissions: [
      {
        key: "finance_pricelists.view",
        label: "View Pricelists",
        description: "See the client pricelists",
      },
      {
        key: "finance_pricelists.create",
        label: "Create Pricelists",
        description: "Upload a PDF or start a blank pricelist",
      },
      {
        key: "finance_pricelists.edit",
        label: "Edit Pricelists",
        description: "Edit packages, tables, currencies and add-ons",
      },
      {
        key: "finance_pricelists.publish",
        label: "Publish",
        description: "Publish or unpublish a client pricelist",
      },
      {
        key: "finance_pricelists.send",
        label: "Send by Email",
        description:
          "Email a pricelist to a client directly from the dashboard",
      },
      {
        key: "finance_pricelists.delete",
        label: "Delete Pricelists",
        description: "Permanently remove a pricelist",
      },
    ],
  },
  {
    key: "finance_invoices",
    label: "Invoices",
    route: "/admin/finance/invoices",
    permissions: [
      {
        key: "finance_invoices.view",
        label: "View Invoices",
        description: "Read-only access to invoices",
      },
      {
        key: "finance_invoices.create",
        label: "Create Invoices",
        description: "Issue new invoices",
      },
      {
        key: "finance_invoices.edit",
        label: "Edit Invoices",
        description: "Modify items, terms, delivery",
      },
      {
        key: "finance_invoices.delete",
        label: "Delete Invoices",
        description: "Permanently remove invoices",
      },
      {
        key: "finance_invoices.mark_paid",
        label: "Mark Paid",
        description: "Update payment status",
      },
      {
        key: "finance_invoices.export",
        label: "Download / Share",
        description: "Export PDF and copy share links",
      },
      {
        key: "finance_invoices.send",
        label: "Send by Email",
        description: "Email invoices to clients directly from the dashboard",
      },
    ],
  },
  {
    key: "finance_quotations",
    label: "Quotations",
    route: "/admin/finance/quotations",
    permissions: [
      {
        key: "finance_quotations.view",
        label: "View Quotations",
        description: "Read-only access to quotations",
      },
      {
        key: "finance_quotations.create",
        label: "Create Quotations",
        description: "Create rough project estimates",
      },
      {
        key: "finance_quotations.edit",
        label: "Edit Quotations",
        description: "Modify estimate items, metadata, delivery, and samples",
      },
      {
        key: "finance_quotations.delete",
        label: "Delete Quotations",
        description: "Permanently remove quotations",
      },
      {
        key: "finance_quotations.convert",
        label: "Convert to Invoice",
        description: "Turn an accepted quotation into a real invoice",
      },
      {
        key: "finance_quotations.export",
        label: "Download / Share",
        description: "Export PDF and copy share links",
      },
      {
        key: "finance_quotations.send",
        label: "Send by Email",
        description: "Email quotations to clients directly from the dashboard",
      },
    ],
  },
  {
    key: "finance_pricelist",
    label: "Price List",
    route: "/admin/finance/price-list",
    permissions: [
      {
        key: "finance_pricelist.view",
        label: "View Price List",
        description: "Browse saved price items",
      },
      {
        key: "finance_pricelist.create",
        label: "Create",
        description: "Add new price items",
      },
      {
        key: "finance_pricelist.edit",
        label: "Edit",
        description: "Modify existing price items",
      },
      {
        key: "finance_pricelist.delete",
        label: "Delete",
        description: "Remove price items",
      },
    ],
  },
  {
    key: "finance_expenditures",
    label: "Expenditures",
    route: "/admin/finance/expenditures",
    permissions: [
      {
        key: "finance_expenditures.view",
        label: "View Expenditures",
        description: "See all tracked expenses",
      },
      {
        key: "finance_expenditures.create",
        label: "Create",
        description: "Log new expenditures",
      },
      {
        key: "finance_expenditures.edit",
        label: "Edit",
        description: "Modify logged expenditures",
      },
      {
        key: "finance_expenditures.delete",
        label: "Delete",
        description: "Remove expenditures",
      },
      {
        key: "finance_expenditures.manage_suggestions",
        label: "Manage Suggestions",
        description: "Curate title + category dropdowns",
      },
    ],
  },
  {
    key: "finance_payroll",
    label: "Payroll Runs",
    route: "/admin/finance/payroll",
    permissions: [
      {
        key: "finance_payroll.view",
        label: "View Payroll",
        description: "Browse payroll runs",
      },
      {
        key: "finance_payroll.create",
        label: "Create Run",
        description: "Build a new payroll batch",
      },
      {
        key: "finance_payroll.edit",
        label: "Edit Run",
        description: "Modify a payroll batch",
      },
      {
        key: "finance_payroll.process",
        label: "Process / Pay",
        description: "Execute a payroll run",
      },
      {
        key: "finance_payroll.delete",
        label: "Delete Run",
        description: "Remove a payroll run",
      },
    ],
  },
  {
    key: "finance_audit",
    label: "Financial Audit",
    route: "/admin/finance/audit",
    permissions: [
      {
        key: "finance_audit.view",
        label: "View Audit",
        description: "See reconciliation reports",
      },
      {
        key: "finance_audit.export",
        label: "Export",
        description: "Download audit reports",
      },
      {
        key: "finance_audit.reconcile",
        label: "Reconcile statements",
        description: "Upload and process bank statements",
      },
    ],
  },

  // ─────────────── Projects ───────────────
  {
    key: "projects",
    label: "Projects",
    route: "/admin/projects",
    permissions: [
      {
        key: "projects.view",
        label: "View Projects",
        description: "See active & archived projects",
      },
      {
        key: "projects.create",
        label: "Create Projects",
        description: "Start new projects",
      },
      {
        key: "projects.edit",
        label: "Edit Projects",
        description: "Rename, reassign, change currency",
      },
      {
        key: "projects.delete",
        label: "Delete Projects",
        description: "Permanently remove projects",
      },
      {
        key: "projects.manage_milestones",
        label: "Milestones",
        description: "Add / pay / close milestones",
      },
      {
        key: "projects.manage_contractors",
        label: "Sub-contractors",
        description: "Assign and pay sub-contractors",
      },
      {
        key: "projects.manage_subscriptions",
        label: "Subscriptions",
        description: "Create and cancel retainer subscriptions",
      },
    ],
  },

  // ─────────────── Team compliance ───────────────
  {
    key: "team_compliance",
    label: "Team compliance",
    route: "/admin/team-compliance",
    permissions: [
      {
        key: "team_compliance.view",
        label: "View Team compliance",
        description:
          "See SOPs, the office library, and extra approval activity",
      },
      {
        key: "team_compliance.sops.manage",
        label: "Manage SOPs",
        description:
          "Draft, publish, assign, and attach media to standard operating procedures",
      },
      {
        key: "team_compliance.library.manage",
        label: "Manage library",
        description:
          "Catalogue books, print labels, and review loans of up to 21 days",
      },
      {
        key: "team_compliance.approvals.manage",
        label: "Review extra approvals",
        description: "Approve or reject signed overnight office requests",
      },
    ],
  },

  // ─────────────── HRM ───────────────
  {
    key: "applicants",
    label: "Applicants",
    route: "/admin/applications",
    permissions: [
      {
        key: "applicants.view",
        label: "View Applicants",
        description:
          "See career applicants, categorized by role, work type & staff type",
      },
      {
        key: "applicants.email",
        label: "Email Applicants",
        description: "Send bulk emails that go out as individual messages",
      },
      {
        key: "applicants.update_status",
        label: "Update Status",
        description:
          "Move applicants through new / reviewing / shortlisted / hired / rejected",
      },
      {
        key: "applicants.screening",
        label: "Screening",
        description:
          "Schedule screening, set objective questions, rate practical & interview tests",
      },
      {
        key: "applicants.assign_role",
        label: "Assign Roles",
        description: "Assign role categories",
      },
      {
        key: "applicants.export",
        label: "Export CSV",
        description: "Download applicant data",
      },
      {
        key: "applicants.archive",
        label: "Archive",
        description: "Archive/restore applicants",
      },
      {
        key: "applicants.delete",
        label: "Delete",
        description: "Remove applicants",
      },
      {
        key: "applicants.manage_openings",
        label: "Manage Openings",
        description: "Open & close job roles",
      },
      {
        key: "applicants.manage_certifications",
        label: "Certifications",
        description: "Track staff certifications",
      },
    ],
  },
  {
    key: "team_members",
    label: "Team Members",
    route: "/admin/team-members",
    permissions: [
      {
        key: "team_members.view",
        label: "View Members",
        description: "See the team roster",
      },
      {
        key: "team_members.invite",
        label: "Invite",
        description: "Create accounts & generate invite links",
      },
      {
        key: "team_members.edit",
        label: "Edit Members",
        description: "Update roles, departments, contact info",
      },
      {
        key: "team_members.promote",
        label: "Promote to Sub-admin",
        description: "Grant or revoke sub-admin access",
      },
      {
        key: "team_members.delete",
        label: "Remove Members",
        description: "Delete accounts",
      },
      {
        key: "team_members.edit_bank",
        label: "Edit Bank Details",
        description: "Manage each member's bank info directly",
      },
    ],
  },
  {
    key: "hr_compliance",
    label: "HR Compliance",
    route: "/admin/hrm/compliance",
    permissions: [
      {
        key: "hr_compliance.view",
        label: "View personnel records",
        description: "View confidential HR documents, queries, actions, and birthday reminders",
      },
      {
        key: "hr_compliance.manage",
        label: "Manage personnel records",
        description: "Upload and issue HR documents, letters, queries, and decisions",
      },
      {
        key: "hr_compliance.financial",
        label: "View financial records",
        description: "View bank details, salary history, payroll, and bank statements",
      },
    ],
  },
  {
    key: "team_today",
    label: "Taskboard",
    route: "/admin/taskboard",
    permissions: [
      {
        key: "team_today.view",
        label: "View Taskboards",
        description: "See shared lists, tasks, members and attached documents",
      },
      {
        key: "team_today.assign",
        label: "Manage Tasks",
        description: "Create, assign, edit and move Taskboard work",
      },
      {
        key: "team_today.resolve_blockers",
        label: "Manage Board Members",
        description: "Add and remove members from shared boards",
      },
    ],
  },
  {
    key: "timebook",
    label: "Attendance",
    route: "/admin/timebook",
    permissions: [
      {
        key: "timebook.view",
        label: "View Timebook",
        description: "See attendance, time logs, and compliance reports",
      },
      {
        key: "timebook.manage_schedules",
        label: "Manage Schedules",
        description: "Assign work modes and hybrid office days",
      },
      {
        key: "timebook.correct_entries",
        label: "Correct Entries",
        description: "Apply attendance corrections and exceptions",
      },
      {
        key: "timebook.review_leave",
        label: "Review Leave",
        description: "Approve or reject leave requests",
      },
      {
        key: "timebook.manage_geofence",
        label: "Manage Geofence",
        description: "Edit the office location, address, and check-in radius",
      },
      {
        key: "timebook.manage_bypass",
        label: "Manage Bypass Codes",
        description: "Generate and revoke geofence bypass codes for check-in",
      },
      {
        key: "timebook.export",
        label: "Export Reports",
        description: "Download payroll attendance exports",
      },
    ],
  },
  {
    key: "blog",
    label: "Intelligence Manager",
    route: "/admin/intelligence",
    permissions: [
      {
        key: "blog.view",
        label: "View Articles",
        description: "See the Intelligence article list",
      },
      {
        key: "blog.create",
        label: "Create & Edit",
        description: "Write, edit, and schedule articles",
      },
      {
        key: "blog.publish",
        label: "Publish",
        description: "Publish or unpublish articles",
      },
      {
        key: "blog.authors",
        label: "Manage Authors",
        description: "Create and edit Intelligence authors",
      },
      {
        key: "blog.settings",
        label: "Manage Settings",
        description:
          "Configure Intelligence publishing and engagement defaults",
      },
      {
        key: "blog.delete",
        label: "Delete Posts",
        description: "Permanently remove articles",
      },
    ],
  },
  {
    key: "work_tracking",
    label: "Work Activity",
    route: "/admin/work-tracking",
    permissions: [
      {
        key: "work_tracking.view",
        label: "View Activity",
        description:
          "See attendance-linked focus, task context, timelines and scorecards",
      },
      {
        key: "work_tracking.screenshots",
        label: "View Detailed Evidence",
        description: "Open the detailed member-confirmed activity timeline",
      },
      {
        key: "work_tracking.reports",
        label: "Generate Reports",
        description:
          "Generate daily summaries, weekly rollups, and report comparisons",
      },
      {
        key: "work_tracking.settings",
        label: "Manage Settings",
        description: "Manage heartbeat intervals, retention and access policy",
      },
      {
        key: "work_tracking.retention",
        label: "Manage Retention",
        description:
          "Clean up expired legacy evidence while preserving reports",
      },
    ],
  },
  {
    key: "team_reports",
    label: "Team Reports",
    route: "/admin/team-reports",
    permissions: [
      {
        key: "team_reports.view",
        label: "View Team Reports",
        description:
          "See each member's submitted reports next to the automated tracking report, side by side",
      },
      {
        key: "team_reports.generate",
        label: "Generate & Compare",
        description:
          "Run daily reports, weekly rollups, and manual-vs-tracked comparisons from this view",
      },
    ],
  },
  {
    key: "team_payroll",
    label: "Team Payroll",
    route: "/admin/team-payroll",
    permissions: [
      {
        key: "team_payroll.view",
        label: "View Payroll",
        description: "See team-member payroll entries",
      },
      {
        key: "team_payroll.create",
        label: "Create Entries",
        description: "Log new payroll entries (single or bulk)",
      },
      {
        key: "team_payroll.edit",
        label: "Edit Entries",
        description: "Adjust amounts, status, dates",
      },
      {
        key: "team_payroll.approve",
        label: "Approve",
        description: "Approve pending entries",
      },
      {
        key: "team_payroll.mark_paid",
        label: "Mark Paid",
        description: "Record payment + reference",
      },
      {
        key: "team_payroll.delete",
        label: "Delete Entries",
        description: "Remove payroll entries",
      },
      {
        key: "team_payroll.bank_edit",
        label: "Edit Bank Details",
        description: "Update bank info for any member",
      },
      {
        key: "team_payroll.bank_approve",
        label: "Review Bank Requests",
        description: "Approve or reject bank-change requests",
      },
      {
        key: "team_payroll.export",
        label: "Export CSV",
        description: "Download payroll history",
      },
    ],
  },
  {
    key: "departments",
    label: "Departments",
    route: "/admin/departments",
    permissions: [
      {
        key: "departments.view",
        label: "View Departments",
        description: "See all departments",
      },
      {
        key: "departments.manage",
        label: "Manage Departments",
        description: "Create, rename, delete departments",
      },
    ],
  },
  {
    key: "sub_admins",
    label: "Sub-admins & Roles",
    route: "/admin/sub-admins",
    permissions: [
      {
        key: "sub_admins.view",
        label: "View Sub-admins",
        description: "See the sub-admin roster",
      },
      {
        key: "sub_admins.create",
        label: "Create Sub-admins",
        description: "Add new sub-admin accounts",
      },
      {
        key: "sub_admins.edit",
        label: "Edit Sub-admins",
        description: "Update permissions, activate / deactivate",
      },
      {
        key: "sub_admins.delete",
        label: "Delete Sub-admins",
        description: "Remove sub-admin accounts",
      },
      {
        key: "admin_roles.view",
        label: "View Roles",
        description: "See the role catalogue",
      },
      {
        key: "admin_roles.manage",
        label: "Manage Roles",
        description: "Create, edit, delete roles",
      },
    ],
  },

  // ─────────────── Content Hub ───────────────
  {
    key: "content_hub",
    label: "Content Hub",
    route: "/admin/content-hub",
    permissions: [
      {
        key: "content_hub.view",
        label: "View Content Hub",
        description: "Open the content hub and dashboard",
      },
      {
        key: "content_hub.create",
        label: "Create Content",
        description: "Use the content creation wizard",
      },
      {
        key: "content_hub.visual_library",
        label: "Visual Library",
        description: "Upload, choose and manage content photos/videos",
      },
      {
        key: "content_hub.ai",
        label: "AI Tools",
        description: "Generate and enhance content with AI",
      },
      {
        key: "content_hub.calendar",
        label: "Content Calendar",
        description: "View and manage the posting calendar",
      },
      {
        key: "content_hub.approve",
        label: "Approve",
        description: "Approve content in the approval queue",
      },
      {
        key: "content_hub.schedule",
        label: "Schedule",
        description: "Schedule approved content & assign publishers",
      },
      {
        key: "content_hub.publish",
        label: "Publish / Mark Posted",
        description: "Copy, download assets, and mark content published",
      },
      {
        key: "content_hub.studio",
        label: "BSD Studio",
        description: "Repurpose BSD videos into clips and posts",
      },
      {
        key: "content_hub.settings",
        label: "Settings",
        description: "Manage branding presets and reminder defaults",
      },
    ],
  },

  // ─────────────── CREATE ───────────────
  {
    key: "create",
    label: "CREATE",
    route: "/admin/create",
    permissions: [
      {
        key: "create.view",
        label: "View CREATE Management",
        description: "Open the CREATE platform admin and analytics",
      },
      {
        key: "create.manage_tools",
        label: "Manage Tools",
        description: "Add, edit, enable, or disable CREATE tools",
      },
    ],
  },

  // ─────────────── Workspace ───────────────
  {
    key: "equipment_inventory",
    label: "Equipment inventory",
    route: "/admin/equipment-inventory",
    permissions: [
      {
        key: "equipment_inventory.view",
        label: "View equipment",
        description: "View equipment, receipts and current assignments",
      },
      {
        key: "equipment_inventory.manage",
        label: "Manage equipment",
        description: "Add, edit, assign and archive equipment",
      },
      {
        key: "equipment_inventory.manage_types",
        label: "Manage equipment types",
        description: "Add, edit and delete equipment types",
      },
      {
        key: "equipment_inventory.credentials",
        label: "View equipment passwords",
        description: "Reveal encrypted equipment passwords with an audit entry",
      },
    ],
  },
  {
    key: "workspace",
    label: "Workspace",
    permissions: [
      {
        key: "workspace.protect_docs",
        label: "Protect Docs",
        description: "Manage secure team documents",
      },
      {
        key: "workspace.cmeet",
        label: "cMeet",
        description: "Create and moderate meetings",
      },
      {
        key: "workspace.cdocs",
        label: "cDocs",
        description: "Create and edit internal docs",
      },
      {
        key: "workspace.csign",
        label: "cSign",
        description: "Request signatures on documents",
      },
      {
        key: "workspace.cresume",
        label: "cResume",
        description: "View team member resumes",
      },
      {
        key: "workspace.ai_system",
        label: "AI System",
        description: "Manage AI settings, knowledge docs, and templates",
      },
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
  // Expansion budgets were split from the original budget permission after
  // roles were already in use. Existing budget managers retain write access
  // to that part of the same Executive Board workflow.
  if (
    key === "executive_board.expansion_budgets" &&
    permissions.includes("executive_board.budgets")
  )
    return true;
  // Client identity is never inherited. Every rule below this line widens a
  // grant - a parent group implies its children, finance.manage implies the
  // finance pages - and any one of them would hand an admin client names and
  // contact details as a side effect of an unrelated permission. It has to be
  // ticked deliberately, so nothing past this point can grant it.
  if (key === CLIENT_IDENTITY_PERMISSION) return false;
  if (
    key === "clients.sales_settings.view" &&
    permissions.includes("clients.banners.view")
  )
    return true;
  if (
    key === "clients.sales_settings.edit" &&
    permissions.includes("clients.banners.edit")
  )
    return true;
  if (
    key === "clients.sales_scripts.view" &&
    permissions.includes("clients.sales_settings.view")
  )
    return true;
  if (
    key === "clients.sales_scripts.edit" &&
    permissions.includes("clients.sales_settings.edit")
  )
    return true;
  if (key.startsWith("finance_") && permissions.includes("finance.manage"))
    return true;
  const owningGroup = PERMISSION_GROUPS.find((g) =>
    g.permissions.some((p) => p.key === key),
  );
  if (owningGroup && permissions.includes(owningGroup.key)) return true;
  const group = PERMISSION_GROUPS.find((g) => g.key === key);
  if (group) {
    // Holding client identity alone must not unlock the section it is filed
    // under. It only ever widens what an admin can read on a page they can
    // already open, never which pages they can open.
    return group.permissions.some(
      (p) =>
        p.key !== CLIENT_IDENTITY_PERMISSION && permissions.includes(p.key),
    );
  }
  return false;
}

/** Map a pathname to the route-level permission key for it, or null. */
export function getPermissionForRoute(pathname: string): string | null {
  // Most-specific routes first.
  if (pathname === "/admin") return "dashboard";
  if (pathname.startsWith("/admin/audit-report")) return "audit_report";
  if (pathname.startsWith("/admin/upload-works")) return "upload_works";
  if (pathname.startsWith("/admin/works/")) return "upload_works";
  if (pathname.startsWith("/admin/ai-system")) return "workspace.ai_system";
  if (pathname.startsWith("/admin/equipment-inventory"))
    return "equipment_inventory";
  if (pathname.startsWith("/admin/protect-docs")) return "workspace";
  if (pathname.startsWith("/admin/cmeet")) return "workspace";
  if (pathname.startsWith("/admin/cdocs")) return "workspace";
  if (pathname.startsWith("/admin/csign")) return "workspace";
  if (pathname.startsWith("/admin/cresume")) return "workspace";

  if (pathname.startsWith("/admin/content-hub/create"))
    return "content_hub.create";
  if (pathname.startsWith("/admin/content-hub/calendar"))
    return "content_hub.calendar";
  if (pathname.startsWith("/admin/content-hub/visual-library"))
    return "content_hub.visual_library";
  if (pathname.startsWith("/admin/content-hub/approvals"))
    return "content_hub.approve";
  if (pathname.startsWith("/admin/content-hub/studio"))
    return "content_hub.studio";
  if (pathname.startsWith("/admin/content-hub/ai")) return "content_hub.ai";
  if (pathname.startsWith("/admin/content-hub/settings"))
    return "content_hub.settings";
  if (pathname.startsWith("/admin/content-hub")) return "content_hub";

  if (pathname.startsWith("/admin/messages")) return "messages";
  if (pathname.startsWith("/admin/chat")) return "team_chat";
  if (pathname.startsWith("/admin/announcements")) return "team_chat.broadcast";
  if (pathname.startsWith("/admin/integrations/whatsapp"))
    return "integrations.whatsapp";
  if (pathname.startsWith("/admin/integrations/meta"))
    return "integrations.meta";

  if (pathname.startsWith("/admin/consultations")) return "consultations";
  if (pathname.startsWith("/admin/portfolio-designs")) return "portfolio";
  if (pathname.startsWith("/admin/faqs")) return "faqs";
  if (pathname.startsWith("/admin/legal")) return "legal";
  if (pathname.startsWith("/admin/brand-briefs")) return "brand_briefs";
  if (pathname.startsWith("/admin/intelligence/create")) return "blog.create";
  if (pathname.startsWith("/admin/intelligence/authors")) return "blog.authors";
  if (pathname.startsWith("/admin/intelligence/settings"))
    return "blog.settings";
  if (
    pathname.startsWith("/admin/intelligence") ||
    pathname.startsWith("/admin/blog")
  )
    return "blog";
  if (pathname.startsWith("/admin/pricing")) return "pricing";

  if (pathname.startsWith("/admin/orders")) return "orders";
  if (pathname.startsWith("/admin/deals/proposals")) return "deals.proposals";
  if (pathname.startsWith("/admin/deals/brand-audits")) return "deals.audits";
  if (pathname.startsWith("/admin/deals/prospect-generation"))
    return "deals.prospects";
  if (pathname.startsWith("/admin/deals/prospects")) return "deals.prospects";
  if (pathname.startsWith("/admin/deals")) return "deals";
  if (pathname.startsWith("/admin/vendors")) return "clients";
  if (pathname.startsWith("/admin/clients/deliveries")) return "deliveries";
  if (pathname.startsWith("/admin/clients/mailings"))
    return "clients.mailings.view";
  if (pathname.startsWith("/admin/clients/modules"))
    return "clients.modules.view";
  if (pathname.startsWith("/admin/clients/sales-settings"))
    return "clients.sales_settings.view";
  if (pathname.startsWith("/admin/clients/sales-scripts"))
    return "clients.sales_scripts.view";
  if (pathname.startsWith("/admin/clients/banners"))
    return "clients.banners.view";
  if (pathname.startsWith("/admin/clients/merch")) return "clients.merch.view";
  if (pathname.startsWith("/admin/clients")) return "clients";
  if (pathname.startsWith("/admin/testimonials")) return "testimonials";

  if (pathname.startsWith("/admin/finance/pricelists"))
    return "finance_pricelists";
  if (pathname.startsWith("/admin/finance/invoices")) return "finance_invoices";
  if (pathname.startsWith("/admin/finance/quotations"))
    return "finance_quotations";
  if (pathname.startsWith("/admin/finance/price-list"))
    return "finance_pricelist";
  if (pathname.startsWith("/admin/finance/expenditures"))
    return "finance_expenditures";
  if (pathname.startsWith("/admin/finance/payroll")) return "finance_payroll";
  if (pathname.startsWith("/admin/finance/audit")) return "finance_audit";
  if (pathname.startsWith("/admin/finance")) return "finance";

  if (pathname.startsWith("/admin/projects")) return "projects";

  if (pathname.startsWith("/admin/team-compliance/sops"))
    return "team_compliance.sops.manage";
  if (pathname.startsWith("/admin/team-compliance/library"))
    return "team_compliance.library.manage";
  if (pathname.startsWith("/admin/team-compliance/approvals"))
    return "team_compliance.approvals.manage";
  if (pathname.startsWith("/admin/team-compliance")) return "team_compliance";

  if (pathname.startsWith("/admin/applications")) return "applicants";
  if (pathname.startsWith("/admin/screening")) return "applicants";
  if (pathname.startsWith("/admin/hrm/roles")) return "applicants";
  if (pathname.startsWith("/admin/hrm/certifications")) return "applicants";
  if (pathname.startsWith("/admin/hrm/compliance")) return "hr_compliance";
  if (pathname.startsWith("/admin/hrm")) return "applicants";

  if (pathname.startsWith("/admin/taskboard")) return "team_today";
  if (pathname.startsWith("/admin/team-today")) return "team_today";
  if (pathname.startsWith("/admin/team-members")) return "team_members";
  if (pathname.startsWith("/admin/timebook")) return "timebook";
  if (pathname.startsWith("/admin/time-machine")) return "timebook";
  if (pathname.startsWith("/admin/work-tracking")) return "work_tracking";
  if (pathname.startsWith("/admin/team-reports")) return "team_reports";
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
