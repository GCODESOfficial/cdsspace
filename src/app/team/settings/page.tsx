"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, UserRound, Lock, Globe, Camera, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useTranslation, LOCALES, type Locale } from "@/lib/i18n/context";

interface Profile {
  id: string;
  full_name: string;
  email: string;
  username: string;
  avatar_url: string | null;
  role_title: string | null;
  department: string | null;
  phone: string | null;
  location: string | null;
  bio: string | null;
  language: string | null;
}

type Tab = "profile" | "security" | "language";

export default function TeamSettingsPage() {
  const { t, setLocale } = useTranslation();
  const [tab, setTab] = useState<Tab>("profile");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/team/session", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setProfile(j.member);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading || !profile) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 text-brand-blue animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-[1000px] space-y-6">
      <div>
        <h1 className="text-[28px] font-bold text-brand-navy tracking-tight">{t("nav.settings")}</h1>
        <p className="text-[13px] text-brand-body/60 mt-1">
          Manage your account, security, and preferences.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-white rounded-xl border border-brand-stroke/30 w-fit">
        <TabBtn id="profile" active={tab} setActive={setTab} icon={UserRound} label={t("settings.profile")} />
        <TabBtn id="security" active={tab} setActive={setTab} icon={Lock} label={t("settings.security")} />
        <TabBtn id="language" active={tab} setActive={setTab} icon={Globe} label={t("settings.language")} />
      </div>

      {tab === "profile" && <ProfileForm profile={profile} onUpdate={setProfile} />}
      {tab === "security" && <SecurityForm />}
      {tab === "language" && (
        <LanguageForm
          current={profile.language || "en"}
          onChange={(l) => {
            setProfile({ ...profile, language: l });
            setLocale(l as Locale);
          }}
        />
      )}
    </div>
  );
}

function TabBtn({
  id,
  active,
  setActive,
  icon: Icon,
  label,
}: {
  id: Tab;
  active: Tab;
  setActive: (t: Tab) => void;
  icon: any;
  label: string;
}) {
  const isActive = active === id;
  return (
    <button
      onClick={() => setActive(id)}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium transition ${
        isActive
          ? "bg-brand-blue text-white shadow-[0_6px_18px_rgba(28,78,209,0.2)]"
          : "text-brand-body hover:bg-brand-bg/60"
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

function ProfileForm({ profile, onUpdate }: { profile: Profile; onUpdate: (p: Profile) => void }) {
  const [full_name, setFullName] = useState(profile.full_name);
  const [role_title, setRole] = useState(profile.role_title || "");
  const [phone, setPhone] = useState(profile.phone || "");
  const [location, setLocation] = useState(profile.location || "");
  const [bio, setBio] = useState(profile.bio || "");
  const [avatar, setAvatar] = useState(profile.avatar_url);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${profile.id}/${Date.now()}.${ext}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).storage
        .from("team-avatars")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = (supabase as any).storage.from("team-avatars").getPublicUrl(path);
      setAvatar(data.publicUrl);
      await fetch("/api/team/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_url: data.publicUrl }),
      });
      setToast({ ok: true, msg: "Avatar updated" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setToast({ ok: false, msg: err.message || "Upload failed" });
    } finally {
      setUploading(false);
      setTimeout(() => setToast(null), 2500);
    }
  }

  async function save() {
    setSaving(true);
    const res = await fetch("/api/team/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name, role_title, phone, location, bio }),
    });
    setSaving(false);
    const json = await res.json();
    if (!res.ok) {
      setToast({ ok: false, msg: json.error || "Save failed" });
    } else {
      onUpdate({ ...profile, full_name, role_title, phone, location, bio, avatar_url: avatar });
      setToast({ ok: true, msg: "Profile saved" });
    }
    setTimeout(() => setToast(null), 2500);
  }

  return (
    <div className="bg-white rounded-2xl border border-brand-stroke/30 p-6 md:p-8 space-y-6">
      {/* Avatar */}
      <div className="flex items-center gap-5">
        <div className="relative w-20 h-20">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              alt={profile.full_name}
              className="w-20 h-20 rounded-full object-cover border-2 border-brand-stroke/30"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-brand-blue text-white text-2xl font-bold flex items-center justify-center">
              {profile.full_name.charAt(0).toUpperCase()}
            </div>
          )}
          <label className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-brand-navy text-white flex items-center justify-center cursor-pointer hover:bg-brand-blue transition">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </label>
        </div>
        <div>
          <p className="text-[14px] font-semibold text-brand-navy">{profile.full_name}</p>
          <p className="text-[12px] text-brand-body/60">@{profile.username}</p>
          <p className="text-[11px] text-brand-body/50 mt-1">{profile.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Full name" value={full_name} onChange={setFullName} />
        <Field label="Role / Title" value={role_title} onChange={setRole} />
        <Field label="Phone" value={phone} onChange={setPhone} />
        <Field label="Location" value={location} onChange={setLocation} />
      </div>
      <div>
        <label className="block text-xs font-medium text-brand-body/60 mb-1.5">Bio</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          className="w-full px-4 py-2.5 rounded-xl bg-brand-bg/50 border border-brand-stroke/40 text-[13px] resize-none focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue/40"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-blue text-white text-[13px] font-semibold hover:bg-brand-blue/90 transition disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save changes
        </button>
        {toast && (
          <span
            className={`inline-flex items-center gap-1.5 text-[12px] ${
              toast.ok ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            <Check className="w-3.5 h-3.5" />
            {toast.msg}
          </span>
        )}
      </div>
    </div>
  );
}

function SecurityForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function change() {
    setError(null);
    setSuccess(false);
    if (next !== confirm) {
      setError("New passwords don't match");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/team/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: current, new_password: next }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(json.error || "Failed to change password");
      return;
    }
    setSuccess(true);
    setCurrent("");
    setNext("");
    setConfirm("");
    setTimeout(() => setSuccess(false), 3000);
  }

  return (
    <div className="bg-white rounded-2xl border border-brand-stroke/30 p-6 md:p-8 space-y-4 max-w-xl">
      <div>
        <h2 className="text-[15px] font-bold text-brand-navy">Change password</h2>
        <p className="text-[12px] text-brand-body/60 mt-0.5">Use at least 8 characters.</p>
      </div>
      <Field label="Current password" value={current} onChange={setCurrent} type="password" />
      <Field label="New password" value={next} onChange={setNext} type="password" />
      <Field label="Confirm new password" value={confirm} onChange={setConfirm} type="password" />

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[12px] px-4 py-2.5">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-[12px] px-4 py-2.5">
          Password updated.
        </div>
      )}

      <button
        onClick={change}
        disabled={saving || !current || !next || !confirm}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-navy text-white text-[13px] font-semibold hover:bg-brand-navy/90 transition disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
        Change password
      </button>
    </div>
  );
}

function LanguageForm({ current, onChange }: { current: string; onChange: (l: string) => void }) {
  const [selected, setSelected] = useState(current);
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/team/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: selected }),
    });
    setSaving(false);
    if (res.ok) {
      onChange(selected);
      setOk(true);
      setTimeout(() => setOk(false), 2000);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-brand-stroke/30 p-6 md:p-8 space-y-4 max-w-xl">
      <div>
        <h2 className="text-[15px] font-bold text-brand-navy">Language</h2>
        <p className="text-[12px] text-brand-body/60 mt-0.5">
          Pick your preferred language for the team portal.
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {LOCALES.map((l) => (
          <button
            key={l.code}
            onClick={() => setSelected(l.code)}
            className={`px-3 py-3 rounded-xl text-left transition border ${
              selected === l.code
                ? "bg-brand-blue/5 border-brand-blue/40 text-brand-blue"
                : "bg-brand-bg/40 border-brand-stroke/30 hover:border-brand-blue/30"
            }`}
          >
            <p className="text-[13px] font-semibold">{l.nativeLabel}</p>
            <p className="text-[10px] uppercase tracking-wider opacity-60">{l.code}</p>
          </button>
        ))}
      </div>
      <button
        onClick={save}
        disabled={saving || selected === current}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-blue text-white text-[13px] font-semibold hover:bg-brand-blue/90 transition disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save language
      </button>
      {ok && <span className="ml-3 text-[12px] text-emerald-600">Saved</span>}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-brand-body/60 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-2.5 rounded-xl bg-brand-bg/50 border border-brand-stroke/40 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue/40"
      />
    </div>
  );
}
