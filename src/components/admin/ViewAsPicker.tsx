"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, Loader2, Search, ShieldCheck, X } from "lucide-react";
import { PERMISSION_GROUPS } from "@/lib/admin-permissions";
import { useViewAs, type ViewAsPerson } from "@/components/admin/view-as";

/** Human labels for permission keys, so the count is readable at a glance. */
function groupSummary(permissions: string[]): string {
  const held = PERMISSION_GROUPS
    .filter((group) => group.permissions.some((permission) => permissions.includes(permission.key)))
    .map((group) => group.label);
  if (!held.length) return "No areas yet";
  return held.slice(0, 3).join(", ") + (held.length > 3 ? ` +${held.length - 3} more` : "");
}

/**
 * Picks the admin whose navigation the super admin wants to see. Opened from
 * the Super Admin badge in the sidebar.
 */
export default function ViewAsPicker({ onClose }: { onClose: () => void }) {
  const { viewingAs, setViewingAs } = useViewAs();
  const [people, setPeople] = useState<ViewAsPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/admin/view-as", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Could not load the admin list.");
        return json;
      })
      .then((json) => { if (active) setPeople(json.people || []); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load the admin list."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return people;
    return people.filter((person) => (
      person.name.toLowerCase().includes(needle)
      || (person.email || "").toLowerCase().includes(needle)
      || (person.roleTitle || "").toLowerCase().includes(needle)
    ));
  }, [people, query]);

  const choose = (person: ViewAsPerson) => {
    setViewingAs(person);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[86vh] w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-[15px] font-bold text-[#0D1B39]">View the dashboard as</h3>
            <p className="mt-0.5 text-[12px] text-slate-500">
              See the navigation and controls another admin has. Your own session is unchanged.
            </p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-slate-100 px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, email or role"
              className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-[#0A4FE8]" />
          </div>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-3">
          {loading ? (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading admins
            </p>
          ) : error ? (
            <p className="py-8 text-center text-sm font-medium text-red-500">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              {people.length ? "No admin matches that search." : "No sub-admins or team admins yet."}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((person) => (
                <li key={person.id}>
                  <button type="button" onClick={() => choose(person)}
                    className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
                      viewingAs?.id === person.id ? "border-[#0A4FE8] bg-blue-50" : "border-slate-200 hover:border-[#0A4FE8] hover:bg-slate-50"
                    }`}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-[13px] font-bold uppercase text-[#0A4FE8]">
                      {person.name.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-bold text-[#0D1B39]">{person.name}</span>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          {person.kind === "team_member" ? "Team member" : "Sub-admin"}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-slate-500">
                        {person.roleTitle || person.email || "No role title"}
                      </span>
                      <span className="mt-1 block truncate text-[11px] font-medium text-[#0A4FE8]">
                        {person.permissions.length} permission{person.permissions.length === 1 ? "" : "s"} · {groupSummary(person.permissions)}
                      </span>
                    </span>
                    <Eye className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {viewingAs && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
            <p className="text-[12px] text-slate-500">Currently viewing as <span className="font-bold text-[#0D1B39]">{viewingAs.name}</span></p>
            <button type="button" onClick={() => { setViewingAs(null); onClose(); }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0A4FE8] px-3 py-2 text-[12px] font-bold text-white">
              <ShieldCheck className="h-3.5 w-3.5" /> Back to super admin
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
