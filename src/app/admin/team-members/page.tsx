"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Plus,
  UserPlus,
  Trash2,
  Copy,
  ToggleLeft,
  ToggleRight,
  ShieldCheck,
  Check,
  X,
  Search,
  Users,
  Link2,
  Share2,
  Facebook,
  Linkedin,
  MessageCircle,
  Eye,
  EyeOff,
  Camera,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import {
  InviteShareModal,
  type InviteSharePayload,
} from "@/components/admin/InviteShareModal";
import { SubAdminPermissionsPicker } from "@/components/admin/SubAdminPermissionsPicker";
import BulkActionBar from "@/components/admin/BulkActionBar";
import ActivityPanel from "@/components/admin/ActivityPanel";
import { appAlert, appConfirm } from "@/lib/app-notify";

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  username: string;
  avatar_url: string | null;
  role_title: string | null;
  department: string | null;
  phone: string | null;
  is_active: boolean;
  is_sub_admin: boolean;
  permissions: string[];
  invite_token: string | null;
  invite_filled: boolean;
  joined_at: string | null;
  created_at: string;
  availability_status?: "online" | "offline" | "break";
  face_review?: {
    status: string;
    enrolled_at: string | null;
    last_verified_at: string | null;
    enrollment_image_data: string | null;
    latest_capture_image_data: string | null;
    latest_capture_at: string | null;
    latest_match_score: number | string | null;
    latest_liveness_score: number | string | null;
    latest_verification_flag: string | null;
    verification_failures: number | null;
    reset_requested_at: string | null;
  } | null;
}

interface PendingInvite {
  id: string;
  token: string;
  is_sub_admin: boolean;
  permissions: string[];
  suggested_role_title: string | null;
  suggested_department_id: string | null;
  expires_at: string;
  created_at: string;
}

export default function AdminTeamMembersPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [shareModal, setShareModal] = useState<InviteSharePayload | null>(null);

  const [generatingLink, setGeneratingLink] = useState(false);
  const [lastGeneratedId, setLastGeneratedId] = useState<string | null>(null);

  const [promotingMember, setPromotingMember] = useState<TeamMember | null>(null);
  const [viewingMember, setViewingMember] = useState<TeamMember | null>(null);

  // Selection state
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [selectedInviteIds, setSelectedInviteIds] = useState<Set<string>>(new Set());

  async function generateSelfServeLink(isSubAdmin: boolean, permissions: string[] = []) {
    setGeneratingLink(true);
    try {
      const res = await fetch("/api/admin/team-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_sub_admin: isSubAdmin,
          permissions: isSubAdmin ? (permissions.length ? permissions : ["dashboard"]) : [],
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        appAlert(json.error || "Couldn't generate an invite link");
        return;
      }
      // Refresh the list and highlight the newly created one
      await fetchInvites();
      setLastGeneratedId(json.invite.id);
      // Scroll pending-invites section into view if off-screen
      setTimeout(() => {
        document.getElementById(`invite-${json.invite.id}`)?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }, 50);
    } finally {
      setGeneratingLink(false);
    }
  }

  async function fetchMembers() {
    setLoading(true);
    const res = await fetch("/api/admin/team-members");
    const json = await res.json();
    if (json.ok) setMembers(json.members);
    setLoading(false);
  }

  async function fetchInvites() {
    setLoadingInvites(true);
    const res = await fetch("/api/admin/team-invites");
    const json = await res.json();
    if (json.ok) setPendingInvites(json.invites);
    setLoadingInvites(false);
  }

  useEffect(() => {
    fetchMembers();
    fetchInvites();
  }, []);

  async function revokeInvites(ids: string[]) {
    if (ids.length === 0) return;
    const targets = pendingInvites.filter((i) => ids.includes(i.id));
    if (targets.length === 0) return;
    const msg =
      targets.length === 1
        ? "Revoke this invite link? Anyone who already has the link will no longer be able to use it."
        : `Revoke ${targets.length} invite links? Anyone who already has these links will no longer be able to use them.`;
    if (!(await appConfirm(msg))) return;

    await Promise.all(
      targets.map((inv) =>
        fetch("/api/admin/team-invites", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: inv.token }),
        })
      )
    );
    setSelectedInviteIds(new Set());
    fetchInvites();
  }

  async function bulkRemoveMembers(ids: string[]) {
    if (ids.length === 0) return;
    const targets = members.filter((m) => ids.includes(m.id));
    if (targets.length === 0) return;
    if (
      !(await appConfirm(
        targets.length === 1
          ? `Remove ${targets[0].full_name}? This cannot be undone.`
          : `Remove ${targets.length} team members? This cannot be undone.`
      ))
    )
      return;

    await Promise.all(
      targets.map((m) =>
        fetch("/api/admin/team-members", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: m.id }),
        })
      )
    );
    setSelectedMemberIds(new Set());
    fetchMembers();
  }

  async function bulkSetActive(ids: string[], nextActive: boolean) {
    if (ids.length === 0) return;
    await Promise.all(
      ids.map((id) =>
        fetch("/api/admin/team-members", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, is_active: nextActive }),
        })
      )
    );
    setSelectedMemberIds(new Set());
    fetchMembers();
  }

  function toggleMemberSelection(id: string) {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleInviteSelection(id: string) {
    setSelectedInviteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = members.filter((m) =>
    [m.full_name, m.email, m.username, m.department].some((v) =>
      (v || "").toLowerCase().includes(search.toLowerCase())
    )
  );

  async function toggleActive(m: TeamMember) {
    await fetch("/api/admin/team-members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: m.id, is_active: !m.is_active }),
    });
    fetchMembers();
  }

  async function updatePermissions(m: TeamMember, is_sub_admin: boolean, permissions: string[]) {
    await fetch("/api/admin/team-members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: m.id, is_sub_admin, permissions }),
    });
    fetchMembers();
  }

  async function remove(m: TeamMember) {
    if (!(await appConfirm(`Remove ${m.full_name}? This cannot be undone.`))) return;
    await fetch("/api/admin/team-members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: m.id }),
    });
    fetchMembers();
  }

  async function resetFaceCapture(m: TeamMember) {
    if (!(await appConfirm(`Reset face verification for ${m.full_name}? They will need to set up face login again.`))) return;
    const res = await fetch("/api/admin/team-members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: m.id, action: "reset_face_capture" }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      appAlert(json.error || "Could not reset face capture.");
      return;
    }
    await fetchMembers();
  }

  return (
    <div className="p-8 max-w-[1200px]">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-[#0A4FE8] text-sm font-semibold">HRM</p>
          <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">Team Members</h1>
          <p className="text-gray-400 text-[13px] mt-1">
            Create accounts, grant sub-admin access, and share invite links.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => generateSelfServeLink(false)}
            disabled={generatingLink}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-[#0A4FE8]/20 bg-white text-[#0A4FE8] text-sm font-medium rounded-xl hover:bg-blue-50 transition disabled:opacity-50"
            title="Generate a link the teammate fills in themselves"
          >
            {generatingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            Generate invite link
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition"
          >
            <UserPlus className="w-4 h-4" /> Add team member
          </button>
        </div>
      </div>

      {/* Pending invites section */}
      {(pendingInvites.length > 0 || loadingInvites) && (
        <section className="mb-6">
          <BulkActionBar
            selectedCount={selectedInviteIds.size}
            onClear={() => setSelectedInviteIds(new Set())}
            actions={[
              {
                label: "Revoke invites",
                icon: <Trash2 className="w-4 h-4" />,
                onClick: () => revokeInvites(Array.from(selectedInviteIds)),
                variant: "danger",
              },
            ]}
          />
          <div className="rounded-2xl border border-[#0A4FE8]/15 bg-blue-50/40 p-4 md:p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <p className="text-[13px] font-bold text-[#0A4FE8] inline-flex items-center gap-1.5">
                  <Link2 className="w-4 h-4" />
                  Self-serve invite links
                  <span className="text-[#0A4FE8]/60 font-medium">({pendingInvites.length})</span>
                </p>
                <p className="text-[12px] text-[#0A4FE8]/80 mt-0.5">
                  Each link lets a teammate fill in their own name, email, username, password, role, department and phone. Expires in 14 days.
                </p>
              </div>
              {pendingInvites.length > 1 && (
                <label className="inline-flex items-center gap-2 text-[12px] text-[#0A4FE8]/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={
                      pendingInvites.length > 0 &&
                      pendingInvites.every((i) => selectedInviteIds.has(i.id))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedInviteIds(new Set(pendingInvites.map((i) => i.id)));
                      } else {
                        setSelectedInviteIds(new Set());
                      }
                    }}
                    className="w-4 h-4 rounded border-gray-300 text-[#0A4FE8]"
                  />
                  Select all
                </label>
              )}
            </div>

            <div className="space-y-2">
              {pendingInvites.map((inv) => (
                <InviteRow
                  key={inv.id}
                  invite={inv}
                  selected={selectedInviteIds.has(inv.id)}
                  onToggleSelect={() => toggleInviteSelection(inv.id)}
                  highlight={inv.id === lastGeneratedId}
                  onRevoke={() => revokeInvites([inv.id])}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {showForm && (
        <AddMemberForm
          onClose={() => setShowForm(false)}
          onCreated={(payload) => {
            setShareModal(payload);
            setShowForm(false);
            fetchMembers();
          }}
        />
      )}

      {/* Member bulk actions */}
      <BulkActionBar
        selectedCount={selectedMemberIds.size}
        onClear={() => setSelectedMemberIds(new Set())}
        actions={[
          {
            label: "Deactivate",
            icon: <ToggleLeft className="w-4 h-4" />,
            onClick: () => bulkSetActive(Array.from(selectedMemberIds), false),
          },
          {
            label: "Activate",
            icon: <ToggleRight className="w-4 h-4" />,
            onClick: () => bulkSetActive(Array.from(selectedMemberIds), true),
          },
          {
            label: "Remove",
            icon: <Trash2 className="w-4 h-4" />,
            onClick: () => bulkRemoveMembers(Array.from(selectedMemberIds)),
            variant: "danger",
          },
        ]}
      />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          {filtered.length > 0 && (
            <input
              type="checkbox"
              checked={
                filtered.length > 0 && filtered.every((m) => selectedMemberIds.has(m.id))
              }
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedMemberIds(new Set(filtered.map((m) => m.id)));
                } else {
                  setSelectedMemberIds(new Set());
                }
              }}
              className="w-4 h-4 rounded border-gray-300 text-[#0A4FE8] cursor-pointer"
              title="Select all"
            />
          )}
          <Users className="w-4 h-4 text-gray-400" />
          <h2 className="text-[15px] font-semibold text-[#0D1B39]">
            All members <span className="text-gray-400 font-normal">({members.length})</span>
          </h2>
          <div className="ml-auto relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              placeholder="Search members…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-[13px] w-64 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-gray-400 text-sm">
            {members.length === 0
              ? "No team members yet. Click “Add team member” to create one."
              : "No members match your search."}
          </p>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((m) => (
              <MemberRow
                key={m.id}
                m={m}
                selected={selectedMemberIds.has(m.id)}
                onToggleSelect={() => toggleMemberSelection(m.id)}
                onToggleActive={() => toggleActive(m)}
                onPromote={() => setPromotingMember(m)}
                onDelete={() => remove(m)}
                onView={() => setViewingMember(m)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Post-create share modal */}
      <InviteShareModal
        open={!!shareModal}
        payload={shareModal}
        onClose={() => setShareModal(null)}
      />

      {/* Promote / edit permissions modal */}
      {promotingMember && (
        <PromoteMemberModal
          member={promotingMember}
          onClose={() => setPromotingMember(null)}
          onSave={async (isSubAdmin, perms) => {
            await updatePermissions(promotingMember, isSubAdmin, perms);
            setPromotingMember(null);
          }}
        />
      )}

      {/* Full-profile viewer — also exposes suspend / unsuspend */}
      {viewingMember && (
        <MemberProfileModal
          member={viewingMember}
          onClose={() => setViewingMember(null)}
          onSuspend={async () => {
            await toggleActive(viewingMember);
            setViewingMember(null);
          }}
          onResetFace={async () => {
            await resetFaceCapture(viewingMember);
            setViewingMember(null);
          }}
        />
      )}

      <ActivityPanel page="team-members" title="Team member activity" />
    </div>
  );
}

/* ----- Row ----- */

function MemberRow({
  m,
  selected,
  onToggleSelect,
  onToggleActive,
  onPromote,
  onDelete,
  onView,
}: {
  m: TeamMember;
  selected: boolean;
  onToggleSelect: () => void;
  onToggleActive: () => void;
  onPromote: () => void;
  onDelete: () => void;
  onView: () => void;
}) {
  const [showShare, setShowShare] = useState(false);
  const inviteUrl =
    typeof window !== "undefined" && m.invite_token
      ? `${window.location.origin}/team/invite/${m.invite_token}`
      : null;

  return (
    <div
      className={`px-6 py-4 flex items-center gap-4 transition ${
        selected ? "bg-blue-50/50" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        className="w-4 h-4 rounded border-gray-300 text-[#0A4FE8] cursor-pointer shrink-0"
      />
      {m.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={m.avatar_url}
          alt={m.full_name}
          className="w-10 h-10 rounded-full object-cover border border-gray-200"
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-[#0A4FE8] text-white text-sm font-bold flex items-center justify-center">
          {m.full_name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[14px] font-semibold text-[#0D1B39]">{m.full_name}</p>
          <MemberStatusBadge status={m.availability_status || "offline"} />
          {m.is_sub_admin && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#0A4FE8] text-white inline-flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Sub-admin
            </span>
          )}
          {!m.is_active && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
              Inactive
            </span>
          )}
          {!m.invite_filled && m.invite_token && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
              Pending invite
            </span>
          )}
        </div>
        <p className="text-[12px] text-gray-500">
          @{m.username} · {m.email}
        </p>
        {(m.role_title || m.department) && (
          <p className="text-[11px] text-gray-400 mt-0.5">
            {m.role_title}
            {m.role_title && m.department && " · "}
            {m.department}
          </p>
        )}

        {inviteUrl && showShare && (
          <InlineShare url={inviteUrl} username={m.username} fullName={m.full_name} />
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {inviteUrl && (
          <button
            onClick={() => setShowShare((s) => !s)}
            className={`p-2 rounded-lg transition ${
              showShare
                ? "text-[#0A4FE8] bg-blue-50"
                : "text-gray-300 hover:text-[#0A4FE8] hover:bg-blue-50"
            }`}
            title={showShare ? "Hide share options" : "Share invite link"}
          >
            <Share2 className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={onView}
          className="p-2 rounded-lg text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50 transition"
          title="View full profile"
        >
          <Eye className="w-4 h-4" />
        </button>
        <button
          onClick={onPromote}
          className={`p-2 rounded-lg transition ${
            m.is_sub_admin
              ? "text-[#0A4FE8] bg-blue-50"
              : "text-gray-300 hover:text-[#0A4FE8] hover:bg-blue-50"
          }`}
          title={m.is_sub_admin ? "Edit sub-admin permissions" : "Promote to sub-admin"}
        >
          <ShieldCheck className="w-4 h-4" />
        </button>
        <button
          onClick={onToggleActive}
          className={`p-2 rounded-lg transition ${
            m.is_active ? "text-emerald-500 hover:bg-emerald-50" : "text-amber-500 hover:bg-amber-50"
          }`}
          title={m.is_active ? "Suspend / lock account" : "Unsuspend account"}
        >
          {m.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function MemberStatusBadge({ status }: { status: "online" | "offline" | "break" }) {
  const meta = {
    online: { label: "Online", className: "bg-emerald-50 text-emerald-700 border-emerald-100", dot: "bg-emerald-500" },
    offline: { label: "Offline", className: "bg-gray-50 text-gray-500 border-gray-100", dot: "bg-gray-400" },
    break: { label: "Break", className: "bg-amber-50 text-amber-700 border-amber-100", dot: "bg-amber-500" },
  }[status];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${meta.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

/* ----- Invite Row ----- */

function InviteRow({
  invite,
  selected,
  onToggleSelect,
  onRevoke,
  highlight,
}: {
  invite: PendingInvite;
  selected: boolean;
  onToggleSelect: () => void;
  onRevoke: () => void;
  highlight?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/team/invite/${invite.token}`
      : `/team/invite/${invite.token}`;
  const message = `You've been invited to join CDS Space. Click to set up your account: ${url}`;
  const createdDays = Math.max(
    0,
    Math.round((Date.now() - new Date(invite.created_at).getTime()) / 86_400_000)
  );
  const expiresDays = Math.max(
    0,
    Math.round((new Date(invite.expires_at).getTime() - Date.now()) / 86_400_000)
  );

  return (
    <div
      id={`invite-${invite.id}`}
      className={`bg-white rounded-xl p-3 border flex items-center gap-2 flex-wrap transition ${
        selected
          ? "border-[#0A4FE8]/40 ring-2 ring-[#0A4FE8]/15"
          : highlight
            ? "border-[#0A4FE8]/40 ring-2 ring-[#0A4FE8]/15 animate-in fade-in-50"
            : "border-[#0A4FE8]/20"
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        className="w-4 h-4 rounded border-gray-300 text-[#0A4FE8] cursor-pointer shrink-0"
      />

      <div className="flex-1 min-w-[240px]">
        <p className="font-mono text-[11px] text-gray-700 break-all">{url}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {invite.is_sub_admin ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#0A4FE8] text-white">
              <ShieldCheck className="w-3 h-3" /> Sub-admin
            </span>
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
              Member
            </span>
          )}
          <span className="text-[10.5px] text-gray-400">
            Created {createdDays === 0 ? "today" : `${createdDays}d ago`} · Expires in{" "}
            {expiresDays}d
          </span>
        </div>
      </div>

      <button
        onClick={() => {
          navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A4FE8] text-white text-[12px] font-medium hover:bg-[#083EC0] transition"
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(message)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#25D366] text-white text-[12px] font-semibold hover:bg-[#20bf5a] transition"
        title="Share via WhatsApp"
      >
        <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
      </a>
      <a
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A66C2] text-white text-[12px] font-semibold hover:bg-[#084d93] transition"
        title="Share via LinkedIn"
      >
        <Linkedin className="w-3.5 h-3.5" /> LinkedIn
      </a>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1877F2] text-white text-[12px] font-semibold hover:bg-[#145ec1] transition"
        title="Share via Facebook"
      >
        <Facebook className="w-3.5 h-3.5" /> Facebook
      </a>
      <button
        onClick={onRevoke}
        className="shrink-0 p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
        title="Revoke this invite link"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function InlineShare({
  url,
  username,
  fullName,
}: {
  url: string;
  username: string;
  fullName: string;
}) {
  const [copied, setCopied] = useState(false);
  const msg = `You've been invited to join CDS Space, ${fullName}. Set up your account here: ${url}`;

  return (
    <div className="mt-2 rounded-xl bg-blue-50/60 border border-[#0A4FE8]/15 p-3 flex items-center gap-2 flex-wrap">
      <code className="flex-1 min-w-[200px] text-[11px] font-mono text-gray-600 truncate">
        {url}
      </code>
      <button
        onClick={() => {
          navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#0A4FE8]/20 text-[#0A4FE8] text-[11px] font-semibold hover:bg-blue-50 transition"
        title="Copy invite link"
      >
        {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(msg)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#25D366] text-white text-[11px] font-semibold hover:bg-[#20bf5a] transition"
      >
        <MessageCircle className="w-3 h-3" /> WhatsApp
      </a>
      <a
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0A66C2] text-white text-[11px] font-semibold hover:bg-[#084d93] transition"
      >
        <Linkedin className="w-3 h-3" /> LinkedIn
      </a>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1877F2] text-white text-[11px] font-semibold hover:bg-[#145ec1] transition"
      >
        <Facebook className="w-3 h-3" /> Facebook
      </a>
      <span className="text-[10px] text-gray-500 font-mono">@{username}</span>
    </div>
  );
}

/* ----- Create form ----- */

function AddMemberForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (p: InviteSharePayload) => void;
}) {
  const [full_name, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role_title, setRoleTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [phone, setPhone] = useState("");
  const [is_sub_admin, setIsSubAdmin] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [send_invite, setSendInvite] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Role picker
  const [roles, setRoles] = useState<{ id: string; name: string; description: string | null; permissions: string[] }[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [showNewRole, setShowNewRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [newRolePerms, setNewRolePerms] = useState<string[]>([]);
  const [savingRole, setSavingRole] = useState(false);

  async function refreshRoles() {
    try {
      const r = await fetch("/api/admin/roles");
      const d = await r.json();
      if (r.ok) setRoles(d.roles ?? []);
    } catch { /* no-op */ }
  }

  const [availableDepartments, setAvailableDepartments] = useState<{ id: string; name: string }[]>([]);
  async function refreshDepartments() {
    try {
      const r = await fetch("/api/admin/departments");
      const d = await r.json();
      if (r.ok) setAvailableDepartments(d.departments ?? []);
    } catch { /* no-op */ }
  }

  useEffect(() => { 
    refreshRoles(); 
    refreshDepartments();
  }, []);

  function pickRole(id: string) {
    setSelectedRoleId(id);
    if (!id) {
      setIsSubAdmin(false);
      setPermissions([]);
      return;
    }
    const role = roles.find((r) => r.id === id);
    if (role) {
      setIsSubAdmin(true);
      setPermissions(role.permissions ?? []);
    }
  }

  async function createRoleInline(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const name = newRoleName.trim();
    if (!name) { setError("Role name is required."); return; }
    setSavingRole(true);
    try {
      const r = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: newRoleDesc.trim() || null,
          permissions: newRolePerms,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Couldn't create role."); return; }
      await refreshRoles();
      pickRole(d.role.id);
      setShowNewRole(false);
      setNewRoleName("");
      setNewRoleDesc("");
      setNewRolePerms([]);
    } finally {
      setSavingRole(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (is_sub_admin && permissions.length === 0) {
      setError("Select at least one permission for this sub-admin.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/admin/team-members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name,
        email,
        username,
        password: password || undefined,
        role_title,
        department,
        phone,
        is_sub_admin,
        permissions,
        send_invite,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(json.error || "Failed to create member");
      return;
    }
    onCreated({
      full_name,
      email,
      username: username.toLowerCase(),
      invite_token: json.invite_token,
      password: json.configured_password ?? null,
      origin: typeof window !== "undefined" ? window.location.origin : "",
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-[15px] font-semibold text-[#0D1B39]">Add team member</h2>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Full name *" value={full_name} onChange={setFullName} required />
          <Field label="Email *" value={email} onChange={setEmail} type="email" required />
          <Field
            label="Username *"
            value={username}
            onChange={(v) => setUsername(v.toLowerCase())}
            required
            placeholder="e.g. jane.doe"
            hint="Public profile at cdsspace.pro/{username}"
          />
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Temp password{" "}
              <span className="text-gray-400">(auto-generated if blank)</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank to auto-generate"
                className="w-full px-4 py-2.5 pr-10 rounded-xl bg-gray-50 border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <Field label="Role / Title" value={role_title} onChange={setRoleTitle} placeholder="e.g. Creative Director" />
          
          <div className="flex flex-col gap-1.5">
            <label className="block text-xs font-medium text-gray-500">Department</label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
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

        {/* Role picker (replaces the old "Grant sub-admin access" checkbox) */}
        <div className="pt-2">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            Role <span className="text-gray-300">(pick a role to grant sub-admin access with its permissions)</span>
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedRoleId}
              onChange={(e) => pickRole(e.target.value)}
              className="flex-1 min-w-[240px] px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[13px] text-[#0D1B39] focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
            >
              <option value="">— No role (regular team member) —</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.permissions.length} perm{r.permissions.length === 1 ? "" : "s"})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowNewRole(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#0A4FE8]/30 bg-white text-[#0A4FE8] text-[13px] font-semibold hover:bg-blue-50 transition"
            >
              <Plus className="w-3.5 h-3.5" /> Create role
            </button>
          </div>
          {selectedRoleId && (
            <p className="text-[11.5px] text-gray-500 mt-1.5">
              Permissions below are pre-filled from <strong>{roles.find((r) => r.id === selectedRoleId)?.name}</strong>.
              Tweak anything before saving.
            </p>
          )}
        </div>

        <div className="flex items-center gap-6 pt-2 flex-wrap">
          <label className="inline-flex items-center gap-2 text-[13px] text-[#0D1B39] cursor-pointer">
            <input
              type="checkbox"
              checked={send_invite}
              onChange={(e) => setSendInvite(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-[#0A4FE8]"
            />
            Generate invite link (so you can share credentials)
          </label>
        </div>

        {is_sub_admin && (
          <div className="rounded-2xl border border-[#0A4FE8]/20 bg-blue-50/40 p-4 mt-2">
            <SubAdminPermissionsPicker value={permissions} onChange={setPermissions} />
          </div>
        )}

        {showNewRole && (
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !savingRole && setShowNewRole(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-[#0D1B39]">Create role</h3>
                  <p className="text-[12px] text-gray-500">
                    Bundle permissions now so you can reuse them on future team members.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !savingRole && setShowNewRole(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Role name</label>
                    <input
                      value={newRoleName}
                      onChange={(e) => setNewRoleName(e.target.value)}
                      placeholder="e.g. Finance Manager"
                      className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Description</label>
                    <input
                      value={newRoleDesc}
                      onChange={(e) => setNewRoleDesc(e.target.value)}
                      placeholder="Short internal note"
                      className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
                    />
                  </div>
                </div>
                <SubAdminPermissionsPicker value={newRolePerms} onChange={setNewRolePerms} />
              </div>
              <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50/50">
                <button
                  type="button"
                  disabled={savingRole}
                  onClick={() => setShowNewRole(false)}
                  className="px-5 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingRole}
                  onClick={createRoleInline}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#0A4FE8] text-white text-sm font-semibold hover:bg-[#083EC0] transition disabled:opacity-50"
                >
                  {savingRole ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {savingRole ? "Creating…" : "Create role & apply"}
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[12px] px-4 py-2.5">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2 flex-wrap">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0A4FE8] text-white text-[13px] font-medium rounded-xl hover:bg-[#083EC0] transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create member
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

/* ----- Promote / edit permissions modal ----- */

function PromoteMemberModal({
  member,
  onClose,
  onSave,
}: {
  member: TeamMember;
  onClose: () => void;
  onSave: (isSubAdmin: boolean, permissions: string[]) => Promise<void>;
}) {
  const [isSubAdmin, setIsSubAdmin] = useState(member.is_sub_admin);
  const [permissions, setPermissions] = useState<string[]>(
    member.permissions.length ? member.permissions : member.is_sub_admin ? ["dashboard"] : []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Role management (Added) ---
  const [roles, setRoles] = useState<{ id: string; name: string; description: string | null; permissions: string[] }[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [showNewRole, setShowNewRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [newRolePerms, setNewRolePerms] = useState<string[]>([]);
  const [savingRole, setSavingRole] = useState(false);

  async function refreshRoles() {
    try {
      const r = await fetch("/api/admin/roles");
      const d = await r.json();
      if (r.ok) setRoles(d.roles ?? []);
    } catch { /* no-op */ }
  }
  useEffect(() => { refreshRoles(); }, []);

  function pickRole(id: string) {
    setSelectedRoleId(id);
    if (!id) {
      if (isSubAdmin) setPermissions(["dashboard"]);
      return;
    }
    const role = roles.find((r) => r.id === id);
    if (role) {
      setIsSubAdmin(true);
      setPermissions(role.permissions ?? []);
    }
  }

  async function createRoleInline(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const name = newRoleName.trim();
    if (!name) { setError("Role name is required."); return; }
    setSavingRole(true);
    try {
      const r = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: newRoleDesc.trim() || null,
          permissions: newRolePerms,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Couldn't create role."); return; }
      await refreshRoles();
      pickRole(d.role.id);
      setShowNewRole(false);
      setNewRoleName("");
      setNewRoleDesc("");
      setNewRolePerms([]);
    } finally {
      setSavingRole(false);
    }
  }
  // --- End Role management ---

  async function save() {
    setError(null);
    if (isSubAdmin && permissions.length === 0) {
      setError("Select at least one permission.");
      return;
    }
    setSaving(true);
    await onSave(isSubAdmin, isSubAdmin ? permissions : []);
    setSaving(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
          <div>
            <p className="text-[#0A4FE8] text-[11px] uppercase tracking-wider font-bold">
              Sub-admin access
            </p>
            <h2 className="text-[18px] font-bold text-[#0D1B39] mt-0.5">
              {member.is_sub_admin ? "Edit permissions" : "Promote"} · {member.full_name}
            </h2>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Pick the admin sections this teammate can access. Anything unticked stays hidden from
              their sidebar.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <label className="inline-flex items-center gap-2 text-[13px] text-[#0D1B39] cursor-pointer">
            <input
              type="checkbox"
              checked={isSubAdmin}
              onChange={(e) => {
                setIsSubAdmin(e.target.checked);
                if (!e.target.checked) {
                  setPermissions([]);
                  setSelectedRoleId("");
                } else if (permissions.length === 0) {
                  setPermissions(["dashboard"]);
                }
              }}
              className="w-4 h-4 rounded border-gray-300 text-[#0A4FE8]"
            />
            <ShieldCheck className="w-4 h-4 text-[#0A4FE8]" />
            This member is a sub-admin
          </label>

          {isSubAdmin && (
            <div className="space-y-4 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-tight mb-1.5">
                  Assign a role
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedRoleId}
                    onChange={(e) => pickRole(e.target.value)}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
                  >
                    <option value="">— Manual permissions —</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.permissions.length} perms)
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowNewRole(true)}
                    className="p-2.5 rounded-xl border border-gray-200 text-[#0A4FE8] hover:bg-white transition shadow-sm"
                    title="Create new role"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {selectedRoleId && (
                  <p className="text-[11px] text-gray-500 mt-1.5 px-1 truncate">
                    Settings permissions for <strong>{roles.find(r => r.id === selectedRoleId)?.name}</strong>
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-gray-100 bg-gray-50/30 p-4">
                <SubAdminPermissionsPicker value={permissions} onChange={setPermissions} />
              </div>
            </div>
          )}

          {showNewRole && (
            <div
              className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => !savingRole && setShowNewRole(false)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
              >
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-[#0D1B39]">Create role</h3>
                    <p className="text-[12px] text-gray-500">
                      Bundle permissions for reuse.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => !savingRole && setShowNewRole(false)}
                    className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Role name</label>
                      <input
                        value={newRoleName}
                        onChange={(e) => setNewRoleName(e.target.value)}
                        placeholder="e.g. Content Manager"
                        className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Description</label>
                      <input
                        value={newRoleDesc}
                        onChange={(e) => setNewRoleDesc(e.target.value)}
                        placeholder="Optional note"
                        className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition"
                      />
                    </div>
                  </div>
                  <SubAdminPermissionsPicker value={newRolePerms} onChange={setNewRolePerms} />
                </div>
                <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50">
                  <button
                    type="button"
                    disabled={savingRole}
                    onClick={() => setShowNewRole(false)}
                    className="px-5 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={savingRole}
                    onClick={createRoleInline}
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#0A4FE8] text-white text-sm font-semibold hover:bg-[#083EC0] transition shadow-lg shadow-blue-500/20"
                  >
                    {savingRole ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Create and apply
                  </button>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[12px] px-4 py-2.5">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-xl hover:bg-white transition"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0A4FE8] text-white text-[13px] font-medium rounded-xl hover:bg-[#083EC0] transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* ----- Small field helper ----- */

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

function FaceReviewCard({
  member,
  onResetFace,
}: {
  member: TeamMember;
  onResetFace: () => void | Promise<void>;
}) {
  const review = member.face_review;
  const flagged = Boolean(review?.latest_verification_flag && review.latest_verification_flag !== "reset_required");
  const resetRequired = review?.status === "reset_required" || review?.latest_verification_flag === "reset_required";
  const matchScore = review?.latest_match_score == null ? null : Number(review.latest_match_score);
  const livenessScore = review?.latest_liveness_score == null ? null : Number(review.latest_liveness_score);

  return (
    <div className="mx-6 mb-5 rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
            <Camera className="h-3.5 w-3.5 text-[#0A4FE8]" />
            Face verification
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                resetRequired
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : flagged
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : review?.status === "active"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-gray-200 bg-white text-gray-500"
              }`}
            >
              {resetRequired ? "Reset required" : flagged ? "Mismatch flagged" : review?.status || "Not enrolled"}
            </span>
            {review?.verification_failures ? (
              <span className="text-[11px] font-semibold text-rose-600">
                {review.verification_failures} failed attempt{review.verification_failures === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onResetFace}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-white px-3 text-[12px] font-bold text-amber-700 transition hover:bg-amber-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset capture
        </button>
      </div>

      {flagged && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] leading-5 text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Latest login capture did not match the first approved face setup.
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <FaceImage title="First setup capture" src={review?.enrollment_image_data || null} date={review?.enrolled_at || null} />
        <FaceImage title="Latest login capture" src={review?.latest_capture_image_data || null} date={review?.latest_capture_at || review?.last_verified_at || null} />
      </div>

      <div className="mt-4 grid gap-2 text-[12px] sm:grid-cols-3">
        <FaceMetric label="Match score" value={matchScore == null ? "—" : matchScore.toFixed(3)} />
        <FaceMetric label="Liveness" value={livenessScore == null ? "—" : livenessScore.toFixed(3)} />
        <FaceMetric label="Last verified" value={review?.last_verified_at ? new Date(review.last_verified_at).toLocaleString() : "—"} />
      </div>
    </div>
  );
}

function FaceImage({ title, src, date }: { title: string; src: string | null; date: string | null }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white bg-white shadow-sm">
      <div className="aspect-[4/3] bg-gray-100">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[12px] font-semibold text-gray-400">
            No capture
          </div>
        )}
      </div>
      <div className="px-3 py-2">
        <p className="text-[12px] font-bold text-[#0D1B39]">{title}</p>
        <p className="mt-0.5 text-[10.5px] text-gray-400">
          {date ? new Date(date).toLocaleString() : "Not available"}
        </p>
      </div>
    </div>
  );
}

function FaceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white bg-white px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-1 break-words text-[12px] font-semibold text-[#0D1B39]">{value}</p>
    </div>
  );
}

/* ----- Member profile viewer ----- */

function MemberProfileModal({
  member,
  onClose,
  onSuspend,
  onResetFace,
}: {
  member: TeamMember;
  onClose: () => void;
  onSuspend: () => void | Promise<void>;
  onResetFace: () => void | Promise<void>;
}) {
  const fields: Array<{ label: string; value: string | null | undefined }> = [
    { label: "Full name", value: member.full_name },
    { label: "Username", value: `@${member.username}` },
    { label: "Email", value: member.email },
    { label: "Phone", value: member.phone },
    { label: "Role", value: member.role_title },
    { label: "Department", value: member.department },
    { label: "Joined", value: member.joined_at ? new Date(member.joined_at).toLocaleDateString() : null },
    { label: "Created", value: member.created_at ? new Date(member.created_at).toLocaleString() : null },
  ];

  const status = !member.is_active
    ? { label: "Suspended", cls: "bg-amber-50 text-amber-700 border-amber-100" }
    : member.is_sub_admin
      ? { label: "Sub-admin", cls: "bg-blue-50 text-[#0A4FE8] border-blue-100" }
      : { label: "Active", cls: "bg-emerald-50 text-emerald-700 border-emerald-100" };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-4">
          {member.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={member.avatar_url}
              alt={member.full_name}
              className="w-14 h-14 rounded-full object-cover border border-gray-200"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-[#0A4FE8] text-white text-lg font-bold flex items-center justify-center">
              {member.full_name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[16px] font-semibold text-[#0D1B39] truncate">{member.full_name}</p>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${status.cls}`}>
                {status.label}
              </span>
            </div>
            <p className="text-[13px] text-gray-500 truncate">{member.email}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 grid grid-cols-2 gap-4">
          {fields.map((f) => (
            <div key={f.label}>
              <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">{f.label}</div>
              <div className="text-[13px] text-[#0D1B39] break-words">{f.value || "—"}</div>
            </div>
          ))}
        </div>

        {member.is_sub_admin && member.permissions?.length > 0 && (
          <div className="px-6 pb-5">
            <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Sub-admin permissions</div>
            <div className="flex flex-wrap gap-1.5">
              {member.permissions.map((p) => (
                <span key={p} className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-[#0A4FE8] border border-blue-100">
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}

        <FaceReviewCard member={member} onResetFace={onResetFace} />

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2 bg-gray-50/60">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition"
          >
            Close
          </button>
          <button
            onClick={onSuspend}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${
              member.is_active
                ? "bg-amber-500 text-white hover:bg-amber-600"
                : "bg-emerald-500 text-white hover:bg-emerald-600"
            }`}
          >
            {member.is_active ? "Suspend account" : "Unsuspend"}
          </button>
        </div>
      </div>
    </div>
  );
}
