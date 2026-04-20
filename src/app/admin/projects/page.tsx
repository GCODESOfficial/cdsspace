"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Briefcase, UserCog, Repeat, ArrowUpRight, Loader2, CheckCircle2, Clock, Pause } from "lucide-react";

interface Stats {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  pausedProjects: number;
  totalContractors: number;
  totalSubscriptions: number;
}

const SECTIONS = [
  { href: "/admin/projects/list", label: "Projects", desc: "Create & manage projects with milestones", icon: Briefcase, tint: "from-blue-500 to-indigo-500" },
  { href: "/admin/projects/contractors", label: "Sub-contractors", desc: "Manage sub-contractors & assignments", icon: UserCog, tint: "from-violet-500 to-purple-500" },
  { href: "/admin/projects/subscriptions", label: "Subscriptions", desc: "Recurring tools, servers & services", icon: Repeat, tint: "from-amber-500 to-orange-500" },
];

export default function ProjectsOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [projectsRes, contractorsRes, subsRes, recentRes] = await Promise.all([
          supabase.from("finance_projects").select("id, status"),
          supabase.from("finance_contractors").select("id"),
          supabase.from("finance_subscriptions").select("id").eq("active", true),
          supabase.from("finance_projects").select("id, name, client, status, created_at").order("created_at", { ascending: false }).limit(5),
        ]);

        const projects = projectsRes.data || [];
        setStats({
          totalProjects: projects.length,
          activeProjects: projects.filter(p => p.status === "active").length,
          completedProjects: projects.filter(p => p.status === "completed").length,
          pausedProjects: projects.filter(p => p.status === "paused").length,
          totalContractors: contractorsRes.data?.length || 0,
          totalSubscriptions: subsRes.data?.length || 0,
        });
        setRecentProjects(recentRes.data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="p-8 max-w-[1200px]">
      <div className="mb-8">
        <p className="text-[#0A4FE8] text-sm font-semibold">Operations</p>
        <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">Projects</h1>
        <p className="text-gray-400 text-[13px] mt-1">Manage projects, sub-contractors, and recurring subscriptions</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
      ) : stats && (
        <div className="grid grid-cols-4 gap-5 mb-8">
          <StatCard icon={<Briefcase className="w-5 h-5 text-[#0A4FE8]" />} label="Total Projects" value={stats.totalProjects} bg="bg-blue-50" />
          <StatCard icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />} label="Active" value={stats.activeProjects} bg="bg-emerald-50" />
          <StatCard icon={<UserCog className="w-5 h-5 text-purple-600" />} label="Sub-contractors" value={stats.totalContractors} bg="bg-purple-50" />
          <StatCard icon={<Repeat className="w-5 h-5 text-amber-600" />} label="Active Subs" value={stats.totalSubscriptions} bg="bg-amber-50" />
        </div>
      )}

      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Quick Access</h2>
      <div className="grid grid-cols-3 gap-5 mb-8">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="group">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 h-full hover:shadow-lg hover:-translate-y-0.5 transition-all">
              <div className="flex items-start justify-between mb-5">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${s.tint} grid place-items-center shadow-lg shadow-blue-600/10`}>
                  <s.icon className="w-6 h-6 text-white" />
                </div>
                <ArrowUpRight className="w-5 h-5 text-gray-300 group-hover:text-[#0A4FE8] transition" />
              </div>
              <h3 className="font-semibold text-[#0D1B39] text-lg">{s.label}</h3>
              <p className="text-sm text-gray-500 mt-1">{s.desc}</p>
            </div>
          </Link>
        ))}
      </div>

      {recentProjects.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-[#0D1B39]">Recent Projects</h2>
            <Link href="/admin/projects/list" className="text-xs text-[#0A4FE8] hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentProjects.map(p => (
              <Link key={p.id} href="/admin/projects/list" className="flex items-center gap-3 px-6 py-3 hover:bg-blue-50/30 transition">
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-[#0A4FE8] flex-shrink-0">
                  <Briefcase className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[#0D1B39] truncate">{p.name}</p>
                  <p className="text-[11px] text-gray-400">{p.client}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${
                  p.status === "active" ? "bg-emerald-50 text-emerald-600" :
                  p.status === "completed" ? "bg-gray-100 text-gray-500" :
                  p.status === "paused" ? "bg-amber-50 text-amber-600" : "bg-gray-100 text-gray-500"
                }`}>{p.status}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, bg }: { icon: React.ReactNode; label: string; value: number; bg: string }) {
  return (
    <div className={`${bg} rounded-2xl p-5`}>
      <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center mb-4 shadow-sm">{icon}</div>
      <p className="text-[28px] font-bold text-[#0D1B39] leading-none">{value}</p>
      <p className="text-[13px] text-gray-500 mt-1.5 font-medium">{label}</p>
    </div>
  );
}
