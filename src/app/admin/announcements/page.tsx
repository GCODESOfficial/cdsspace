"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BellRing,
  BriefcaseBusiness,
  CheckCircle2,
  Loader2,
  Megaphone,
  Send,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { appAlert } from "@/lib/app-notify";

type Audience = "clients" | "team" | "project";
type ClientMode = "all" | "selected";
type TeamMode = "all" | "selected" | "department";

interface ClientRecipient {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface TeamRecipient {
  id: string;
  full_name: string;
  username: string;
  department: string | null;
  role_title: string | null;
  avatar_url: string | null;
}

interface ProjectRecipient {
  id: string;
  name: string;
  client: string | null;
}

export default function AdminAnnouncementsPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [clients, setClients] = useState<ClientRecipient[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamRecipient[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [projects, setProjects] = useState<ProjectRecipient[]>([]);

  const [audience, setAudience] = useState<Audience>("team");
  const [clientMode, setClientMode] = useState<ClientMode>("all");
  const [teamMode, setTeamMode] = useState<TeamMode>("all");
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [selectedTeam, setSelectedTeam] = useState<Set<string>>(new Set());
  const [department, setDepartment] = useState("");
  const [projectId, setProjectId] = useState("");
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [lastSent, setLastSent] = useState<{ count: number; target: string } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const initialAudience = params.get("audience");
    const initialProjectId = params.get("projectId");
    if (initialAudience === "clients" || initialAudience === "team" || initialAudience === "project") {
      setAudience(initialAudience);
    }
    if (initialProjectId) setProjectId(initialProjectId);
  }, []);

  useEffect(() => {
    fetch("/api/admin/announcements", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || "Could not load announcement data.");
        setClients(json.clients || []);
        setTeamMembers(json.teamMembers || []);
        setDepartments(json.departments || []);
        setProjects(json.projects || []);
      })
      .catch((error) => {
        void appAlert({
          title: "Announcement Center",
          message: error instanceof Error ? error.message : "Could not load announcement data.",
          kind: "error",
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredClients = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return clients;
    return clients.filter((client) =>
      [client.full_name, client.email].some((value) => (value || "").toLowerCase().includes(needle)),
    );
  }, [clients, query]);

  const filteredTeam = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return teamMembers;
    return teamMembers.filter((member) =>
      [member.full_name, member.username, member.department, member.role_title].some((value) =>
        (value || "").toLowerCase().includes(needle),
      ),
    );
  }, [query, teamMembers]);

  const selectedCount =
    audience === "clients"
      ? clientMode === "all" ? clients.length : selectedClients.size
      : audience === "team"
        ? teamMode === "all"
          ? teamMembers.length
          : teamMode === "department"
            ? teamMembers.filter((member) => member.department?.toLowerCase() === department.toLowerCase()).length
            : selectedTeam.size
        : projectId
          ? "project team"
          : 0;

  function toggleSelection(setter: (value: Set<string>) => void, source: Set<string>, id: string) {
    const next = new Set(source);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  async function sendAnnouncement(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setLastSent(null);
    try {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          audience,
          clientMode,
          teamMode,
          clientIds: Array.from(selectedClients),
          teamMemberIds: Array.from(selectedTeam),
          department,
          projectId,
          title,
          message,
          link,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not send announcement.");
      setLastSent({ count: json.recipient_count || 0, target: json.target_label || "recipients" });
      setTitle("");
      setMessage("");
      setLink("");
      await appAlert({
        title: "Announcement sent",
        message: `Delivered to ${json.recipient_count} recipient${json.recipient_count === 1 ? "" : "s"}.`,
        kind: "success",
      });
    } catch (error) {
      await appAlert({
        title: "Announcement failed",
        message: error instanceof Error ? error.message : "Could not send announcement.",
        kind: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 p-4 sm:gap-6 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 rounded-[28px] border border-white/70 bg-white p-5 shadow-sm sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[12px] font-bold uppercase tracking-[0.14em] text-[#0A4FE8] ring-1 ring-blue-100">
            <Megaphone className="h-3.5 w-3.5" />
            Announcement Center
          </div>
          <h1 className="mt-3 text-[28px] font-bold tracking-tight text-[#0D1B39] sm:text-[34px]">
            Push Notifications
          </h1>
          <p className="mt-1 max-w-2xl text-[14px] leading-6 text-slate-500">
            Send one announcement to clients, all team members, selected departments, or everyone assigned to a project.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[#F0F5FF] p-2 text-center sm:min-w-[360px]">
          <Metric label="Clients" value={clients.length} />
          <Metric label="Team" value={teamMembers.length} />
          <Metric label="Projects" value={projects.length} />
        </div>
      </header>

      <form onSubmit={sendAnnouncement} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-[28px] border border-white/70 bg-white p-4 shadow-sm sm:p-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <AudienceButton
              active={audience === "clients"}
              icon={BellRing}
              label="Clients"
              description="Client dashboard notifications"
              onClick={() => setAudience("clients")}
            />
            <AudienceButton
              active={audience === "team"}
              icon={Users}
              label="Team Members"
              description="Team portal notifications"
              onClick={() => setAudience("team")}
            />
            <AudienceButton
              active={audience === "project"}
              icon={BriefcaseBusiness}
              label="Project Team"
              description="Assigned project members"
              onClick={() => setAudience("project")}
            />
          </div>

          <div className="mt-6 grid gap-4">
            <Field label="Title">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Example: Office closure notice"
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-[14px] font-medium text-[#0D1B39] outline-none transition focus:border-[#0A4FE8]/40 focus:bg-white focus:ring-4 focus:ring-blue-100"
                required
              />
            </Field>
            <Field label="Message">
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Write the announcement people should see..."
                rows={6}
                className="min-h-[160px] w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[14px] font-medium leading-6 text-[#0D1B39] outline-none transition focus:border-[#0A4FE8]/40 focus:bg-white focus:ring-4 focus:ring-blue-100"
                required
              />
            </Field>
            <Field label="Optional link">
              <input
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder={audience === "clients" ? "/dashboard/orders" : "/team/chat"}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-[14px] font-medium text-[#0D1B39] outline-none transition focus:border-[#0A4FE8]/40 focus:bg-white focus:ring-4 focus:ring-blue-100"
              />
            </Field>
          </div>
        </section>

        <aside className="rounded-[28px] border border-white/70 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-bold text-[#0D1B39]">Recipients</h2>
              <p className="text-[12px] text-slate-500">{String(selectedCount)} selected</p>
            </div>
            {lastSent && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Sent
              </span>
            )}
          </div>

          {loading ? (
            <div className="mt-6 flex h-48 items-center justify-center rounded-3xl bg-slate-50">
              <Loader2 className="h-5 w-5 animate-spin text-[#0A4FE8]" />
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {audience === "clients" && (
                <>
                  <Segmented
                    value={clientMode}
                    options={[
                      { label: "All clients", value: "all" },
                      { label: "Pick clients", value: "selected" },
                    ]}
                    onChange={(value) => setClientMode(value as ClientMode)}
                  />
                  {clientMode === "selected" && (
                    <Picker
                      query={query}
                      onQuery={setQuery}
                      placeholder="Search clients..."
                      items={filteredClients.map((client) => ({
                        id: client.id,
                        label: client.full_name || client.email || "Client",
                        subtitle: client.email || "No email",
                        selected: selectedClients.has(client.id),
                      }))}
                      onToggle={(id) => toggleSelection(setSelectedClients, selectedClients, id)}
                    />
                  )}
                </>
              )}

              {audience === "team" && (
                <>
                  <Segmented
                    value={teamMode}
                    options={[
                      { label: "All", value: "all" },
                      { label: "Pick", value: "selected" },
                      { label: "Dept.", value: "department" },
                    ]}
                    onChange={(value) => setTeamMode(value as TeamMode)}
                  />
                  {teamMode === "department" && (
                    <select
                      value={department}
                      onChange={(event) => setDepartment(event.target.value)}
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-[14px] font-semibold text-[#0D1B39] outline-none focus:border-[#0A4FE8]/40 focus:ring-4 focus:ring-blue-100"
                    >
                      <option value="">Choose department</option>
                      {departments.map((dept) => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  )}
                  {teamMode === "selected" && (
                    <Picker
                      query={query}
                      onQuery={setQuery}
                      placeholder="Search team..."
                      items={filteredTeam.map((member) => ({
                        id: member.id,
                        label: member.full_name,
                        subtitle: [member.role_title, member.department].filter(Boolean).join(" · ") || `@${member.username}`,
                        selected: selectedTeam.has(member.id),
                      }))}
                      onToggle={(id) => toggleSelection(setSelectedTeam, selectedTeam, id)}
                    />
                  )}
                </>
              )}

              {audience === "project" && (
                <select
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-[14px] font-semibold text-[#0D1B39] outline-none focus:border-[#0A4FE8]/40 focus:ring-4 focus:ring-blue-100"
                >
                  <option value="">Choose project team</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}{project.client ? ` · ${project.client}` : ""}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="submit"
                disabled={submitting || loading}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#0A4FE8] px-5 text-[14px] font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-[#083EC0] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send announcement
              </button>
            </div>
          )}
        </aside>
      </form>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white px-3 py-3">
      <p className="text-[18px] font-bold text-[#0D1B39]">{value}</p>
      <p className="text-[11px] font-semibold text-slate-500">{label}</p>
    </div>
  );
}

function AudienceButton({
  active,
  icon: Icon,
  label,
  description,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-3xl border p-4 text-left transition ${
        active
          ? "border-[#0A4FE8] bg-blue-50 text-[#0D1B39] ring-4 ring-blue-100"
          : "border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:bg-blue-50/40"
      }`}
    >
      <Icon className={`h-5 w-5 ${active ? "text-[#0A4FE8]" : "text-slate-400"}`} />
      <p className="mt-3 text-[14px] font-bold">{label}</p>
      <p className="mt-1 text-[12px] leading-5">{description}</p>
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13px] font-bold text-[#0D1B39]">{label}</span>
      {children}
    </label>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1 rounded-2xl bg-slate-100 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`h-10 rounded-xl text-[12px] font-bold transition ${
            value === option.value ? "bg-white text-[#0A4FE8] shadow-sm" : "text-slate-500 hover:text-[#0D1B39]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Picker({
  query,
  onQuery,
  placeholder,
  items,
  onToggle,
}: {
  query: string;
  onQuery: (value: string) => void;
  placeholder: string;
  items: Array<{ id: string; label: string; subtitle: string; selected: boolean }>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <input
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-[13px] font-medium text-[#0D1B39] outline-none focus:border-[#0A4FE8]/40 focus:ring-4 focus:ring-blue-100"
      />
      <div className="max-h-[320px] overflow-y-auto rounded-2xl border border-slate-100">
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-slate-400">No recipients found.</p>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item.id)}
              className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 ${
                item.selected ? "bg-blue-50" : "bg-white hover:bg-slate-50"
              }`}
            >
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                item.selected ? "border-[#0A4FE8] bg-[#0A4FE8]" : "border-slate-300 bg-white"
              }`}>
                {item.selected && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-bold text-[#0D1B39]">{item.label}</span>
                <span className="block truncate text-[11px] text-slate-500">{item.subtitle}</span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
