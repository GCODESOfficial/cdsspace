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
} from "lucide-react";
import {
  InviteShareModal,
  type InviteSharePayload,
} from "@/components/admin/InviteShareModal";
import { SubAdminPermissionsPicker } from "@/components/admin/SubAdminPermissionsPicker";
import BulkActionBar from "@/components/admin/BulkActionBar";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";

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
                  Each link lets a teammate fill in their own name, email, username and password. Expires in 14 days.
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
}: {
  m: TeamMember;
  selected: boolean;
  onToggleSelect: () => void;
  onToggleActive: () => void;
  onPromote: () => void;
  onDelete: () => void;
}) {
  const [showShare, setShowShare] = useState(false);
  const inviteUrl =
    typeof window !== "undefined" && m.invite_token
      ? `${window.location.origin}/team/login?invite=${m.invite_token}`
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
            m.is_active ? "text-emerald-500 hover:bg-emerald-50" : "text-gray-300 hover:bg-gray-100"
          }`}
          title={m.is_active ? "Deactivate" : "Activate"}
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
  const msg = `Welcome to CDS Space, ${fullName}! Sign in here (pre-filled): ${url}`;

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
          <Field label="Role / Title" value={role_title} onChange={setRoleTitle} />
          <Field label="Department" value={department} onChange={setDepartment} />
          <Field label="Phone" value={phone} onChange={setPhone} />
        </div>

        <div className="flex items-center gap-6 pt-2 flex-wrap">
          <label className="inline-flex items-center gap-2 text-[13px] text-[#0D1B39] cursor-pointer">
            <input
              type="checkbox"
              checked={is_sub_admin}
              onChange={(e) => {
                setIsSubAdmin(e.target.checked);
                if (!e.target.checked) setPermissions([]);
                else if (permissions.length === 0) setPermissions(["dashboard"]);
              }}
              className="w-4 h-4 rounded border-gray-300 text-[#0A4FE8]"
            />
            Grant sub-admin access
          </label>
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
                if (!e.target.checked) setPermissions([]);
                else if (permissions.length === 0) setPermissions(["dashboard"]);
              }}
              className="w-4 h-4 rounded border-gray-300 text-[#0A4FE8]"
            />
            <ShieldCheck className="w-4 h-4 text-[#0A4FE8]" />
            This member is a sub-admin
          </label>

          {isSubAdmin && (
            <SubAdminPermissionsPicker value={permissions} onChange={setPermissions} />
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
