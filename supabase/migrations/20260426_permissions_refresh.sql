-- ============================================
-- CDS Space: Permission catalogue refresh
--
-- The source of truth for permission keys lives in
-- src/lib/admin-permissions.ts. This migration:
--   1. Makes sure sub_admins / team_members / admin_roles can store
--      the expanded keys (text[] already handles it - this is a safety
--      re-check so the columns always exist and have the right type).
--   2. Re-seeds the starter roles with the new granular keys for the
--      newly-covered menus (Brand Briefs, Invoices, Clients, Team
--      Payroll bank flow, Projects, Integrations, Sub-admin / Roles).
-- Idempotent: safe to re-run.
-- ============================================

-- Ensure the permission columns exist and are text[].
alter table public.sub_admins
  add column if not exists permissions text[] not null default '{}';

alter table public.team_members
  add column if not exists permissions text[] not null default '{}';

-- admin_roles was created by 20260423_admin_roles.sql; guard anyway.
create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  permissions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Refresh starter role bundles with the up-to-date permission keys.
-- Existing rows with matching names have their permissions + description
-- replaced so admins don't need to reseed manually after the permission
-- vocabulary grows.
insert into public.admin_roles (name, description, permissions) values
  (
    'Viewer',
    'Read-only across the most-used sections: dashboard, finance, orders, consultations, clients, conversations.',
    array[
      'dashboard.view','dashboard.stats',
      'finance.view','finance_invoices.view','finance_pricelist.view','finance_expenditures.view','finance_payroll.view','finance_audit.view',
      'orders.view','clients.view','testimonials.view',
      'consultations.view','messages.view','team_chat.view',
      'brand_briefs.view','portfolio.view','faqs.view','legal.view',
      'applicants.view','team_members.view','team_payroll.view','departments.view','projects.view'
    ]
  ),
  (
    'Finance Manager',
    'Full control over invoices, pricelist, expenditures, payroll runs, audit, and projects.',
    array[
      'finance.view','finance.manage',
      'finance_invoices.view','finance_invoices.create','finance_invoices.edit','finance_invoices.delete','finance_invoices.mark_paid','finance_invoices.export',
      'finance_pricelist.view','finance_pricelist.create','finance_pricelist.edit','finance_pricelist.delete',
      'finance_expenditures.view','finance_expenditures.create','finance_expenditures.edit','finance_expenditures.delete','finance_expenditures.manage_suggestions',
      'finance_payroll.view','finance_payroll.create','finance_payroll.edit','finance_payroll.process','finance_payroll.delete',
      'finance_audit.view','finance_audit.export',
      'projects.view','projects.create','projects.edit','projects.manage_milestones','projects.manage_contractors','projects.manage_subscriptions',
      'clients.view','clients.create','clients.edit'
    ]
  ),
  (
    'Client Success',
    'Handle consultations, client orders, brand briefs, and client conversations end-to-end.',
    array[
      'consultations.view','consultations.manage','consultations.delete',
      'messages.view','messages.send',
      'orders.view','orders.update_status','orders.archive','orders.export',
      'clients.view','clients.create','clients.edit','clients.export',
      'brand_briefs.view','brand_briefs.create','brand_briefs.edit','brand_briefs.archive','brand_briefs.convert',
      'testimonials.view','testimonials.create','testimonials.edit',
      'dashboard.view'
    ]
  ),
  (
    'HR Manager',
    'Hiring, payroll approvals, team directory, and bank-change reviews.',
    array[
      'applicants.view','applicants.assign_role','applicants.export','applicants.archive','applicants.manage_openings','applicants.manage_certifications',
      'team_members.view','team_members.invite','team_members.edit','team_members.edit_bank',
      'team_payroll.view','team_payroll.create','team_payroll.edit','team_payroll.approve','team_payroll.mark_paid','team_payroll.bank_edit','team_payroll.bank_approve','team_payroll.export',
      'departments.view','departments.manage',
      'dashboard.view'
    ]
  ),
  (
    'Content & Marketing',
    'Manage portfolio, FAQs, testimonials, brand briefs, and social integrations.',
    array[
      'portfolio.view','portfolio.upload','portfolio.edit','portfolio.delete',
      'faqs.view','faqs.create','faqs.edit','faqs.delete',
      'testimonials.view','testimonials.create','testimonials.edit','testimonials.delete',
      'brand_briefs.view','brand_briefs.create','brand_briefs.edit',
      'upload_works.view','upload_works.create','upload_works.edit',
      'integrations.whatsapp','integrations.meta',
      'messages.view','messages.send',
      'dashboard.view'
    ]
  ),
  (
    'Project Coordinator',
    'Run the project + sub-contractor pipeline without touching finance approvals.',
    array[
      'projects.view','projects.create','projects.edit','projects.manage_milestones','projects.manage_contractors','projects.manage_subscriptions',
      'upload_works.view','upload_works.assign',
      'clients.view',
      'team_members.view','team_chat.view','team_chat.send',
      'brand_briefs.view','brand_briefs.convert',
      'dashboard.view'
    ]
  ),
  (
    'Workspace Admin',
    'Full access to the internal workspace tools (cDocs, cMeet, cSign, cResume, Protect Docs, AI System).',
    array[
      'workspace.cdocs','workspace.cmeet','workspace.csign','workspace.cresume','workspace.protect_docs','workspace.ai_system',
      'team_chat.view','team_chat.send','team_chat.broadcast','team_chat.manage_threads',
      'team_members.view','departments.view','dashboard.view'
    ]
  )
on conflict (name) do update set
  description = excluded.description,
  permissions = excluded.permissions,
  updated_at  = now();
