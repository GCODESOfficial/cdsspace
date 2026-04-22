"use client";

import Link from "next/link";
import { Hammer, type LucideIcon, ArrowUpRight } from "lucide-react";

/**
 * Admin-side placeholder for Workspace modules whose data model
 * already exists in supabase-team-portal.sql but whose UI is
 * landing in the next iteration. Mirrors the admin visual language
 * (light cards, blue accents) rather than the dark team theme.
 */
export function WorkspacePlaceholder({
  title,
  description,
  icon: Icon,
  tables,
  capabilities,
  teamLink,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  tables: string[];
  capabilities: string[];
  teamLink?: { href: string; label: string };
}) {
  return (
    <div className="p-8 max-w-[1100px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#0A4FE8]/10 text-[#0A4FE8] flex items-center justify-center">
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[#0A4FE8] text-sm font-semibold">Workspace</p>
            <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">{title}</h1>
            <p className="text-gray-500 text-[13px] mt-1 max-w-xl">{description}</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-bold uppercase tracking-wider">
          <Hammer className="w-3 h-3" />
          In progress
        </span>
      </div>

      {/* Two-column: what admins can do + backing tables */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">
            Admin capabilities
          </p>
          <ul className="space-y-3">
            {capabilities.map((c) => (
              <li key={c} className="flex items-start gap-2.5 text-[13px] text-gray-700">
                <span className="w-5 h-5 rounded-full bg-[#0A4FE8]/10 text-[#0A4FE8] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                  →
                </span>
                {c}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">
            Backing tables
          </p>
          <div className="space-y-2">
            {tables.map((t) => (
              <div
                key={t}
                className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-100 font-mono text-[12px] text-gray-700"
              >
                public.{t}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">
            All tables are already created, RLS-enabled, and accessible through the service role.
            The admin UI is the next iteration.
          </p>
        </div>
      </div>

      {teamLink && (
        <div className="mt-4 rounded-2xl border border-gray-100 bg-gradient-to-r from-[#0A4FE8]/[0.04] to-white p-5 flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold text-[#0D1B39]">
              Team members already use this module
            </p>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Peek at what team members see in the team portal.
            </p>
          </div>
          <Link
            href={teamLink.href}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0D1B39] text-white text-[12px] font-semibold hover:bg-[#0A4FE8] transition"
          >
            {teamLink.label}
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}
