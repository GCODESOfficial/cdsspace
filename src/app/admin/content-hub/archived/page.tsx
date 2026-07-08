"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { appAlert, appConfirm } from "@/lib/app-notify";
import ContentHubShell from "@/components/content-hub/ContentHubShell";
import { PlatformPills } from "@/components/content-hub/parts";
import type { ContentItem } from "@/lib/content-hub/shared";

export default function ArchivedContentPage() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/content-hub?status=archived", { cache: "no-store" });
    const json = await res.json();
    if (json.ok) setItems(json.items);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function restore(id: string) {
    const res = await fetch(`/api/admin/content-hub/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "draft" }),
    });
    const json = await res.json();
    if (json.ok) load(); else await appAlert({ title: "Restore", message: json.error || "Failed.", kind: "error" });
  }
  async function remove(id: string) {
    const ok = await appConfirm({ title: "Delete content", message: "Permanently remove from the hub?", destructive: true });
    if (!ok) return;
    const res = await fetch(`/api/admin/content-hub/${id}`, { method: "DELETE" });
    if ((await res.json()).ok) load();
  }

  return (
    <ContentHubShell title="Archived Content" subtitle="Parked content. Restore it back to a draft, or delete it for good.">
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-[#0A4FE8]" /></div>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-gray-100 bg-white py-16 text-center text-[13px] text-gray-400 shadow-sm">No archived content.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="flex flex-col rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <Link href={`/admin/content-hub/library?id=${item.id}`} className="text-[14px] font-bold text-[#0D1B39] hover:text-[#0A4FE8]">{item.title}</Link>
              <p className="mt-1 line-clamp-2 text-[12px] text-gray-500">{item.body || "No caption"}</p>
              <div className="mt-2"><PlatformPills platforms={item.platforms} /></div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => restore(item.id)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-[12px] font-semibold text-[#0D1B39] hover:bg-blue-50 hover:border-blue-200"><RotateCcw className="h-3.5 w-3.5" /> Restore</button>
                <button onClick={() => remove(item.id)} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-[12px] font-semibold text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </ContentHubShell>
  );
}
