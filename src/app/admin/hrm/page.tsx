"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ShieldCheck, Users, Briefcase, Award, ArrowUpRight, Loader2 } from "lucide-react";

interface Stats {
  subAdmins: number;
  applications: number;
  openRoles: number;
  certRequests: number;
  pendingCerts: number;
}

const SECTIONS = [
  { href: "/admin/sub-admins", label: "Sub-admins", desc: "Manage admin team & permissions", icon: ShieldCheck, tint: "from-blue-500 to-indigo-500" },
  { href: "/admin/applications", label: "Applications", desc: "Review applicants & assign roles", icon: Users, tint: "from-emerald-500 to-teal-500" },
  { href: "/admin/hrm/roles", label: "Open Roles", desc: "Post & manage job openings", icon: Briefcase, tint: "from-amber-500 to-orange-500" },
  { href: "/admin/hrm/certifications", label: "Certifications", desc: "Issue internship certificates", icon: Award, tint: "from-violet-500 to-purple-500" },
];

export default function HRMOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [subAdminsRes, appsRes, rolesRes, certsRes] = await Promise.all([
          supabase.from("sub_admins").select("id"),
          supabase.from("applications").select("id"),
          supabase.from("open_roles").select("id, is_active"),
          supabase.from("cert_requests").select("id, status"),
        ]);

        const certs = certsRes.data || [];
        setStats({
          subAdmins: subAdminsRes.data?.length || 0,
          applications: appsRes.data?.length || 0,
          openRoles: (rolesRes.data || []).filter(r => r.is_active).length,
          certRequests: certs.length,
          pendingCerts: certs.filter(c => c.status === "pending").length,
        });
      } catch (e) { console.error(e); }
      setIsLoading(false);
    }
    load();
  }, []);

  return (
    <div className="p-8 max-w-[1200px]">
      <div className="mb-8">
        <p className="text-[#0A4FE8] text-sm font-semibold">Operations</p>
        <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">HRM</h1>
        <p className="text-gray-400 text-[13px] mt-1">Human resource management — team, roles, applications & certifications</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
      ) : stats && (
        <div className="grid grid-cols-4 gap-5 mb-8">
          <Stat icon={<ShieldCheck className="w-5 h-5 text-[#0A4FE8]" />} label="Sub-admins" value={stats.subAdmins} bg="bg-blue-50" />
          <Stat icon={<Users className="w-5 h-5 text-emerald-600" />} label="Applications" value={stats.applications} bg="bg-emerald-50" />
          <Stat icon={<Briefcase className="w-5 h-5 text-amber-600" />} label="Active Roles" value={stats.openRoles} bg="bg-amber-50" />
          <Stat icon={<Award className="w-5 h-5 text-violet-600" />} label="Cert Requests" value={stats.certRequests} subtitle={`${stats.pendingCerts} pending`} bg="bg-violet-50" />
        </div>
      )}

      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Quick Access</h2>
      <div className="grid grid-cols-4 gap-5">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="group">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 h-full hover:shadow-lg hover:-translate-y-0.5 transition-all">
              <div className="flex items-start justify-between mb-5">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${s.tint} grid place-items-center shadow-lg shadow-blue-600/10`}>
                  <s.icon className="w-6 h-6 text-white" />
                </div>
                <ArrowUpRight className="w-5 h-5 text-gray-300 group-hover:text-[#0A4FE8] transition" />
              </div>
              <h3 className="font-semibold text-[#0D1B39]">{s.label}</h3>
              <p className="text-xs text-gray-500 mt-1">{s.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Stat({ icon, label, value, subtitle, bg }: { icon: React.ReactNode; label: string; value: number; subtitle?: string; bg: string }) {
  return (
    <div className={`${bg} rounded-2xl p-5`}>
      <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center mb-4 shadow-sm">{icon}</div>
      <p className="text-[28px] font-bold text-[#0D1B39] leading-none">{value}</p>
      <p className="text-[13px] text-gray-500 mt-1.5 font-medium">{label}</p>
      {subtitle && <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}
