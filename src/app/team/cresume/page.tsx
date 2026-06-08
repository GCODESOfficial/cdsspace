"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { UserRound, Save, Link2, Eye, Loader2, Plus, X as XIcon, Check, Brain } from "lucide-react";
import { SKILL_TABS } from "@/lib/cresume-skills";

interface Role { company: string; title: string; start: string; end: string; description: string }
interface Project { name: string; client: string; role: string; year: string; link: string; description: string }
interface Education { school: string; degree: string; start: string; end: string }

interface Resume {
  team_member_id: string;
  headline: string;
  about: string;
  avatar_url: string | null;
  location: string;
  website: string;
  email_public: string;
  socials: { x?: string; github?: string; linkedin?: string; telegram?: string };
  skills: string[];
  past_roles: Role[];
  projects: Project[];
  education: Education[];
  is_public: boolean;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function CResumeEditor() {
  const [resume, setResume] = useState<Resume | null>(null);
  const [username, setUsername] = useState<string>("");
  const [memberName, setMemberName] = useState<string>("");
  const [memberRole, setMemberRole] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState<"headline" | "about" | "skills" | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [headlineOptions, setHeadlineOptions] = useState<string[]>([]);
  const [aboutSuggestion, setAboutSuggestion] = useState<string>("");
  const [skillSuggestions, setSkillSuggestions] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const [a, b] = await Promise.all([
        fetch("/api/team/resume").then((r) => r.json()),
        fetch("/api/team/session").then((r) => r.ok ? r.json() : null).catch(() => null),
      ]);
      if (a.ok) setResume({
        team_member_id: a.resume.team_member_id,
        headline: a.resume.headline || "",
        about: a.resume.about || "",
        avatar_url: a.resume.avatar_url,
        location: a.resume.location || "",
        website: a.resume.website || "",
        email_public: a.resume.email_public || "",
        socials: a.resume.socials || {},
        skills: a.resume.skills || [],
        past_roles: a.resume.past_roles || [],
        projects: a.resume.projects || [],
        education: a.resume.education || [],
        is_public: !!a.resume.is_public,
      });
      if (b?.member?.username) setUsername(b.member.username);
      if (b?.member?.full_name) setMemberName(b.member.full_name);
      if (b?.member?.role_title) setMemberRole(b.member.role_title);
    })();
  }, []);

  async function save() {
    if (!resume) return;
    setSaving(true);
    const r = await fetch("/api/team/resume", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(resume),
    });
    const j = await r.json();
    setSaving(false);
    if (j.ok) {
      setSavedAt(new Date().toISOString());
      // Refresh the sidebar & main layout session info
      window.dispatchEvent(new CustomEvent("refresh-team-session"));
    }
  }

  function set<K extends keyof Resume>(key: K, val: Resume[K]) { if (resume) setResume({ ...resume, [key]: val }); }
  function setSocial(key: keyof Resume["socials"], val: string) {
    if (!resume) return;
    setResume({ ...resume, socials: { ...resume.socials, [key]: val } });
  }

  function buildRoleNotes() {
    if (!resume) return "";
    const roles = (resume.past_roles || [])
      .slice(0, 3)
      .map((role) => `${role.title || "Role"} at ${role.company || "Unknown company"}: ${role.description || "No description"}`);
    const projects = (resume.projects || [])
      .slice(0, 3)
      .map((project) => `${project.name || "Project"} for ${project.client || "Unknown client"}: ${project.description || "No description"}`);
    return [...roles, ...projects].join("\n");
  }

  async function runAi(kind: "headline" | "about" | "skills") {
    if (!resume) return;
    setAiBusy(kind);
    setAiError(null);
    try {
      const payload =
        kind === "headline"
          ? {
              kind: "resume_headline",
              input: {
                full_name: memberName,
                role_title: resume.headline || memberRole,
                skills: resume.skills,
                about: resume.about,
              },
            }
          : kind === "about"
            ? {
                kind: "resume_about",
                input: {
                  full_name: memberName,
                  role_title: resume.headline || memberRole,
                  skills: resume.skills,
                  notes: buildRoleNotes(),
                },
              }
            : {
                kind: "resume_skills_from_experience",
                input: {
                  past_roles: resume.past_roles,
                  projects: resume.projects,
                },
              };

      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "AI fill failed");

      if (kind === "headline") {
        const options = Array.isArray(json.data?.options) ? json.data.options.filter(Boolean) : [];
        setHeadlineOptions(options);
      } else if (kind === "about") {
        setAboutSuggestion(String(json.text || "").trim());
      } else {
        const nextSkills = Array.isArray(json.data?.skills) ? json.data.skills.filter(Boolean) : [];
        setSkillSuggestions(nextSkills);
      }
    } catch (err) {
      setAiError(getErrorMessage(err, "AI fill failed"));
    } finally {
      setAiBusy(null);
    }
  }

  if (!resume) return <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#0A4FE8]" /></div>;

  const publicUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/${username}`;

  return (
    <div className="max-w-[960px] px-0 py-1 md:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-[26px] font-bold text-[#0D1B39] tracking-tight">cResume</h1>
          <p className="text-gray-400 text-[13px] mt-1">Your public profile — brand yourself with a beautiful one-pager.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap md:w-auto md:justify-end">
          <label className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[12.5px] cursor-pointer">
            <input type="checkbox" checked={resume.is_public} onChange={(e) => set("is_public", e.target.checked)} className="w-4 h-4" />
            Public
          </label>
          {resume.is_public && username && (
            <a href={`/${username}`} target="_blank" rel="noreferrer" className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-[#0A4FE8]/30 text-[#0A4FE8] text-[12px] font-medium hover:bg-blue-50">
              <Eye className="w-3.5 h-3.5" /> Preview
            </a>
          )}
          <button onClick={save} disabled={saving} className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0A4FE8] text-white text-[12.5px] font-medium hover:bg-[#083EC0] disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>

      {resume.is_public && username && (
        <div className="mb-6 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 flex flex-col items-start gap-2 text-[12px] sm:flex-row sm:items-center">
          <Link2 className="w-3.5 h-3.5 text-[#0A4FE8]" />
          <p className="text-gray-600">Public URL:</p>
          <p className="font-mono break-all text-[11.5px] text-[#0A4FE8]">{publicUrl}</p>
          <button onClick={() => navigator.clipboard.writeText(publicUrl)} className="text-[#0A4FE8] hover:underline sm:ml-auto">Copy</button>
        </div>
      )}

      {/* Basics */}
      <Section title="Basics">
        <div className="mb-4 rounded-2xl border border-[#0A4FE8]/10 bg-gradient-to-r from-blue-50 via-white to-blue-50 px-4 py-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[12px] font-semibold text-[#0A4FE8] inline-flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5" />
                AI Fill
              </p>
              <p className="mt-1 text-[12px] text-gray-500 max-w-2xl">
                Draft headline, about, and skills from your saved experience plus any admin training documents in the AI system.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => runAi("headline")}
                disabled={aiBusy !== null}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-blue-100 text-[12px] font-semibold text-[#0A4FE8] hover:bg-blue-50 disabled:opacity-50"
              >
                {aiBusy === "headline" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                Headline
              </button>
              <button
                type="button"
                onClick={() => runAi("about")}
                disabled={aiBusy !== null}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-blue-100 text-[12px] font-semibold text-[#0A4FE8] hover:bg-blue-50 disabled:opacity-50"
              >
                {aiBusy === "about" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                About
              </button>
              <button
                type="button"
                onClick={() => runAi("skills")}
                disabled={aiBusy !== null}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-blue-100 text-[12px] font-semibold text-[#0A4FE8] hover:bg-blue-50 disabled:opacity-50"
              >
                {aiBusy === "skills" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                Skills
              </button>
            </div>
          </div>

          {aiError && (
            <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{aiError}</p>
          )}

          {headlineOptions.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400 mb-2">Headline suggestions</p>
              <div className="flex flex-wrap gap-2">
                {headlineOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => set("headline", option)}
                    className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-left text-[12px] text-[#0D1B39] hover:border-[#0A4FE8] hover:text-[#0A4FE8]"
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          )}

          {aboutSuggestion && (
            <div className="mt-3 rounded-2xl border border-blue-100 bg-white p-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">About draft</p>
                <button
                  type="button"
                  onClick={() => set("about", aboutSuggestion)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A4FE8] text-white text-[11px] font-semibold"
                >
                  <Check className="w-3.5 h-3.5" />
                  Use draft
                </button>
              </div>
              <p className="text-[12px] leading-6 text-gray-600 whitespace-pre-wrap">{aboutSuggestion}</p>
            </div>
          )}

          {skillSuggestions.length > 0 && (
            <div className="mt-3 rounded-2xl border border-blue-100 bg-white p-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">Suggested skills</p>
                <button
                  type="button"
                  onClick={() => set("skills", skillSuggestions)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A4FE8] text-white text-[11px] font-semibold"
                >
                  <Check className="w-3.5 h-3.5" />
                  Replace skills
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {skillSuggestions.map((skill) => (
                  <span key={skill} className="rounded-lg bg-blue-50 px-2.5 py-1 text-[11.5px] text-[#0A4FE8]">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <AvatarPicker url={resume.avatar_url} onChange={(url) => set("avatar_url", url)} />
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Headline" value={resume.headline} onChange={(v) => set("headline", v)} placeholder="e.g. Brand designer · Product thinker" />
            <Field label="Location" value={resume.location} onChange={(v) => set("location", v)} />
            <Field label="Public email" value={resume.email_public} onChange={(v) => set("email_public", v)} />
            <Field label="Website" value={resume.website} onChange={(v) => set("website", v)} />
          </div>
        </div>
        <label className="block text-[11px] font-medium text-gray-500 mb-1.5 mt-4">About</label>
        <textarea value={resume.about} onChange={(e) => set("about", e.target.value)} rows={5} placeholder="A line or two about what you do and how you do it." className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[13px]" />
      </Section>

      {/* Socials */}
      <Section title="Socials">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="X / Twitter" value={resume.socials.x || ""} onChange={(v) => setSocial("x", v)} />
          <Field label="LinkedIn" value={resume.socials.linkedin || ""} onChange={(v) => setSocial("linkedin", v)} />
          <Field label="GitHub" value={resume.socials.github || ""} onChange={(v) => setSocial("github", v)} />
          <Field label="Telegram" value={resume.socials.telegram || ""} onChange={(v) => setSocial("telegram", v)} />
        </div>
      </Section>

      {/* Skills */}
      <Section title="Skills">
        <SkillsPicker value={resume.skills} onChange={(v) => set("skills", v)} />
      </Section>

      {/* Past roles */}
      <Section title="Past roles">
        <RoleRepeater value={resume.past_roles} onChange={(v) => set("past_roles", v)} />
      </Section>

      {/* Projects */}
      <Section title="Projects">
        <ProjectRepeater value={resume.projects} onChange={(v) => set("projects", v)} />
      </Section>

      {/* Education */}
      <Section title="Education">
        <EducationRepeater value={resume.education} onChange={(v) => set("education", v)} />
      </Section>

      {savedAt && <p className="text-[11px] text-gray-400 text-center">Last saved {new Date(savedAt).toLocaleTimeString()}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
      <h2 className="text-[13px] font-bold uppercase tracking-wider text-gray-500 mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-500 mb-1.5">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[13px]" />
    </div>
  );
}

function AvatarPicker({ url, onChange }: { url: string | null; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      onChange(dataUrl);
      setUploading(false);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="shrink-0 text-center sm:text-left">
      {url ? (
        <img src={url} alt="Avatar" className="w-20 h-20 rounded-full object-cover border border-gray-200" />
      ) : (
        <div className="w-20 h-20 rounded-full bg-[#0A4FE8]/10 text-[#0A4FE8] flex items-center justify-center">
          <UserRound className="w-7 h-7" />
        </div>
      )}
      <label className="mt-2 inline-flex items-center gap-1 text-[11px] text-[#0A4FE8] cursor-pointer hover:underline">
        {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
        {uploading ? "Uploading…" : "Change"}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </label>
    </div>
  );
}

function SkillsPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [tab, setTab] = useState(SKILL_TABS[0]?.key || "");
  const [custom, setCustom] = useState("");
  const active = SKILL_TABS.find((t) => t.key === tab);
  function toggle(skill: string) {
    onChange(value.includes(skill) ? value.filter((s) => s !== skill) : [...value, skill]);
  }
  function addCustom() {
    const s = custom.trim();
    if (!s) return;
    if (!value.includes(s)) onChange([...value, s]);
    setCustom("");
  }
  return (
    <div>
      <div className="flex items-center gap-1 flex-wrap mb-3">
        {SKILL_TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1 rounded-full text-[11.5px] font-medium ${tab === t.key ? "bg-[#0A4FE8] text-white" : "bg-gray-50 text-gray-500"}`}>{t.label}</button>
        ))}
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {(active?.skills || []).map((s: string) => {
          const on = value.includes(s);
          return (
            <button key={s} onClick={() => toggle(s)} className={`px-2.5 py-1 rounded-lg text-[11.5px] ${on ? "bg-[#0A4FE8] text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}>
              {s}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCustom()} placeholder="Add a custom skill…" className="flex-1 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-[12.5px]" />
        <button onClick={addCustom} className="inline-flex w-full sm:w-auto items-center justify-center px-3 py-2 rounded-lg bg-[#0A4FE8] text-white text-[11.5px] font-medium"><Plus className="w-3.5 h-3.5" /></button>
      </div>
      {value.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {value.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0A4FE8]/10 text-[#0A4FE8] text-[11.5px]">
              {s}
              <button onClick={() => onChange(value.filter((x) => x !== s))} className="hover:text-rose-600">
                <XIcon className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function RoleRepeater({ value, onChange }: { value: Role[]; onChange: (v: Role[]) => void }) {
  const blank: Role = { company: "", title: "", start: "", end: "", description: "" };
  return (
    <div className="space-y-3">
      {value.map((r, i) => (
        <div key={i} className="rounded-xl border border-gray-100 p-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Field label="Company" value={r.company} onChange={(v) => onChange(value.map((x, j) => j === i ? { ...x, company: v } : x))} />
            <Field label="Title" value={r.title} onChange={(v) => onChange(value.map((x, j) => j === i ? { ...x, title: v } : x))} />
            <Field label="Start" value={r.start} onChange={(v) => onChange(value.map((x, j) => j === i ? { ...x, start: v } : x))} />
            <Field label="End" value={r.end} onChange={(v) => onChange(value.map((x, j) => j === i ? { ...x, end: v } : x))} />
          </div>
          <label className="block text-[11px] font-medium text-gray-500 mb-1.5 mt-2">Description</label>
          <textarea value={r.description} onChange={(e) => onChange(value.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} rows={2} className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-[12.5px]" />
          <button onClick={() => onChange(value.filter((_, j) => j !== i))} className="mt-2 text-[11px] text-rose-600 hover:underline">Remove</button>
        </div>
      ))}
      <button onClick={() => onChange([...value, blank])} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-[12px] text-gray-500 hover:text-[#0A4FE8]"><Plus className="w-3 h-3" /> Add role</button>
    </div>
  );
}

function ProjectRepeater({ value, onChange }: { value: Project[]; onChange: (v: Project[]) => void }) {
  const blank: Project = { name: "", client: "", role: "", year: "", link: "", description: "" };
  return (
    <div className="space-y-3">
      {value.map((r, i) => (
        <div key={i} className="rounded-xl border border-gray-100 p-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Field label="Project" value={r.name} onChange={(v) => onChange(value.map((x, j) => j === i ? { ...x, name: v } : x))} />
            <Field label="Client" value={r.client} onChange={(v) => onChange(value.map((x, j) => j === i ? { ...x, client: v } : x))} />
            <Field label="Role" value={r.role} onChange={(v) => onChange(value.map((x, j) => j === i ? { ...x, role: v } : x))} />
            <Field label="Year" value={r.year} onChange={(v) => onChange(value.map((x, j) => j === i ? { ...x, year: v } : x))} />
            <Field label="Link" value={r.link} onChange={(v) => onChange(value.map((x, j) => j === i ? { ...x, link: v } : x))} />
          </div>
          <label className="block text-[11px] font-medium text-gray-500 mb-1.5 mt-2">Description</label>
          <textarea value={r.description} onChange={(e) => onChange(value.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} rows={2} className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-[12.5px]" />
          <button onClick={() => onChange(value.filter((_, j) => j !== i))} className="mt-2 text-[11px] text-rose-600 hover:underline">Remove</button>
        </div>
      ))}
      <button onClick={() => onChange([...value, blank])} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-[12px] text-gray-500 hover:text-[#0A4FE8]"><Plus className="w-3 h-3" /> Add project</button>
    </div>
  );
}

function EducationRepeater({ value, onChange }: { value: Education[]; onChange: (v: Education[]) => void }) {
  const blank: Education = { school: "", degree: "", start: "", end: "" };
  return (
    <div className="space-y-3">
      {value.map((r, i) => (
        <div key={i} className="rounded-xl border border-gray-100 p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
          <Field label="School" value={r.school} onChange={(v) => onChange(value.map((x, j) => j === i ? { ...x, school: v } : x))} />
          <Field label="Degree" value={r.degree} onChange={(v) => onChange(value.map((x, j) => j === i ? { ...x, degree: v } : x))} />
          <Field label="Start" value={r.start} onChange={(v) => onChange(value.map((x, j) => j === i ? { ...x, start: v } : x))} />
          <Field label="End" value={r.end} onChange={(v) => onChange(value.map((x, j) => j === i ? { ...x, end: v } : x))} />
          <button onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-[11px] text-rose-600 hover:underline text-left md:col-span-2">Remove</button>
        </div>
      ))}
      <button onClick={() => onChange([...value, blank])} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-[12px] text-gray-500 hover:text-[#0A4FE8]"><Plus className="w-3 h-3" /> Add education</button>
    </div>
  );
}
