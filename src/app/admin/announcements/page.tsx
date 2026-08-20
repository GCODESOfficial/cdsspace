"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BellRing,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  Loader2,
  Mail,
  MessageSquare,
  Megaphone,
  Image as ImageIcon,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { appAlert } from "@/lib/app-notify";
import ActivityPanel from "@/components/admin/ActivityPanel";

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
  const [channels, setChannels] = useState({ inApp: true, email: false });
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [selectedTeam, setSelectedTeam] = useState<Set<string>>(new Set());
  const [selectedDepartments, setSelectedDepartments] = useState<Set<string>>(new Set());
  const [projectId, setProjectId] = useState("");
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [visual, setVisual] = useState<File | null>(null);
  const [visualPreview, setVisualPreview] = useState<string | null>(null);
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

  // Member count per department, so the department list reads like the team list.
  const departmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const member of teamMembers) {
      const dept = member.department?.trim();
      if (!dept) continue;
      counts.set(dept, (counts.get(dept) || 0) + 1);
    }
    return counts;
  }, [teamMembers]);

  const departmentRecipientCount = useMemo(() => {
    if (selectedDepartments.size === 0) return 0;
    const lowered = new Set(Array.from(selectedDepartments).map((d) => d.toLowerCase()));
    return teamMembers.filter((m) => m.department && lowered.has(m.department.toLowerCase())).length;
  }, [selectedDepartments, teamMembers]);

  const selectedCount =
    audience === "clients"
      ? clientMode === "all" ? clients.length : selectedClients.size
      : audience === "team"
        ? teamMode === "all"
          ? teamMembers.length
          : teamMode === "department"
            ? departmentRecipientCount
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
    if (audience === "clients" && !channels.inApp && !channels.email) {
      await appAlert({
        title: "Pick a channel",
        message: "Choose in-app chat, email, or both for client announcements.",
        kind: "error",
      });
      return;
    }
    setSubmitting(true);
    setLastSent(null);
    try {
      let imageUrl: string | null = null;
      if (visual) {
        const uploadForm = new FormData();
        uploadForm.append("file", visual);
        const uploadResponse = await fetch("/api/admin/announcements/upload", {
          method: "POST",
          credentials: "include",
          body: uploadForm,
        });
        const uploadPayload = await uploadResponse.json();
        if (!uploadResponse.ok || !uploadPayload.ok) {
          throw new Error(uploadPayload.error || "Could not upload announcement visual.");
        }
        imageUrl = uploadPayload.url;
      }
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          audience,
          clientMode,
          teamMode,
          channels,
          clientIds: Array.from(selectedClients),
          teamMemberIds: Array.from(selectedTeam),
          departments: Array.from(selectedDepartments),
          projectId,
          title,
          message,
          link,
          imageUrl,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not send announcement.");
      setLastSent({ count: json.recipient_count || 0, target: json.target_label || "recipients" });
      setTitle("");
      setMessage("");
      setLink("");
      setVisual(null);
      if (visualPreview) URL.revokeObjectURL(visualPreview);
      setVisualPreview(null);
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
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <header className="flex flex-col gap-5 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[12px] font-bold uppercase tracking-[0.14em] text-[#0A4FE8] ring-1 ring-blue-100">
            <Megaphone className="h-3.5 w-3.5" />
            Announcement Center
          </div>
          <h1 className="mt-3 text-[28px] font-bold tracking-tight text-[#0D1B39] sm:text-[32px]">
            Push Notifications
          </h1>
          <p className="mt-1 max-w-2xl text-[14px] leading-6 text-gray-500">
            Send one announcement to clients, all team members, selected departments, or everyone assigned to a project.
            Every announcement also lands in the recipient&apos;s Messages as a note from CDS&nbsp;Space.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:min-w-[380px]">
          <StatTile icon={BellRing} color="blue" label="Clients" value={clients.length} />
          <StatTile icon={Users} color="purple" label="Team" value={teamMembers.length} />
          <StatTile icon={BriefcaseBusiness} color="emerald" label="Projects" value={projects.length} />
        </div>
      </header>

      <form onSubmit={sendAnnouncement} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
        {/* Compose */}
        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
          <SectionLabel>Audience</SectionLabel>
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

          <div className="mt-7 grid gap-5">
            <Field label="Title">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Example: Office closure notice"
                className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-[14px] font-medium text-[#0D1B39] outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
                required
              />
            </Field>
            <Field label="Message">
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Write the announcement people should see..."
                rows={6}
                className="min-h-[160px] w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[14px] font-medium leading-6 text-[#0D1B39] outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
                required
              />
            </Field>
            <Field label="Optional link">
              <input
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder={audience === "clients" ? "/dashboard/orders" : "/team/chat"}
                className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-[14px] font-medium text-[#0D1B39] outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </Field>
            {audience === "clients" && (
              <Field label="Optional visual for chat and email">
                {visualPreview ? (
                  <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={visualPreview} alt="Announcement visual preview" className="max-h-80 w-full object-contain" />
                    <button
                      type="button"
                      onClick={() => {
                        URL.revokeObjectURL(visualPreview);
                        setVisual(null);
                        setVisualPreview(null);
                      }}
                      className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-xl bg-white text-red-600 shadow-md"
                      aria-label="Remove visual"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-blue-200 bg-blue-50/50 p-5 text-center transition hover:bg-blue-50">
                    <ImageIcon className="h-6 w-6 text-[#0A4FE8]" />
                    <span className="mt-2 text-[13px] font-bold text-[#0D1B39]">Upload message visual</span>
                    <span className="mt-1 text-[11px] text-gray-500">PNG, JPG, WEBP or GIF · up to 10MB</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        if (!file) return;
                        if (file.size > 10 * 1024 * 1024) {
                          void appAlert({ title: "Visual too large", message: "Choose an image no larger than 10MB.", kind: "error" });
                          event.target.value = "";
                          return;
                        }
                        setVisual(file);
                        setVisualPreview(URL.createObjectURL(file));
                      }}
                    />
                  </label>
                )}
              </Field>
            )}
          </div>
        </section>

        {/* Recipients */}
        <aside className="flex flex-col rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-bold text-[#0D1B39]">Recipients</h2>
              <p className="text-[12px] text-gray-500">{String(selectedCount)} selected</p>
            </div>
            {lastSent && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-100">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Sent
              </span>
            )}
          </div>

          {loading ? (
            <div className="mt-6 flex h-48 items-center justify-center rounded-2xl bg-gray-50">
              <Loader2 className="h-5 w-5 animate-spin text-[#0A4FE8]" />
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {audience === "clients" && (
                <>
                  <div>
                    <SectionLabel>Channels</SectionLabel>
                    <div className="grid grid-cols-2 gap-2">
                      <ChannelToggle
                        icon={MessageSquare}
                        label="In-app chat"
                        hint="Dashboard + Messages"
                        active={channels.inApp}
                        onClick={() => setChannels((c) => ({ ...c, inApp: !c.inApp }))}
                      />
                      <ChannelToggle
                        icon={Mail}
                        label="Email"
                        hint="Send to inbox"
                        active={channels.email}
                        onClick={() => setChannels((c) => ({ ...c, email: !c.email }))}
                      />
                    </div>
                  </div>
                  <div>
                    <SectionLabel>Who</SectionLabel>
                    <Segmented
                      value={clientMode}
                      options={[
                        { label: "All clients", value: "all" },
                        { label: "Pick clients", value: "selected" },
                      ]}
                      onChange={(value) => setClientMode(value as ClientMode)}
                    />
                  </div>
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
                    <>
                      <div className="flex items-center justify-between px-1">
                        <p className="text-[11px] font-semibold text-gray-500">
                          Select one or more departments
                        </p>
                        {selectedDepartments.size > 0 && (
                          <button
                            type="button"
                            onClick={() => setSelectedDepartments(new Set())}
                            className="text-[11px] font-semibold text-[#0A4FE8] hover:underline"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      {departments.length === 0 ? (
                        <p className="rounded-xl border border-gray-100 px-4 py-8 text-center text-[13px] text-gray-400">
                          No departments found.
                        </p>
                      ) : (
                        <div className="max-h-[320px] overflow-y-auto rounded-xl border border-gray-100">
                          {departments.map((dept) => {
                            const selected = selectedDepartments.has(dept);
                            const count = departmentCounts.get(dept) || 0;
                            return (
                              <button
                                key={dept}
                                type="button"
                                onClick={() => toggleSelection(setSelectedDepartments, selectedDepartments, dept)}
                                className={`flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left transition last:border-b-0 ${
                                  selected ? "bg-blue-50" : "bg-white hover:bg-gray-50"
                                }`}
                              >
                                <CheckBox selected={selected} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[13px] font-bold text-[#0D1B39]">{dept}</span>
                                  <span className="block truncate text-[11px] text-gray-500">
                                    {count} member{count === 1 ? "" : "s"}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </>
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
                  className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-[14px] font-semibold text-[#0D1B39] outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
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
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-[14px] font-bold text-white shadow-sm transition hover:bg-[#083EC0] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send announcement
              </button>
              {lastSent && (
                <p className="text-center text-[11.5px] text-gray-400">
                  Last sent to {lastSent.count} · {lastSent.target}
                </p>
              )}
            </div>
          )}
        </aside>
      </form>

      {/* Activity log - every send is recorded with the sub-admin's name + time. */}
      <ActivityPanel page="announcements" title="Announcement activity" limit={40} />
    </div>
  );
}

const STAT_COLORS: Record<string, { bg: string; iconBg: string; icon: string }> = {
  blue: { bg: "bg-blue-50", iconBg: "bg-blue-100", icon: "text-[#0A4FE8]" },
  purple: { bg: "bg-purple-50", iconBg: "bg-purple-100", icon: "text-[#7C3AED]" },
  emerald: { bg: "bg-emerald-50", iconBg: "bg-emerald-100", icon: "text-[#059669]" },
};

function StatTile({
  icon: Icon,
  color,
  label,
  value,
}: {
  icon: LucideIcon;
  color: keyof typeof STAT_COLORS;
  label: string;
  value: number;
}) {
  const c = STAT_COLORS[color];
  return (
    <div className={`${c.bg} rounded-2xl p-3.5 transition`}>
      <div className={`${c.iconBg} mb-2 flex h-8 w-8 items-center justify-center rounded-lg`}>
        <Icon className={`h-4 w-4 ${c.icon}`} />
      </div>
      <p className="text-[20px] font-bold leading-none text-[#0D1B39]">{value}</p>
      <p className="mt-1 text-[11px] font-semibold text-gray-500">{label}</p>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">{children}</p>
  );
}

function ChannelToggle({
  icon: Icon,
  label,
  hint,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition ${
        active
          ? "border-[#0A4FE8] bg-blue-50 ring-2 ring-blue-100"
          : "border-gray-200 bg-white hover:border-blue-200 hover:bg-blue-50/40"
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          active ? "bg-[#0A4FE8] text-white" : "bg-gray-100 text-gray-400"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-bold text-[#0D1B39]">{label}</span>
        <span className="block text-[11px] text-gray-500">{hint}</span>
      </span>
    </button>
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
      className={`rounded-2xl border p-4 text-left transition ${
        active
          ? "border-[#0A4FE8] bg-blue-50 text-[#0D1B39] ring-2 ring-blue-100"
          : "border-gray-200 bg-white text-gray-500 hover:border-blue-200 hover:bg-blue-50/40"
      }`}
    >
      <Icon className={`h-5 w-5 ${active ? "text-[#0A4FE8]" : "text-gray-400"}`} />
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
    <div className="grid gap-1 rounded-xl bg-gray-100 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`h-10 rounded-lg text-[12px] font-bold transition ${
            value === option.value ? "bg-white text-[#0A4FE8] shadow-sm" : "text-gray-500 hover:text-[#0D1B39]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function CheckBox({ selected }: { selected: boolean }) {
  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
        selected ? "border-[#0A4FE8] bg-[#0A4FE8]" : "border-gray-300 bg-white"
      }`}
    >
      {selected && <Check className="h-3.5 w-3.5 text-white" />}
    </span>
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
        className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-[13px] font-medium text-[#0D1B39] outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
      />
      <div className="max-h-[320px] overflow-y-auto rounded-xl border border-gray-100">
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-gray-400">No recipients found.</p>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item.id)}
              className={`flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left transition last:border-b-0 ${
                item.selected ? "bg-blue-50" : "bg-white hover:bg-gray-50"
              }`}
            >
              <CheckBox selected={item.selected} />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-bold text-[#0D1B39]">{item.label}</span>
                <span className="block truncate text-[11px] text-gray-500">{item.subtitle}</span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
