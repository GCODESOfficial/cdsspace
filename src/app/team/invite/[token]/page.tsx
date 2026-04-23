"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Check, AlertCircle, ShieldCheck } from "lucide-react";

interface InvitePayload {
  token: string;
  kind?: "blank" | "member";
  suggested_full_name: string | null;
  suggested_email: string | null;
  suggested_username: string | null;
  suggested_phone: string | null;
  suggested_role_title: string | null;
  suggested_department: { id: string; name: string } | null;
  is_sub_admin: boolean;
}

export default function TeamInvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params?.token;

  const [invite, setInvite] = useState<InvitePayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [availableDepartments, setAvailableDepartments] = useState<{ id: string; name: string }[]>([]);

  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/team-invites/${encodeURIComponent(token)}`);
      const json = await res.json();
      setLoading(false);
      if (!res.ok || !json.ok) {
        setLoadError(json.error || "Invite link is invalid");
        return;
      }
      setInvite(json.invite);
      if (json.departments) setAvailableDepartments(json.departments);
      if (json.invite.suggested_full_name) setFullName(json.invite.suggested_full_name);
      if (json.invite.suggested_email) setEmail(json.invite.suggested_email);
      if (json.invite.suggested_username) setUsername(json.invite.suggested_username);
      if (json.invite.suggested_phone) setPhone(json.invite.suggested_phone);
      if (json.invite.suggested_role_title) setRoleTitle(json.invite.suggested_role_title);
      if (json.invite.suggested_department?.name) setDepartmentName(json.invite.suggested_department.name);
    })();
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (password !== confirm) {
      setSubmitError("Passwords don't match");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/team-invites/${encodeURIComponent(token!)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: fullName,
        email,
        username,
        password,
        role_title: roleTitle,
        department_name: departmentName,
        phone,
        bio,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok || !json.ok) {
      setSubmitError(json.error || "Failed to create your account");
      return;
    }

    // Hand off to the team login screen with the just-chosen credentials
    // pre-filled. We do this instead of bouncing straight to /team because the
    // fresh session cookie the API just set isn't always visible to the router
    // prefetch (users landed on a blank /team/login and had to guess their own
    // creds). Passing via sessionStorage keeps the password out of the URL.
    try {
      if (typeof window !== "undefined") {
        sessionStorage.setItem(
          "cds_team_invite_prefill",
          JSON.stringify({ username, password, full_name: fullName }),
        );
      }
    } catch {
      // sessionStorage blocked (private mode) — login page will render blank
      // and user can type their freshly-chosen credentials manually.
    }
    router.replace("/team/login?welcome=invite");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f7fb]">
        <Loader2 className="w-6 h-6 animate-spin text-[#0A4FE8]" />
      </div>
    );
  }

  if (loadError || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f7fb] px-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-rose-50 flex items-center justify-center mb-4">
            <AlertCircle className="w-6 h-6 text-rose-500" />
          </div>
          <h1 className="text-xl font-bold text-[#0D1B39] mb-1">Invite unavailable</h1>
          <p className="text-sm text-gray-500 mb-6">{loadError || "This invite link is invalid or has expired."}</p>
          <Link
            href="/team/login"
            className="inline-flex items-center justify-center px-4 py-2.5 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition"
          >
            Go to team sign-in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] py-10 px-4">
      <div className="max-w-[720px] mx-auto">
        <div className="text-center mb-8">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#0A4FE8] font-semibold mb-2">CDS Space</p>
          <h1 className="text-[26px] font-bold text-[#0D1B39] tracking-tight">Set up your team account</h1>
          <p className="text-sm text-gray-500 mt-1">
            Fill in your details below. You&apos;ll be signed in right after.
          </p>
        </div>

        {invite.is_sub_admin && (
          <div className="mb-5 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-[12px] text-[#0A4FE8] inline-flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            You&apos;ve been invited with sub-admin access.
          </div>
        )}

        <form
          onSubmit={submit}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:p-8 space-y-5"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <Field label="Full name *" value={fullName} onChange={setFullName} required />
            <Field label="Email *" type="email" value={email} onChange={setEmail} required />
            <Field
              label="Username *"
              value={username}
              onChange={setUsername}
              required
              placeholder="e.g. jane.doe"
              hint="Lowercase, numbers, . _ - only"
            />
            <div className="hidden md:block" />
            <Field label="Password *" type="password" value={password} onChange={setPassword} required hint="Min 8 characters" />
            <Field label="Confirm password *" type="password" value={confirm} onChange={setConfirm} required />
            <Field label="Role / Title" value={roleTitle} onChange={setRoleTitle} placeholder="e.g. Creative Director" />
            
            <div className="flex flex-col gap-1.5">
              <label className="block text-xs font-medium text-gray-500">Department</label>
              <select
                value={departmentName}
                onChange={(e) => setDepartmentName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
              >
                <option value="">Select a department</option>
                {availableDepartments.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <Field label="Phone" value={phone} onChange={setPhone} placeholder="+234..." />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Short bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition resize-none"
              placeholder="A line or two about you (optional)"
            />
          </div>

          {submitError && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[12px] px-4 py-2.5">
              {submitError}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#0A4FE8] text-white text-[14px] font-medium rounded-xl hover:bg-[#083EC0] transition disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Create my account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
      />
      {hint && <p className="text-[10.5px] text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}
