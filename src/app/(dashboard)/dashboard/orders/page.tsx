"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { ShoppingBag, Clock, CheckCircle, Loader2, ExternalLink, Palette, Image as ImageIcon, Repeat, Package } from "lucide-react";
import Link from "next/link";
import { useClientAccount } from "@/components/dashboard/ClientAccountProvider";

interface Order {
  id: string;
  title: string;
  status: string;
  type: "design" | "banner" | "merch" | "recurring";
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  AWAITING_QUOTE: "bg-orange-50 text-orange-700",
  AWAITING_PAYMENT: "bg-sky-50 text-sky-700",
  PENDING: "bg-amber-50 text-amber-600",
  IN_REVIEW: "bg-blue-50 text-brand-blue",
  ACTIVE: "bg-emerald-50 text-emerald-600",
  COMPLETED: "bg-gray-100 text-gray-500",
  DRAFT: "bg-gray-100 text-gray-400",
  SCHEDULED: "bg-purple-50 text-purple-600",
};

const TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  design: { label: "Design", icon: <Palette className="w-3.5 h-3.5" />, color: "bg-indigo-50 text-indigo-600" },
  banner: { label: "Banner", icon: <ImageIcon className="w-3.5 h-3.5" />, color: "bg-orange-50 text-orange-600" },
  merch: { label: "Merch", icon: <Package className="w-3.5 h-3.5" />, color: "bg-emerald-50 text-emerald-600" },
  recurring: { label: "Recurring", icon: <Repeat className="w-3.5 h-3.5" />, color: "bg-purple-50 text-purple-600" },
};

export default function ClientOrdersPage() {
  const { account } = useClientAccount();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    const fetchOrders = async () => {
      setIsLoading(true);
      const supabase = createClient();

      // Fetch design requests
      const { data: designs } = await supabase
        .from("design_requests")
        .select("id, title, status, created_at")
        .eq("user_id", account.userId)
        .order("created_at", { ascending: false });

      // Fetch banner requests
      const { data: banners } = await supabase
        .from("banner_requests")
        .select("id, title, status, created_at")
        .eq("user_id", account.userId)
        .order("created_at", { ascending: false });

      // Fetch merch orders if table exists
      let merchOrders: Order[] = [];
      const { data: merch } = await supabase
        .from("merch_orders")
        .select("id, title, status, created_at")
        .eq("user_id", account.userId)
        .order("created_at", { ascending: false });
      if (merch) merchOrders = merch.map((m: Omit<Order, "type">) => ({ ...m, type: "merch" as const }));

      // Fetch recurring design subscriptions if table exists
      let recurringOrders: Order[] = [];
      const { data: recurring } = await supabase
        .from("recurring_designs")
        .select("id, title, status, created_at")
        .eq("user_id", account.userId)
        .order("created_at", { ascending: false });
      if (recurring) recurringOrders = recurring.map((r: Omit<Order, "type">) => ({ ...r, type: "recurring" as const }));

      const all: Order[] = [
        ...(designs || []).map((d: Omit<Order, "type">) => ({ ...d, type: "design" as const })),
        ...(banners || []).map((b: Omit<Order, "type">) => ({ ...b, type: "banner" as const })),
        ...merchOrders,
        ...recurringOrders,
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setOrders(all);
      setIsLoading(false);
    };
    fetchOrders();
  }, [account.userId]);

  const filtered = useMemo(() => {
    if (typeFilter === "all") return orders;
    return orders.filter(o => o.type === typeFilter);
  }, [orders, typeFilter]);

  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === "PENDING").length,
    active: orders.filter(o => ["ACTIVE", "IN_REVIEW"].includes(o.status)).length,
    completed: orders.filter(o => o.status === "COMPLETED").length,
  };

  const types = ["all", "design", "banner", "merch", "recurring"];

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[28px] lg:text-[34px] font-bold text-brand-navy tracking-tight">My Orders</h1>
        <p className="text-gray-500 text-sm mt-1">Track all your project requests and orders.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total", value: stats.total, icon: ShoppingBag, bg: "bg-blue-50", color: "text-brand-blue" },
          { label: "Pending", value: stats.pending, icon: Clock, bg: "bg-amber-50", color: "text-amber-500" },
          { label: "In Progress", value: stats.active, icon: Loader2, bg: "bg-purple-50", color: "text-purple-500" },
          { label: "Completed", value: stats.completed, icon: CheckCircle, bg: "bg-emerald-50", color: "text-emerald-500" },
        ].map(s => (
          <div key={s.label} className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/70 p-5 shadow-[0_10px_40px_rgba(15,40,90,0.05)]">
            <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center mb-3`}>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <p className="text-2xl font-bold text-brand-navy">{isLoading ? "..." : s.value}</p>
            <p className="text-xs text-brand-body/50 mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters + Table */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/70 shadow-[0_10px_40px_rgba(15,40,90,0.05)] overflow-hidden">
        <div className="px-6 py-4 border-b border-brand-stroke/10 flex items-center gap-2">
          {types.map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition ${
                typeFilter === t
                  ? "bg-brand-blue text-white"
                  : "bg-[#F5F7FA] text-brand-body/60 hover:text-brand-navy"
              }`}
            >
              {t === "all" ? "All" : TYPE_META[t]?.label || t}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="py-20 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-brand-blue mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <ShoppingBag className="w-10 h-10 text-brand-stroke mx-auto mb-3" />
            <p className="text-brand-body/50 text-sm">No orders yet</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-brand-stroke/10">
                {["Title", "Type", "Status", "Date", ""].map(h => (
                  <th key={h} className={`py-2.5 px-5 text-[11px] font-semibold text-brand-mute uppercase tracking-wider ${h === "" ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(order => {
                const meta = TYPE_META[order.type];
                return (
                  <tr key={`${order.type}-${order.id}`} className="border-b border-brand-stroke/5 hover:bg-[#F5F7FA]/50 transition">
                    <td className="py-3.5 px-5 text-[13px] font-medium text-brand-navy max-w-[250px] truncate">{order.title}</td>
                    <td className="py-3.5 px-5">
                      {meta && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${meta.color}`}>
                          {meta.icon} {meta.label}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-5">
                      <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-medium ${STATUS_STYLES[order.status] || "bg-gray-100 text-gray-500"}`}>
                        {order.status?.replace("_", " ") || "Unknown"}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-[13px] text-brand-body/50">
                      {new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <button className="p-1.5 rounded-md text-brand-mute hover:text-brand-blue hover:bg-blue-50 transition">
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
