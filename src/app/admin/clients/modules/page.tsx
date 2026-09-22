"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Eye,
  EyeOff,
  LayoutGrid,
  Loader2,
  Lock,
  Save,
  Search,
  ToggleLeft,
  ToggleRight,
  Trash2,
  UserPlus,
} from "lucide-react";
import { appAlert, appConfirm } from "@/lib/app-notify";
import {
  CLIENT_MODULES,
  resolveClientModuleVisibility,
  type ClientModuleKey,
} from "@/lib/client-modules";

type ModuleFlags = Partial<Record<ClientModuleKey, boolean>>;

interface ClientOverrideRow {
  id: string;
  publicUserId: string;
  name: string;
  company: string;
  email: string;
  overrides: ModuleFlags;
}

interface ClientSearchResult {
  id: string;
  publicUserId: string;
  name: string;
  company: string;
  email: string;
}

const CONFIGURABLE_MODULES = CLIENT_MODULES.filter((module) => !module.core);

const MODULE_GROUPS = CLIENT_MODULES.reduce<{ name: string; modules: typeof CLIENT_MODULES }[]>((groups, module) => {
  const existing = groups.find((group) => group.name === module.group);
  if (existing) existing.modules.push(module);
  else groups.push({ name: module.group, modules: [module] });
  return groups;
}, []);

function VisibilityToggle({ enabled, onChange, disabled }: { enabled: boolean; onChange: (enabled: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      aria-pressed={enabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-[11px] font-semibold transition ${disabled ? "cursor-not-allowed bg-slate-100 text-slate-400" : enabled ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
    >
      {enabled ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
      {enabled ? "Visible" : "Hidden"}
    </button>
  );
}

export default function ClientDashboardModulesPage() {
  const [defaults, setDefaults] = useState<ModuleFlags>({});
  const [clients, setClients] = useState<ClientOverrideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [savingClient, setSavingClient] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ClientSearchResult[]>([]);

  const load = async () => {
    try {
      const response = await fetch("/api/admin/client-modules", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load dashboard modules.");
      setDefaults(payload.defaults || {});
      setClients(payload.clients || []);
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Could not load dashboard modules.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const hiddenCount = useMemo(
    () => CONFIGURABLE_MODULES.filter((module) => defaults[module.key] === false).length,
    [defaults],
  );

  const saveDefaults = async () => {
    setSavingDefaults(true);
    try {
      const body = CONFIGURABLE_MODULES.reduce<ModuleFlags>((map, module) => {
        map[module.key] = defaults[module.key] !== false;
        return map;
      }, {});
      const response = await fetch("/api/admin/client-modules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaults: body }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save dashboard modules.");
      await appAlert("Client dashboard modules saved. Clients see the change on their next page load.");
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Could not save dashboard modules.");
    } finally {
      setSavingDefaults(false);
    }
  };

  const runSearch = async () => {
    const term = search.trim();
    if (term.length < 2) {
      await appAlert("Type at least two characters to find a client.");
      return;
    }
    setSearching(true);
    try {
      const response = await fetch(`/api/admin/client-modules?search=${encodeURIComponent(term)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not search clients.");
      setResults(payload.results || []);
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Could not search clients.");
    } finally {
      setSearching(false);
    }
  };

  const addClient = (client: ClientSearchResult) => {
    setResults([]);
    setSearch("");
    setClients((current) => current.some((row) => row.id === client.id)
      ? current
      : [...current, { ...client, overrides: {} }].sort((a, b) => a.name.localeCompare(b.name)));
  };

  /** null clears the override so the client follows the platform default again. */
  const setOverride = async (client: ClientOverrideRow, moduleKey: ClientModuleKey, value: boolean | null) => {
    setSavingClient(client.id);
    try {
      const response = await fetch("/api/admin/client-modules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: client.id, modules: { [moduleKey]: value } }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save the client override.");
      setClients((current) => current.map((row) => {
        if (row.id !== client.id) return row;
        const overrides = { ...row.overrides };
        if (value === null) delete overrides[moduleKey];
        else overrides[moduleKey] = value;
        return { ...row, overrides };
      }));
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Could not save the client override.");
    } finally {
      setSavingClient(null);
    }
  };

  const clearClient = async (client: ClientOverrideRow) => {
    const confirmed = await appConfirm(`Clear every override for ${client.name}? Their dashboard follows the platform defaults again.`);
    if (!confirmed) return;
    setSavingClient(client.id);
    try {
      const response = await fetch(`/api/admin/client-modules?userId=${encodeURIComponent(client.id)}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not clear the overrides.");
      setClients((current) => current.filter((row) => row.id !== client.id));
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Could not clear the overrides.");
    } finally {
      setSavingClient(null);
    }
  };

  if (loading) {
    return <div className="grid min-h-[70vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[#0A4FE8]" /></div>;
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="rounded-[24px] border border-blue-100 bg-white p-6 shadow-[0_18px_50px_rgba(15,40,90,0.08)] lg:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[#0A4FE8]"><LayoutGrid className="h-6 w-6" /></span>
            <div>
              <p className="text-[12px] font-semibold text-[#0A4FE8]">Client dashboard</p>
              <h1 className="mt-1 text-[28px] font-bold tracking-tight text-[#0D1B39] lg:text-[36px]">Dashboard modules</h1>
              <p className="mt-2 max-w-3xl text-[13px] leading-6 text-slate-500">
                Choose which sections of the client dashboard are live. A hidden module disappears from the client sidebar and overview, and its pages send the client back to their dashboard.
              </p>
            </div>
          </div>
          <button
            onClick={saveDefaults}
            disabled={savingDefaults}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#0A4FE8] px-6 text-[13px] font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-[#083FC0] disabled:opacity-60"
          >
            {savingDefaults ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save defaults
          </button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { icon: Eye, label: "Visible modules", value: CONFIGURABLE_MODULES.length - hiddenCount, note: "Shown to every client by default" },
          { icon: EyeOff, label: "Hidden modules", value: hiddenCount, note: "Switched off platform-wide" },
          { icon: UserPlus, label: "Clients with overrides", value: clients.length, note: "Following their own module set" },
        ].map((item) => (
          <div key={item.label} className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-50 text-[#0A4FE8]"><item.icon className="h-5 w-5" /></span>
            <p className="mt-4 text-[25px] font-bold text-[#0D1B39]">{item.value}</p>
            <p className="text-[12px] font-semibold text-[#0D1B39]">{item.label}</p>
            <p className="mt-1 text-[10px] text-slate-400">{item.note}</p>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5 lg:p-6">
          <h2 className="text-[16px] font-bold text-[#0D1B39]">Platform defaults</h2>
          <p className="mt-1 max-w-3xl text-[12px] leading-5 text-slate-500">
            The dashboard every client gets. Grouped exactly as the client sees it in their sidebar.
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          {MODULE_GROUPS.map((group) => (
            <div key={group.name} className="p-5 lg:p-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">{group.name}</p>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {group.modules.map((module) => {
                  const enabled = module.core || defaults[module.key] !== false;
                  return (
                    <div key={module.key} className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 p-4">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-[13px] font-semibold text-[#0D1B39]">
                          {module.label}
                          {module.core && <Lock className="h-3.5 w-3.5 text-slate-400" aria-label="Always available" />}
                        </p>
                        <p className="mt-1 text-[11px] leading-5 text-slate-500">{module.description}</p>
                        <p className="mt-1 font-mono text-[10px] text-slate-400">{module.route}</p>
                      </div>
                      <VisibilityToggle
                        enabled={enabled}
                        disabled={module.core}
                        onChange={(next) => setDefaults((current) => ({ ...current, [module.key]: next }))}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5 lg:p-6">
          <h2 className="text-[16px] font-bold text-[#0D1B39]">Per-client overrides</h2>
          <p className="mt-1 max-w-3xl text-[12px] leading-5 text-slate-500">
            Give one client a different dashboard. An override wins over the platform default; clearing it puts the client back on the default.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") void runSearch(); }}
                placeholder="Find a client by name, company, or email"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white ps-9 pe-3 text-[12px] text-[#0D1B39] outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                aria-label="Find a client"
              />
            </div>
            <button
              onClick={runSearch}
              disabled={searching}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 px-5 text-[12px] font-semibold text-[#0A4FE8] transition hover:bg-blue-50 disabled:opacity-60"
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Search
            </button>
          </div>
          {results.length > 0 && (
            <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
              {results.map((result) => (
                <li key={result.id}>
                  <button
                    type="button"
                    onClick={() => addClient(result)}
                    className="flex w-full items-center justify-between gap-3 p-3 text-start transition hover:bg-blue-50/60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-semibold text-[#0D1B39]">{result.name}</span>
                      <span className="block truncate text-[11px] text-slate-500">{result.company || result.email}</span>
                    </span>
                    <UserPlus className="h-4 w-4 shrink-0 text-[#0A4FE8]" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="divide-y divide-slate-100">
          {clients.length === 0 && (
            <div className="p-8 text-center text-[12px] text-slate-400">
              No client overrides. Every client follows the platform defaults above.
            </div>
          )}
          {clients.map((client) => {
            const visibility = resolveClientModuleVisibility(defaults, client.overrides);
            const busy = savingClient === client.id;
            return (
              <article key={client.id} className="space-y-4 p-5 lg:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-bold text-[#0D1B39]">{client.name}</p>
                    <p className="text-[11px] text-slate-500">{client.company || client.email}{client.publicUserId ? ` - ${client.publicUserId}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {busy && <Loader2 className="h-4 w-4 animate-spin text-[#0A4FE8]" />}
                    <button
                      type="button"
                      onClick={() => clearClient(client)}
                      disabled={busy}
                      className="inline-flex h-9 items-center gap-2 rounded-xl border border-red-100 px-3 text-[11px] font-semibold text-red-500 transition hover:bg-red-50 disabled:opacity-60"
                    >
                      <Trash2 className="h-4 w-4" />Clear overrides
                    </button>
                  </div>
                </div>
                <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
                  {CONFIGURABLE_MODULES.map((module) => {
                    const override = client.overrides[module.key];
                    const isOverridden = typeof override === "boolean";
                    return (
                      <div key={module.key} className={`flex items-center justify-between gap-3 rounded-2xl border p-3 ${isOverridden ? "border-blue-200 bg-blue-50/40" : "border-slate-200"}`}>
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-semibold text-[#0D1B39]">{module.label}</p>
                          <p className="text-[10px] text-slate-400">
                            {isOverridden ? "Override" : `Default - ${defaults[module.key] === false ? "hidden" : "visible"}`}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <VisibilityToggle
                            enabled={visibility[module.key]}
                            disabled={busy}
                            onChange={(next) => void setOverride(client, module.key, next)}
                          />
                          {isOverridden && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void setOverride(client, module.key, null)}
                              className="rounded-xl px-2 py-2 text-[10px] font-semibold text-slate-400 transition hover:text-[#0A4FE8] disabled:opacity-60"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
