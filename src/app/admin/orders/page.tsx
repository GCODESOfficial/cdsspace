"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Search, ExternalLink, ShoppingBag, Clock, Loader2, CheckCircle, TrendingUp, Trash2, Archive, Package, Repeat } from "lucide-react";
import BulkActionBar from "@/components/admin/BulkActionBar";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";

interface OrderProfile { full_name: string; email: string; }
interface Order {
  id: string; displayId: string; type: "design" | "banner" | "merch" | "recurring"; title: string;
  status: string; created_at: string; profile: OrderProfile | null;
}
interface OrderStats { total: number; pending: number; inProgress: number; completed: number; }

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-600",
  IN_REVIEW: "bg-blue-50 text-[#0A4FE8]",
  ACTIVE: "bg-emerald-50 text-emerald-600",
  COMPLETED: "bg-gray-100 text-gray-500",
  DRAFT: "bg-gray-100 text-gray-400",
  SCHEDULED: "bg-purple-50 text-purple-600",
  ARCHIVED: "bg-gray-100 text-gray-400",
};

const ALL_STATUSES = ["All", "PENDING", "IN_REVIEW", "ACTIVE", "COMPLETED", "DRAFT", "SCHEDULED", "ARCHIVED"];

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<OrderStats>({ total: 0, pending: 0, inProgress: 0, completed: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    const copy = new Set(selected);
    copy.has(id) ? copy.delete(id) : copy.add(id);
    setSelected(copy);
  };
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(o => o.id)));
  };
  const handleBulkArchive = async () => {
    if (!(await appConfirm(`Archive ${selected.size} orders?`))) return;
    for (const id of selected) {
      await fetch(`/api/admin/orders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ARCHIVED" }) }).catch(() => {});
    }
    setSelected(new Set());
    // Refetch
    setIsLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== "All") params.set("status", statusFilter);
    fetch(`/api/admin/orders?${params}`).then(r => r.ok ? r.json() : null).then(d => { if (d) setOrders(d.orders || []); }).finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetch("/api/admin/stats").then(r => r.ok ? r.json() : null).then(d => { if (d) setStats(d); }).finally(() => setStatsLoading(false));
  }, []);

  useEffect(() => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== "All") params.set("status", statusFilter);
    if (searchQuery.trim()) params.set("search", searchQuery.trim());
    fetch(`/api/admin/orders?${params}`).then(r => r.ok ? r.json() : null).then(d => { if (d) setOrders(d.orders || []); }).finally(() => setIsLoading(false));
  }, [statusFilter, searchQuery]);

  const filtered = useMemo(() => typeFilter === "all" ? orders : orders.filter(o => o.type === typeFilter), [orders, typeFilter]);

  const statCards = [
    { label: "Total Orders", value: stats.total, icon: ShoppingBag, color: "blue" as const },
    { label: "Pending", value: stats.pending, icon: Clock, color: "orange" as const },
    { label: "In Progress", value: stats.inProgress, icon: TrendingUp, color: "purple" as const },
    { label: "Completed", value: stats.completed, icon: CheckCircle, color: "green" as const },
  ];

  const colorMap = { blue: "bg-blue-50 text-[#0A4FE8]", orange: "bg-orange-50 text-orange-500", purple: "bg-purple-50 text-purple-500", green: "bg-emerald-50 text-emerald-500" };
  const iconBgMap = { blue: "bg-blue-100", orange: "bg-orange-100", purple: "bg-purple-100", green: "bg-emerald-100" };

  return (
    <div className="p-8 max-w-[1200px]">
      <div className="mb-8">
        <p className="text-[#0A4FE8] text-sm font-semibold">Management</p>
        <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">Client Orders</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-5 mb-8">
        {statCards.map((s) => (
          <div key={s.label} className={`${colorMap[s.color].split(" ")[0]} rounded-2xl p-5`}>
            <div className={`${iconBgMap[s.color]} w-10 h-10 rounded-xl flex items-center justify-center mb-4`}>
              <s.icon className={`w-5 h-5 ${colorMap[s.color].split(" ")[1]}`} />
            </div>
            <p className="text-[28px] font-bold text-[#0D1B39]">{statsLoading ? "..." : s.value}</p>
            <p className="text-[13px] text-gray-500 mt-1 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-4 flex-wrap">
          {/* Bulk */}
          <BulkActionBar selectedCount={selected.size} onClear={() => setSelected(new Set())} actions={[
            { label: "Archive", icon: <Archive className="w-3.5 h-3.5" />, onClick: handleBulkArchive },
          ]} />

          {/* Type */}
          <div className="flex items-center gap-1.5">
            {(["all", "design", "banner", "merch", "recurring"]).map((t) => (
              <button key={t} onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition ${
                  typeFilter === t ? "bg-[#0A4FE8] text-white" : "bg-gray-50 text-gray-500 border border-gray-200 hover:border-blue-200"
                }`}>
                {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Status */}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer">
            {ALL_STATUSES.map(s => <option key={s} value={s}>{s === "All" ? "All Statuses" : s.replace("_", " ")}</option>)}
          </select>

          {/* Search */}
          <div className="relative flex-1 max-w-sm ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 w-full rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition" />
          </div>
        </div>

        {/* Table */}
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="py-2.5 px-4 w-10">
                <input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleAll} className="w-4 h-4 rounded border-gray-300 text-[#0A4FE8] cursor-pointer" />
              </th>
              {["Order ID", "Type", "Title", "Client", "Status", "Date", ""].map((h) => (
                <th key={h} className={`py-2.5 px-4 text-[11px] font-semibold text-gray-400 uppercase tracking-wider ${h === "" ? "text-right pr-6" : "text-left"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-400 mx-auto" /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="py-16 text-center text-gray-400 text-sm">No orders found</td></tr>
            ) : (
              filtered.map((order) => (
                <tr key={order.id} className={`border-b border-gray-50 hover:bg-blue-50/30 transition ${selected.has(order.id) ? "bg-blue-50/50" : ""}`}>
                  <td className="py-3 px-4">
                    <input type="checkbox" checked={selected.has(order.id)} onChange={() => toggleSelect(order.id)} className="w-4 h-4 rounded border-gray-300 text-[#0A4FE8] cursor-pointer" />
                  </td>
                  <td className="py-3 px-4 font-mono text-[12px] text-gray-500">{order.displayId}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-medium ${
                      order.type === "design" ? "bg-indigo-50 text-indigo-600"
                        : order.type === "banner" ? "bg-orange-50 text-orange-600"
                        : order.type === "merch" ? "bg-emerald-50 text-emerald-600"
                        : "bg-purple-50 text-purple-600"
                    }`}>{order.type.charAt(0).toUpperCase() + order.type.slice(1)}</span>
                  </td>
                  <td className="py-3 px-4 text-[13px] font-medium text-[#0D1B39] max-w-[200px] truncate">{order.title}</td>
                  <td className="py-3 px-4">
                    <p className="text-[13px] text-[#0D1B39]">{order.profile?.full_name || "Unknown"}</p>
                    <p className="text-[11px] text-gray-400">{order.profile?.email || ""}</p>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-medium ${STATUS_COLORS[order.status] || "bg-gray-100 text-gray-500"}`}>
                      {order.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-[13px] text-gray-400">
                    {new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Link href={`/admin/orders/${order.id}`}>
                      <button className="p-1.5 rounded-md text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50 transition">
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
