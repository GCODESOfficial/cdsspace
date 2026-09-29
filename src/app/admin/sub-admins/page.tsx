"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ALL_PERMISSIONS, PERMISSION_GROUPS } from "@/lib/admin-permissions";
import { SubAdminPermissionsPicker } from "@/components/admin/SubAdminPermissionsPicker";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Loader2, Plus, Eye, EyeOff, Shield, UserPlus, Check, ToggleLeft, ToggleRight, Copy, Mail, Link2, X, Send, ShieldPlus, Pencil, Globe } from "lucide-react";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";
import Link from "next/link";

interface AdminRole {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  created_at: string;
  updated_at: string;
}

interface SubAdmin {
  id: string;
  name: string;
  email: string;
  password: string;
  permissions: string[];
  is_active: boolean;
  created_at: string;
}

interface TeamAdmin {
  id: string;
  full_name: string;
  email: string | null;
  role_title: string | null;
  permissions: string[] | null;
  is_active: boolean;
  access_anywhere: boolean | null;
}

export default function SubAdminsPage() {
  const [subAdmins, setSubAdmins] = useState<SubAdmin[]>([]);
  const [teamAdmins, setTeamAdmins] = useState<TeamAdmin[]>([]);
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

  // Role management
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [isFetchingRoles, setIsFetchingRoles] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<AdminRole | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [isSavingRole, setIsSavingRole] = useState(false);

  // Role-picker on the sub-admin form
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");

  useEffect(() => { fetchSubAdmins(); fetchRoles(); }, []);

  async function fetchRoles() {
    setIsFetchingRoles(true);
    try {
      const r = await fetch("/api/admin/roles");
      const d = await r.json();
      if (r.ok) setRoles(d.roles ?? []);
    } finally {
      setIsFetchingRoles(false);
    }
  }

  function openCreateRole() {
    setEditingRole(null);
    setRoleName("");
    setRoleDescription("");
    setRolePermissions([]);
    setShowRoleModal(true);
  }

  function openEditRole(role: AdminRole) {
    setEditingRole(role);
    setRoleName(role.name);
    setRoleDescription(role.description ?? "");
    setRolePermissions(role.permissions ?? []);
    setShowRoleModal(true);
  }

  async function saveRole(e: React.FormEvent) {
    e.preventDefault();
    const name = roleName.trim();
    if (!name) {
      toast({ title: "Name required", description: "Give the role a name.", variant: "destructive" });
      return;
    }
    setIsSavingRole(true);
    try {
      const body = {
        name,
        description: roleDescription.trim() || null,
        permissions: rolePermissions,
      };
      const res = editingRole
        ? await fetch(`/api/admin/roles/${editingRole.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/admin/roles`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      const d = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: d.error ?? "Couldn't save role", variant: "destructive" });
        return;
      }
      toast({
        title: editingRole ? "Role updated" : "Role created",
        description: `${name} now carries ${rolePermissions.length} permission${rolePermissions.length === 1 ? "" : "s"}.`,
      });
      setShowRoleModal(false);
      setEditingRole(null);
      fetchRoles();
    } finally {
      setIsSavingRole(false);
    }
  }

  async function deleteRole(role: AdminRole) {
    if (!(await appConfirm(`Delete the "${role.name}" role? Existing sub-admins keep their permissions but lose the link to this role.`))) return;
    const res = await fetch(`/api/admin/roles/${role.id}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "Deleted", description: `${role.name} removed.` });
      fetchRoles();
    } else {
      const d = await res.json().catch(() => ({}));
      toast({ title: "Error", description: d.error ?? "Couldn't delete role", variant: "destructive" });
    }
  }

  function applyRoleToSubAdminForm(roleId: string) {
    setSelectedRoleId(roleId);
    if (!roleId) return;
    const r = roles.find((x) => x.id === roleId);
    if (r) setSelectedPermissions(Array.from(new Set([...(r.permissions ?? [])])));
  }

  async function fetchSubAdmins() {
    setIsFetching(true);
    const [{ data, error }, teamRes] = await Promise.all([
      supabase.from("sub_admins").select("*").order("created_at", { ascending: false }),
      // Team members who have been granted an admin role (is_sub_admin) show here too.
      supabase
        .from("team_members")
        .select("id, full_name, email, role_title, permissions, is_active, access_anywhere")
        .eq("is_sub_admin", true)
        .order("full_name", { ascending: true }),
    ]);
    if (!error) setSubAdmins(data || []);
    if (!teamRes.error) setTeamAdmins((teamRes.data as TeamAdmin[]) || []);
    setIsFetching(false);
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

  // Only a super admin may let an admin work outside the office geofence.
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [savingAnywhereFor, setSavingAnywhereFor] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/admin-check", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setIsSuperAdmin(data?.role === "super_admin"))
      .catch(() => undefined);
  }, []);

  async function toggleAccessAnywhere(member: TeamAdmin) {
    const enabled = !member.access_anywhere;
    const question = enabled
      ? `Let ${member.full_name} sign in and clock in from anywhere? The office geofence will no longer apply to them. Their location is still recorded.`
      : `Hold ${member.full_name} to the office geofence again?`;
    if (!(await appConfirm(question))) return;
    setSavingAnywhereFor(member.id);
    try {
      const response = await fetch(`/api/admin/team-members/${member.id}/access-anywhere`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || "The change could not be saved.");
      setTeamAdmins((current) => current.map((item) => item.id === member.id ? { ...item, access_anywhere: enabled } : item));
      toast({
        title: enabled ? "Access from anywhere on" : "Office geofence applies",
        description: enabled ? `${member.full_name} can now work from any location.` : `${member.full_name} must be at the office on office days.`,
      });
    } catch (error) {
      appAlert(error instanceof Error ? error.message : "The change could not be saved.");
    } finally {
      setSavingAnywhereFor(null);
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
        <div className="flex items-center gap-2">
          <button
            onClick={openCreateRole}
            className="flex items-center gap-2 px-5 py-2.5 bg-white text-[#0A4FE8] text-sm font-semibold rounded-xl border border-[#0A4FE8]/30 hover:bg-blue-50 transition"
          >
            <ShieldPlus className="w-4 h-4" /> Create Role
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition"
          >
            {showForm ? "Cancel" : <><UserPlus className="w-4 h-4" /> Add Sub-Admin</>}
          </button>
        </div>
      </div>

      {/* Roles panel */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-6">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-[#0D1B39]">
              Roles <span className="text-gray-400 font-normal">({roles.length})</span>
            </h2>
            <p className="text-[11.5px] text-gray-400">
              Pre-baked permission bundles you can apply to any sub-admin or team member.
            </p>
          </div>
          <button
            onClick={openCreateRole}
            className="text-[12px] font-semibold text-[#0A4FE8] hover:underline flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> New role
          </button>
        </div>
        {isFetchingRoles ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
          </div>
        ) : roles.length === 0 ? (
          <div className="text-center py-8 px-6">
            <ShieldPlus className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">No roles defined yet.</p>
            <p className="text-gray-300 text-xs mt-0.5">Create one and reuse it when adding sub-admins.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {roles.map((role) => (
              <div key={role.id} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50/50 transition">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[13.5px] font-semibold text-[#0D1B39] truncate">{role.name}</p>
                    <span className="text-[10.5px] text-gray-400">
                      {role.permissions.length} permission{role.permissions.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {role.description && (
                    <p className="text-[11.5px] text-gray-500 truncate">{role.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEditRole(role)}
                    className="p-2 rounded-lg text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50 transition"
                    title="Edit role"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteRole(role)}
                    className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition"
                    title="Delete role"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
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

            {/* Role picker */}
            {roles.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Apply a role (optional) <span className="text-gray-300">- fills the permission list below</span>
                </label>
                <select
                  value={selectedRoleId}
                  onChange={(e) => applyRoleToSubAdminForm(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
                >
                  <option value="">- Start from scratch -</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.permissions.length} perm{r.permissions.length === 1 ? "" : "s"})
                    </option>
                  ))}
                </select>
                {selectedRoleId && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    Permissions below were pre-filled from this role. Tweak anything you like before saving.
                  </p>
                )}
              </div>
            )}

            {/* Permissions - grouped */}
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

              <SubAdminPermissionsPicker
                value={selectedPermissions}
                onChange={setSelectedPermissions}
              />
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
            Team Members <span className="text-gray-400 font-normal">({subAdmins.length + teamAdmins.length})</span>
          </h2>
        </div>

        {isFetching ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          </div>
        ) : subAdmins.length === 0 && teamAdmins.length === 0 ? (
          <div className="text-center py-12">
            <Shield className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No admin team members yet</p>
            <p className="text-gray-300 text-xs mt-1">Add a sub-admin, or give a team member an admin role</p>
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

            {/* Team members granted an admin role (managed under Team Members) */}
            {teamAdmins.map((member) => {
              const perms = member.permissions || [];
              return (
                <div key={`team-${member.id}`} className="px-6 py-4 hover:bg-gray-50/50 transition">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                        member.is_active ? "bg-violet-50 text-violet-600" : "bg-gray-100 text-gray-400"
                      }`}>
                        {member.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[14px] font-semibold text-[#0D1B39]">{member.full_name}</p>
                          <span className="px-2 py-0.5 rounded-md bg-violet-50 text-violet-600 text-[10px] font-semibold">
                            TEAM MEMBER
                          </span>
                          {member.role_title && (
                            <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 text-[10px] font-medium">{member.role_title}</span>
                          )}
                          {!member.is_active && (
                            <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-400 text-[10px] font-medium">DISABLED</span>
                          )}
                          {member.access_anywhere && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-medium">
                              <Globe className="w-3 h-3" /> Access from anywhere
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] text-gray-400 mt-0.5">{member.email || "-"}</p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {perms.length === 0 ? (
                            <span className="text-[11px] text-gray-300">No permissions assigned</span>
                          ) : perms.map((perm) => {
                            const subPerm = ALL_PERMISSIONS.find((p) => p.key === perm);
                            const groupPerm = PERMISSION_GROUPS.find((g) => g.key === perm);
                            const permLabel = subPerm?.label || groupPerm?.label || perm;
                            return (
                              <span key={perm} className="px-2 py-0.5 rounded-md bg-blue-50 text-[#0A4FE8] text-[10px] font-medium">
                                {permLabel}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
                      {isSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => toggleAccessAnywhere(member)}
                          disabled={savingAnywhereFor === member.id}
                          aria-pressed={Boolean(member.access_anywhere)}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-50 ${
                            member.access_anywhere
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              : "border-gray-200 text-gray-500 hover:border-[#0A4FE8] hover:text-[#0A4FE8]"
                          }`}
                          title={member.access_anywhere ? "Hold this admin to the office geofence again" : "Let this admin sign in and clock in from any location"}
                        >
                          {savingAnywhereFor === member.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                          {member.access_anywhere ? "Anywhere: on" : "Allow anywhere"}
                        </button>
                      )}
                      <Link
                        href="/admin/team-members"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-500 hover:border-[#0A4FE8] hover:text-[#0A4FE8] transition"
                        title="Manage this team member"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Manage
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
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
                  When they click it, the login page fills in their email and password automatically - once.
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
              <strong>Security:</strong> this link is single-use. The password is never in the URL - the server only returns it once, when the new sub-admin opens the link.
            </div>
          </div>
        </div>
      )}

      {/* Role create / edit modal */}
      {showRoleModal && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => !isSavingRole && setShowRoleModal(false)}
        >
          <form
            onSubmit={saveRole}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
          >
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0A4FE8] flex items-center justify-center mb-2">
                  <ShieldPlus className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-bold text-[#0D1B39]">
                  {editingRole ? "Edit role" : "Create role"}
                </h2>
                <p className="text-[12px] text-gray-500">
                  Bundle permissions into a role so you can reuse it when adding sub-admins or team members.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !isSavingRole && setShowRoleModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Role name</label>
                  <input
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    placeholder="e.g. Finance Manager"
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">
                    Description <span className="text-gray-300">(optional)</span>
                  </label>
                  <input
                    value={roleDescription}
                    onChange={(e) => setRoleDescription(e.target.value)}
                    placeholder="Short internal note"
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-medium text-gray-500">
                    Permissions <span className="text-gray-300">({rolePermissions.length}/{ALL_PERMISSIONS.length})</span>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setRolePermissions(
                        rolePermissions.length === ALL_PERMISSIONS.length
                          ? []
                          : ALL_PERMISSIONS.map((p) => p.key),
                      )
                    }
                    className="text-[11px] font-medium text-[#0A4FE8] hover:underline"
                  >
                    {rolePermissions.length === ALL_PERMISSIONS.length ? "Deselect All" : "Select All"}
                  </button>
                </div>

                <SubAdminPermissionsPicker
                  value={rolePermissions}
                  onChange={setRolePermissions}
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2 bg-gray-50/50">
              <button
                type="button"
                disabled={isSavingRole}
                onClick={() => setShowRoleModal(false)}
                className="px-5 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingRole}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#0A4FE8] text-white text-sm font-semibold hover:bg-[#083EC0] transition disabled:opacity-50"
              >
                {isSavingRole ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : editingRole ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {isSavingRole ? "Saving…" : editingRole ? "Save changes" : "Create role"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
