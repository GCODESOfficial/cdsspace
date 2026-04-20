"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  Building2, ShoppingBag, Quote, ArrowUpRight, Loader2,
  Users, TrendingUp, MessageSquare,
} from "lucide-react";

interface Stats {
  totalClients: number;
  activeClients: number;
  totalOrders: number;
  totalTestimonials: number;
}

const SECTIONS = [
  { href: "/admin/clients/list", label: "Client / Brand List", desc: "Manage all clients & brands", icon: Building2, tint: "from-blue-500 to-indigo-500" },
  { href: "/admin/orders", label: "Client Orders", desc: "Track design, banner, merch & recurring orders", icon: ShoppingBag, tint: "from-emerald-500 to-teal-500" },
  { href: "/admin/testimonials", label: "Testimonials", desc: "Manage client testimonials & photos", icon: Quote, tint: "from-amber-500 to-orange-500" },
];

export default function ClientsOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentClients, setRecentClients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const [clientsRes, ordersRes, testimonialsRes, recentRes] = await Promise.all([
          supabase.from("clients").select("id, status"),
          supabase.from("design_requests").select("id"),
          supabase.from("testimonials").select("id"),
          supabase.from("clients").select("id, name, brand_name, industry, created_at").order("created_at", { ascending: false }).limit(5),
        ]);

        const clients = clientsRes.data || [];
        setStats({
          totalClients: clients.length,
          activeClients: clients.filter(c => c.status === "active").length,
          totalOrders: ordersRes.data?.length || 0,
          totalTestimonials: testimonialsRes.data?.length || 0,
        });
        setRecentClients(recentRes.data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
    loadStats();
  }, []);

  return (
    <div className="p-8 max-w-[1200px]">
      <div className="mb-8">
        <p className="text-[#0A4FE8] text-sm font-semibold">Management</p>
        <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">Clients</h1>
        <p className="text-gray-400 text-[13px] mt-1">All client relationships in one place — brands, orders, and testimonials.</p>
      </div>

      {/* Stats */}
      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
      ) : stats && (
        <div className="grid grid-cols-4 gap-5 mb-8">
          <StatCard icon={<Building2 className="w-5 h-5 text-[#0A4FE8]" />} label="Total Clients" value={stats.totalClients} subtitle={`${stats.activeClients} active`} bg="bg-blue-50" />
          <StatCard icon={<ShoppingBag className="w-5 h-5 text-emerald-600" />} label="Total Orders" value={stats.totalOrders} bg="bg-emerald-50" />
          <StatCard icon={<Quote className="w-5 h-5 text-amber-600" />} label="Testimonials" value={stats.totalTestimonials} bg="bg-amber-50" />
          <StatCard icon={<TrendingUp className="w-5 h-5 text-purple-600" />} label="Active Engagements" value={stats.activeClients} bg="bg-purple-50" />
        </div>
      )}

      {/* Section Cards */}
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

      {/* Recent Clients */}
      {recentClients.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-[#0D1B39]">Recently Added</h2>
            <Link href="/admin/clients/list" className="text-xs text-[#0A4FE8] hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentClients.map(c => (
              <Link key={c.id} href="/admin/clients/list" className="flex items-center gap-3 px-6 py-3 hover:bg-blue-50/30 transition">
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-[#0A4FE8] text-sm font-bold">
                  {(c.brand_name || c.name).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[#0D1B39] truncate">{c.brand_name || c.name}</p>
                  {c.industry && <p className="text-[11px] text-gray-400">{c.industry}</p>}
                </div>
                <span className="text-[11px] text-gray-300">{new Date(c.created_at).toLocaleDateString()}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, subtitle, bg }: { icon: React.ReactNode; label: string; value: number; subtitle?: string; bg: string }) {
  return (
    <div className={`${bg} rounded-2xl p-5`}>
      <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center mb-4 shadow-sm">{icon}</div>
      <p className="text-[28px] font-bold text-[#0D1B39] leading-none">{value}</p>
      <p className="text-[13px] text-gray-500 mt-1.5 font-medium">{label}</p>
      {subtitle && <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}
