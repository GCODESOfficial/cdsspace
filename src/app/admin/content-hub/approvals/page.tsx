"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ShieldCheck, Archive } from "lucide-react";
import { appAlert } from "@/lib/app-notify";
import ContentHubShell from "@/components/content-hub/ContentHubShell";
import { PlatformPills } from "@/components/content-hub/parts";
import { buildCaption } from "@/components/content-hub/parts";
import type { ContentItem } from "@/lib/content-hub/shared";

export default function ApprovalQueuePage() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/content-hub?status=pending", { cache: "no-store" });
    const json = await res.json();
    if (json.ok) setItems(json.items);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function decide(id: string, status: "approved" | "archived") {
    const res = await fetch(`/api/admin/content-hub/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) { await appAlert({ title: "Approval", message: json.error || "Failed.", kind: "error" }); return; }
    load();
  }

  return (
    <ContentHubShell title="Approval Queue" subtitle="Content waiting for sign-off. Approve to unlock scheduling, or send it back to archive.">
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-[#0A4FE8]" /></div>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-gray-100 bg-white py-16 text-center text-[13px] text-gray-400 shadow-sm">Nothing pending approval. 🎉</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">Pending Approval</span>
                    <span className="text-[11px] text-gray-400">{item.content_type} · by {item.created_by || "-"}</span>
                  </div>
                  <Link href={`/admin/content-hub/library?id=${item.id}`} className="text-[15px] font-bold text-[#0D1B39] hover:text-[#0A4FE8]">{item.title}</Link>
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[12.5px] text-gray-500">{buildCaption(item)}</p>
                  <div className="mt-2"><PlatformPills platforms={item.platforms} /></div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => decide(item.id, "approved")} className="inline-flex items-center gap-1.5 rounded-xl bg-[#0A4FE8] px-4 py-2.5 text-[12.5px] font-bold text-white hover:bg-[#083EC0]"><ShieldCheck className="h-4 w-4" /> Approve</button>
                  <button onClick={() => decide(item.id, "archived")} className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2.5 text-[12.5px] font-semibold text-gray-600 hover:bg-gray-50"><Archive className="h-4 w-4" /> Archive</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </ContentHubShell>
  );
}
