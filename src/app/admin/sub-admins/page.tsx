"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PERMISSION_GROUPS, ALL_PERMISSIONS } from "@/lib/admin-permissions";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Loader2, Plus, Eye, EyeOff, Shield, UserPlus, Check, ToggleLeft, ToggleRight, ChevronDown, ChevronRight, Copy, Mail, Link2, X, Send } from "lucide-react";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";

interface SubAdmin {
  id: string;
  name: string;
  email: string;
  password: string;
  permissions: string[];
  is_active: boolean;
  created_at: string;
}

export default function SubAdminsPage() {
  const [subAdmins, setSubAdmins] = useState<SubAdmin[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const { toast } = useToast();

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  // Invite link shown after creating a sub-admin
  const [invite, setInvite] = useState<null | {
    name: string;
    email: string;
    url: string;
    expiresAt: string;
    emailSent: boolean;
    emailError?: string;
  }>(null);
  const [resendingFor, setResendingFor] = useState<string | null>(null);

  useEffect(() => { fetchSubAdmins(); }, []);

  async function fetchSubAdmins() {
    setIsFetching(true);
    const { data, error } = await supabase
      .from("sub_admins")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) setSubAdmins(data || []);
    setIsFetching(false);
  }

  function togglePermission(key: string) {
    setSelectedPermissions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  }

  function toggleGroup(groupKey: string) {
    const group = PERMISSION_GROUPS.find(g => g.key === groupKey);
    if (!group) return;
    const groupPermKeys = group.permissions.map(p => p.key);
    const allSelected = groupPermKeys.every(k => selectedPermissions.includes(k));
    if (allSelected) {
      setSelectedPermissions(prev => prev.filter(p => !groupPermKeys.includes(p)));
    } else {
      setSelectedPermissions(prev => Array.from(new Set([...prev, ...groupPermKeys])));
    }
  }

  function selectAllPermissions() {
    if (selectedPermissions.length === ALL_PERMISSIONS.length) {
      setSelectedPermissions([]);
    } else {
      setSelectedPermissions(ALL_PERMISSIONS.map((p) => p.key));
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) {
      toast({ title: "Missing fields", description: "All fields are required", variant: "destructive" });
      return;
    }
    if (selectedPermissions.length === 0) {
      toast({ title: "No permissions", description: "Select at least one permission", variant: "destructive" });
      return;
    }

    setIsCreating(true);
    const { data: inserted, error } = await supabase
      .from("sub_admins")
      .insert({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: password.trim(),
        permissions: selectedPermissions,
        is_active: true,
      })
      .select("id, name, email")
      .single();

    if (error || !inserted) {
      toast({
        title: "Error",
        description: error?.message.includes("duplicate") ? "Email already exists" : error?.message ?? "Failed to create",
        variant: "destructive",
      });
      setIsCreating(false);
      return;
    }

    toast({ title: "Created", description: `${inserted.name} added as sub-admin` });
    setName(""); setEmail(""); setPassword(""); setSelectedPermissions([]); setShowForm(false);
    fetchSubAdmins();

    // Fire-and-surface the invite. If this fails, the sub-admin still exists
    // and the super admin can retry from the list row.
    try {
      const res = await fetch("/api/admin/sub-admins/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sub_admin_id: inserted.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to generate invite link");
      setInvite({
        name: inserted.name,
        email: inserted.email,
        url: json.invite_url,
        expiresAt: json.expires_at,
        emailSent: Boolean(json.email_sent),
        emailError: json.email_error,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to generate invite link";
      toast({ title: "Invite link failed", description: message, variant: "destructive" });
    }

    setIsCreating(false);
  }

  async function resendInvite(admin: SubAdmin) {
    setResendingFor(admin.id);
    try {
      const res = await fetch("/api/admin/sub-admins/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sub_admin_id: admin.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setInvite({
        name: admin.name,
        email: admin.email,
        url: json.invite_url,
        expiresAt: json.expires_at,
        emailSent: Boolean(json.email_sent),
        emailError: json.email_error,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to generate invite link";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setResendingFor(null);
    }
  }

  async function copyInviteLink() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.url);
      toast({ title: "Copied", description: "Invite link copied to clipboard", variant: "success" });
    } catch {
      toast({ title: "Copy failed", description: "Select the link and copy manually", variant: "destructive" });
    }
  }

  async function toggleActive(admin: SubAdmin) {
    const { error } = await supabase
      .from("sub_admins")
      .update({ is_active: !admin.is_active })
      .eq("id", admin.id);
    if (!error) fetchSubAdmins();
  }

  async function handleDelete(admin: SubAdmin) {
    if (!(await appConfirm(`Remove ${admin.name}? This cannot be undone.`))) return;
    const { error } = await supabase.from("sub_admins").delete().eq("id", admin.id);
    if (!error) {
      toast({ title: "Removed", description: `${admin.name} has been removed` });
      fetchSubAdmins();
    }
  }

  return (
    <div className="p-8 max-w-[1000px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-[#0A4FE8] text-sm font-semibold">Manage</p>
          <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">Sub-Admins</h1>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition"
        >
          {showForm ? "Cancel" : <><UserPlus className="w-4 h-4" /> Add Sub-Admin</>}
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8">
          <h2 className="text-[15px] font-semibold text-[#0D1B39] mb-5 flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#0A4FE8]" />
            New Sub-Admin
          </h2>
          <form onSubmit={handleCreate} className="space-y-5">
            {/* Name + Email row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Full Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. john@cdsspace.pro"
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Set a password"
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Permissions — grouped */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-medium text-gray-500">
                  Permissions <span className="text-gray-300">({selectedPermissions.length}/{ALL_PERMISSIONS.length})</span>
                </label>
                <button
                  type="button"
                  onClick={selectAllPermissions}
                  className="text-[11px] font-medium text-[#0A4FE8] hover:underline"
                >
                  {selectedPermissions.length === ALL_PERMISSIONS.length ? "Deselect All" : "Select All"}
                </button>
              </div>

              <div className="space-y-3">
                {PERMISSION_GROUPS.map((group) => {
                  const groupKeys = group.permissions.map(p => p.key);
                  const groupSelectedCount = groupKeys.filter(k => selectedPermissions.includes(k)).length;
                  const allGroupSelected = groupSelectedCount === groupKeys.length;
                  const someGroupSelected = groupSelectedCount > 0;
                  const isExpanded = expandedGroups.includes(group.key);

                  return (
                    <div key={group.key} className={`border rounded-xl overflow-hidden transition ${
                      someGroupSelected ? "border-[#0A4FE8]/30 bg-blue-50/30" : "border-gray-200 bg-gray-50/50"
                    }`}>
                      {/* Group header */}
                      <div className="flex items-center gap-3 px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.key)}
                          className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition ${
                            allGroupSelected ? "bg-[#0A4FE8]" : someGroupSelected ? "bg-[#0A4FE8]/40" : "bg-gray-200"
                          }`}
                        >
                          {allGroupSelected && <Check className="w-3 h-3 text-white" />}
                          {!allGroupSelected && someGroupSelected && <div className="w-2 h-0.5 bg-white rounded-full" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpandedGroups(prev => prev.includes(group.key) ? prev.filter(g => g !== group.key) : [...prev, group.key])}
                          className="flex-1 flex items-center justify-between text-left"
                        >
                          <div>
                            <p className="text-[13px] font-semibold text-[#0D1B39]">{group.label}</p>
                            <p className="text-[11px] text-gray-400">{groupSelectedCount} of {groupKeys.length} permissions</p>
                          </div>
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                        </button>
                      </div>

                      {/* Sub-permissions */}
                      {isExpanded && (
                        <div className="px-4 pb-3 pt-1 space-y-1.5 border-t border-gray-100/60">
                          {group.permissions.map((perm) => {
                            const isSelected = selectedPermissions.includes(perm.key);
                            return (
                              <button
                                key={perm.key}
                                type="button"
                                onClick={() => togglePermission(perm.key)}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition ${
                                  isSelected ? "bg-blue-50" : "hover:bg-white"
                                }`}
                              >
                                <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition ${
                                  isSelected ? "bg-[#0A4FE8]" : "bg-gray-200"
                                }`}>
                                  {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                                </div>
                                <div>
                                  <p className={`text-[12px] font-medium ${isSelected ? "text-[#0D1B39]" : "text-gray-600"}`}>
                                    {perm.label}
                                  </p>
                                  <p className="text-[10px] text-gray-400">{perm.description}</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={isCreating}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition disabled:opacity-50"
            >
              {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {isCreating ? "Creating..." : "Create Sub-Admin"}
            </button>
          </form>
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-[#0D1B39]">
            Team Members <span className="text-gray-400 font-normal">({subAdmins.length})</span>
          </h2>
        </div>

        {isFetching ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          </div>
        ) : subAdmins.length === 0 ? (
          <div className="text-center py-12">
            <Shield className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No sub-admins yet</p>
            <p className="text-gray-300 text-xs mt-1">Click &quot;Add Sub-Admin&quot; to create one</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {subAdmins.map((admin) => (
              <div key={admin.id} className="px-6 py-4 hover:bg-gray-50/50 transition">
                <div className="flex items-start justify-between">
                  {/* Info */}
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                      admin.is_active ? "bg-blue-50 text-[#0A4FE8]" : "bg-gray-100 text-gray-400"
                    }`}>
                      {admin.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-[14px] font-semibold text-[#0D1B39]">{admin.name}</p>
                        {!admin.is_active && (
                          <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-400 text-[10px] font-medium">
                            DISABLED
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-gray-400 mt-0.5">{admin.email}</p>
                      {/* Permission badges */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {admin.permissions.map((perm) => {
                          const subPerm = ALL_PERMISSIONS.find((p) => p.key === perm);
                          const groupPerm = PERMISSION_GROUPS.find((g) => g.key === perm);
                          const label = subPerm?.label || groupPerm?.label || perm;
                          return (
                            <span
                              key={perm}
                              className="px-2 py-0.5 rounded-md bg-blue-50 text-[#0A4FE8] text-[10px] font-medium"
                            >
                              {label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => toggleActive(admin)}
                      className={`p-2 rounded-lg transition ${
                        admin.is_active
                          ? "text-green-500 hover:bg-green-50"
                          : "text-gray-300 hover:bg-gray-100"
                      }`}
                      title={admin.is_active ? "Disable access" : "Enable access"}
                    >
                      {admin.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                    <button
                      onClick={() => resendInvite(admin)}
                      disabled={resendingFor === admin.id}
                      className="p-2 rounded-lg text-gray-300 hover:text-[#0A4FE8] hover:bg-blue-50 transition disabled:opacity-50"
                      title="Send login invite link"
                    >
                      {resendingFor === admin.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleDelete(admin)}
                      className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invite link modal */}
      {invite && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0A4FE8] flex items-center justify-center mb-3">
                  <Link2 className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-bold text-[#0D1B39]">Invite link ready</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Share this with <strong>{invite.name}</strong> ({invite.email}).
                  When they click it, the login page fills in their email and password automatically — once.
                </p>
              </div>
              <button
                onClick={() => setInvite(null)}
                className="p-1 rounded-lg text-gray-400 hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl p-2 mb-3">
              <input
                readOnly
                value={invite.url}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 bg-transparent text-xs text-gray-700 outline-none px-2 font-mono truncate"
              />
              <button
                onClick={copyInviteLink}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A4FE8] text-white text-xs font-medium hover:bg-[#083EC0]"
              >
                <Copy className="w-3.5 h-3.5" /> Copy
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs">
              {invite.emailSent ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium">
                  <Mail className="w-3.5 h-3.5" /> Sent to {invite.email}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">
                  <Mail className="w-3.5 h-3.5" /> Email not sent{invite.emailError ? `: ${invite.emailError}` : ""}
                </span>
              )}
              <span className="text-gray-400">Expires {new Date(invite.expiresAt).toLocaleDateString()}</span>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 text-[11px] text-gray-500 leading-snug">
              <strong>Security:</strong> this link is single-use. The password is never in the URL — the server only returns it once, when the new sub-admin opens the link.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
