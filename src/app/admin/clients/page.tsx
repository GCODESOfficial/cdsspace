"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  Building2, ShoppingBag, Quote, ArrowUpRight, Loader2,
  Users, TrendingUp, MessageSquare,
  PackageCheck,
  Mail,
} from "lucide-react";

interface Stats {
  totalClients: number;
  activeClients: number;
  totalOrders: number;
  totalTestimonials: number;
}

const SECTIONS = [
  { href: "/admin/clients/deliveries", label: "Client Deliveries", desc: "Send finished project files directly to clients", icon: PackageCheck, tint: "bg-[#0A4FE8]" },
  { href: "/admin/clients/list", label: "Unified Client List", desc: "Manage manual customers and platform accounts", icon: Building2, tint: "bg-[#0A4FE8]" },
  { href: "/admin/clients/mailings", label: "Client mailings", desc: "Write and send branded email campaigns", icon: Mail, tint: "bg-[#0A4FE8]" },
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
        const [directoryRes, ordersRes, testimonialsRes] = await Promise.all([
          fetch("/api/admin/clients/directory", { cache: "no-store" }),
          supabase.from("design_requests").select("id"),
          supabase.from("testimonials").select("id"),
        ]);

        const directory = await directoryRes.json().catch(() => ({}));
        const clients = directoryRes.ok ? directory.clients || [] : [];
        setStats({
          totalClients: clients.length,
          activeClients: clients.filter((c: { status?: string }) => c.status === "active").length,
          totalOrders: ordersRes.data?.length || 0,
          totalTestimonials: testimonialsRes.data?.length || 0,
        });
        setRecentClients([...clients].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5));
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
        <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">Sales Hub</h1>
        <p className="text-gray-400 text-[13px] mt-1">Client relationships, finished-work delivery, orders, and testimonials in one place.</p>
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
      <div className="grid gap-5 mb-8 md:grid-cols-2 xl:grid-cols-4">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="group">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 h-full hover:shadow-lg hover:-translate-y-0.5 transition-all">
              <div className="flex items-start justify-between mb-5">
                <div className={`w-12 h-12 rounded-xl bg-[#0A4FE8] grid place-items-center shadow-lg shadow-blue-600/10`}>
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
                  {(c.industries?.length || c.industry) && (
                    <p className="truncate text-[11px] text-gray-400">
                      {(c.industries?.length ? c.industries : [c.industry]).filter(Boolean).join(" · ")}
                    </p>
                  )}
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
