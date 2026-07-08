"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import ContentHubShell from "@/components/content-hub/ContentHubShell";
import { StatusBadge } from "@/components/content-hub/parts";
import { platformLabel, type ContentItem } from "@/lib/content-hub/shared";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

export default function ContentCalendarPage() {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Fetch scheduled + published items within the visible month.
  useEffect(() => {
    const from = new Date(cursor.y, cursor.m, 1).toISOString();
    const to = new Date(cursor.y, cursor.m + 1, 0, 23, 59, 59).toISOString();
    setLoading(true);
    fetch(`/api/admin/content-hub?status=scheduled,published&from=${from}&to=${to}&limit=500`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.ok) setItems(d.items); })
      .finally(() => setLoading(false));
  }, [cursor]);

  const byDay = useMemo(() => {
    const map = new Map<string, ContentItem[]>();
    for (const it of items) {
      if (!it.scheduled_at) continue;
      const key = ymd(new Date(it.scheduled_at));
      const list = map.get(key) || []; list.push(it); map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => (a.scheduled_at! < b.scheduled_at! ? -1 : 1));
    return map;
  }, [items]);

  // Build the month grid (leading blanks + days).
  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const lead = first.getDay();
    const arr: (string | null)[] = [];
    for (let i = 0; i < lead; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(ymd(new Date(cursor.y, cursor.m, d)));
    return arr;
  }, [cursor]);

  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
  const todayKey = ymd(new Date());
  const dayItems = selectedDay ? byDay.get(selectedDay) || [] : [];

  return (
    <ContentHubShell
      title="Content Calendar"
      subtitle="Every scheduled post on one calendar. Click a day to see what's going out and who's posting."
      action={
        <div className="flex items-center gap-2">
          <button onClick={() => setCursor((c) => ({ y: c.m === 0 ? c.y - 1 : c.y, m: c.m === 0 ? 11 : c.m - 1 }))} className="rounded-xl border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-[150px] text-center text-[14px] font-bold text-[#0D1B39]">{monthLabel}</span>
          <button onClick={() => setCursor((c) => ({ y: c.m === 11 ? c.y + 1 : c.y, m: c.m === 11 ? 0 : c.m + 1 }))} className="rounded-xl border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"><ChevronRight className="h-4 w-4" /></button>
        </div>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:p-4">
          {loading && <div className="mb-2 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-[#0A4FE8]" /></div>}
          <div className="grid grid-cols-7 gap-1">
            {DOW.map((d) => <div key={d} className="pb-2 text-center text-[10.5px] font-bold uppercase tracking-wider text-gray-400">{d}</div>)}
            {cells.map((key, i) => {
              if (!key) return <div key={`b${i}`} />;
              const list = byDay.get(key) || [];
              const day = Number(key.split("-")[2]);
              const isToday = key === todayKey;
              return (
                <button key={key} type="button" onClick={() => setSelectedDay(key)}
                  className={`min-h-[84px] rounded-xl border p-1.5 text-left transition ${selectedDay === key ? "border-[#0A4FE8] ring-2 ring-blue-100" : "border-gray-100 hover:border-blue-200"}`}>
                  <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${isToday ? "bg-[#0A4FE8] text-white" : "text-gray-500"}`}>{day}</span>
                  <div className="mt-1 space-y-0.5">
                    {list.slice(0, 3).map((it) => (
                      <div key={it.id} className="truncate rounded bg-blue-50 px-1 py-0.5 text-[9.5px] font-medium text-[#0A4FE8]">
                        {new Date(it.scheduled_at!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} {it.title}
                      </div>
                    ))}
                    {list.length > 3 && <div className="px-1 text-[9.5px] text-gray-400">+{list.length - 3} more</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Day detail */}
        <aside className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5 h-fit">
          <h2 className="text-[15px] font-bold text-[#0D1B39]">{selectedDay ? new Date(selectedDay).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "Select a day"}</h2>
          {!selectedDay ? (
            <p className="mt-3 text-[13px] text-gray-400">Click any date to see its scheduled content.</p>
          ) : dayItems.length === 0 ? (
            <p className="mt-3 text-[13px] text-gray-400">Nothing scheduled this day.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {dayItems.map((it) => (
                <li key={it.id}>
                  <Link href={`/admin/content-hub/library?id=${it.id}`} className="block rounded-xl border border-gray-100 p-3 transition hover:border-blue-200 hover:bg-blue-50/40">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-bold text-[#0A4FE8]">{new Date(it.scheduled_at!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      <StatusBadge status={it.status} />
                    </div>
                    <p className="mt-1 truncate text-[13px] font-bold text-[#0D1B39]">{it.title}</p>
                    <p className="text-[11.5px] text-gray-500">
                      {(it.scheduled_platform ? platformLabel(it.scheduled_platform) : it.platforms.map(platformLabel).join(", ")) || "-"}
                      {it.assigned_publisher_name ? ` · ${it.assigned_publisher_name}` : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </ContentHubShell>
  );
}
