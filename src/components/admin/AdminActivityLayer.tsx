"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Clock3, X } from "lucide-react";
import ActivityPanel from "@/components/admin/ActivityPanel";

export default function AdminActivityLayer() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const page = useMemo(() => pathname?.replace(/^\/admin\/?/, "") || "dashboard", [pathname]);

  useEffect(() => {
    setOpen(false);
    if (!pathname || pathname === "/admin/login") return;
    const now = Date.now();
    const key = `cds.admin.activity-access:${pathname}`;
    const previous = Number(window.sessionStorage.getItem(key) || 0);
    if (now - previous < 1500) return;
    window.sessionStorage.setItem(key, String(now));
    void fetch("/api/admin/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pathname }),
      keepalive: true,
    }).catch(() => undefined);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 end-5 z-40 inline-flex min-h-11 items-center gap-2 rounded-xl border border-blue-100 bg-white px-4 text-xs font-bold text-[#0A4FE8] shadow-[0_12px_35px_rgba(15,42,100,0.18)] transition hover:border-blue-200 hover:bg-blue-50"
        aria-label="Open page activity log"
      >
        <Clock3 className="h-4 w-4" /> Activity log
      </button>

      {open && (
        <div className="fixed inset-0 z-[80]">
          <button type="button" className="absolute inset-0 bg-[#07133B]/25 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-label="Close activity log" />
          <aside className="absolute inset-y-0 end-0 w-full max-w-[480px] overflow-y-auto border-s border-gray-100 bg-[#F6F8FC] p-4 shadow-2xl sm:p-6">
            <header className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#0A4FE8]">Audit trail</p>
                <h2 className="mt-1 text-xl font-bold text-[#07133B]">Page activity</h2>
                <p className="mt-1 truncate text-xs text-gray-500">/{page}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-800" aria-label="Close activity log"><X className="h-4 w-4" /></button>
            </header>
            <ActivityPanel key={`${page}-${open}`} page={page} title="Access and changes" limit={80} compact />
          </aside>
        </div>
      )}
    </>
  );
}
