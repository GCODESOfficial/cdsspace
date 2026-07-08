"use client";

import { useEffect, useMemo, useState } from "react";
import { initials } from "@/lib/utils";
import Link from "next/link";
import {
    Users,
    Building2,
    Plus,
    Trash2,
    FileText,
    Shield,
    Link as LinkIcon,
    MessageSquare,
    Video,
    Calendar,
    Copy,
    X,
    Check,
    ExternalLink,
} from "lucide-react";
import { glassCard } from "@/components/finance/FinanceShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { appAlert, appConfirm } from "@/lib/app-notify";

interface Member {
    id: string;
    full_name: string;
    email: string;
    role_title: string | null;
    department: string | null;
    avatar_url: string | null;
    is_active: boolean;
}

interface Assignment {
    id: string;
    team_member_id: string | null;
    department: string | null;
    role: string | null;
    created_at: string;
    team_members: Member | null;
}

interface ProjectDocument {
    id: string;
    kind: "cdoc" | "protected" | "link";
    title: string;
    cdoc_id: string | null;
    protected_doc_id: string | null;
    file_url: string | null;
    added_by: string | null;
    created_at: string;
    cdoc?: { id: string; title: string; updated_at: string } | null;
    protected_doc?: { id: string; title: string; file_url: string } | null;
}

interface CDoc {
    id: string;
    title: string;
}

interface ProtectedDoc {
    id: string;
    title: string;
}

interface ProjectMeeting {
    id: string;
    room_code: string;
    title: string;
    agenda: string | null;
    scheduled_for: string | null;
    status: string;
    started_at: string | null;
    created_at: string;
}

type DocumentOptionPayload = {
    data?: { docs?: CDoc[] } | CDoc[];
    docs?: CDoc[];
};

function normalizeDocumentOptions(payload: DocumentOptionPayload): CDoc[] {
    const docs = Array.isArray(payload.data) ? payload.data : payload.data?.docs ?? payload.docs ?? [];
    return docs
        .filter((doc): doc is CDoc => Boolean(doc?.id && doc?.title))
        .map((doc) => ({ id: doc.id, title: doc.title }));
}

export function ProjectCollaborationPanel({ projectId }: { projectId: string }) {
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [departments, setDepartments] = useState<string[]>([]);
    const [documents, setDocuments] = useState<ProjectDocument[]>([]);
    const [cdocs, setCdocs] = useState<CDoc[]>([]);
    const [protectedDocs, setProtectedDocs] = useState<ProtectedDoc[]>([]);
    const [meetings, setMeetings] = useState<ProjectMeeting[]>([]);
    const [chatThreadId, setChatThreadId] = useState<string | null>(null);

    const [showAssign, setShowAssign] = useState(false);
    const [showDoc, setShowDoc] = useState(false);
    const [showMeeting, setShowMeeting] = useState(false);

    const loadAll = async () => {
        await Promise.all([loadAssignments(), loadDocuments(), loadMeetings(), loadChat()]);
    };

    const loadAssignments = async () => {
        const r = await fetch(`/api/admin/finance/projects/${projectId}/assignments`);
        if (r.ok) {
            const d = await r.json();
            setAssignments(d.assignments ?? []);
        }
    };
    const loadDocuments = async () => {
        const r = await fetch(`/api/admin/finance/projects/${projectId}/documents`);
        if (r.ok) {
            const d = await r.json();
            setDocuments(d.documents ?? []);
        }
    };
    const loadMeetings = async () => {
        const r = await fetch(`/api/admin/finance/projects/${projectId}/meetings`);
        if (r.ok) {
            const d = await r.json();
            setMeetings(d.meetings ?? []);
        }
    };
    const loadChat = async () => {
        const r = await fetch(`/api/admin/finance/projects/${projectId}/chat`);
        if (r.ok) {
            const d = await r.json();
            setChatThreadId(d.thread?.id ?? null);
        }
    };

    useEffect(() => {
        loadAll();
        // Prime the option lists for the modals
        (async () => {
            const membersRes = await fetch("/api/admin/team-members").then((r) => r.json());
            const ms: Member[] = membersRes.members ?? membersRes.data ?? [];
            setMembers(ms.filter((m: Member) => m.is_active));
            // Prefer the canonical departments table (covers multi-department
            // members via team_member_departments); fall back to the members'
            // legacy single-department field if the endpoint fails.
            try {
                const deptRes = await fetch("/api/admin/departments").then((r) => r.json());
                const names = (deptRes.departments ?? [])
                    .map((d: { name?: string }) => d.name)
                    .filter((x: unknown): x is string => !!x);
                if (names.length) {
                    setDepartments(names);
                } else {
                    throw new Error("no departments");
                }
            } catch {
                setDepartments(Array.from(
                    new Set(ms.map((m: Member) => m.department).filter((x): x is string => !!x)),
                ));
            }

            const [cdocsRes, protRes] = await Promise.all([
                fetch("/api/team/cdocs").then((r) => r.ok ? r.json() : { data: [] }).catch(() => ({ data: [] })),
                fetch("/api/team/protect-docs").then((r) => r.ok ? r.json() : { data: [] }).catch(() => ({ data: [] })),
            ]);
            setCdocs(normalizeDocumentOptions(cdocsRes));
            setProtectedDocs(normalizeDocumentOptions(protRes));
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId]);

    const unassignedMembers = useMemo(() => {
        const taken = new Set(assignments.map((a) => a.team_member_id).filter(Boolean));
        return members.filter((m) => !taken.has(m.id));
    }, [members, assignments]);

    const unassignedDepts = useMemo(() => {
        const taken = new Set(
            assignments
                .map((a) => (a.department || "").toLowerCase())
                .filter(Boolean),
        );
        return departments.filter((d) => !taken.has(d.toLowerCase()));
    }, [departments, assignments]);

    const removeAssignment = async (a: Assignment) => {
        if (!(await appConfirm("Remove this assignment?"))) return;
        await fetch(`/api/admin/finance/projects/${projectId}/assignments/${a.id}`, { method: "DELETE" });
        loadAssignments();
    };
    const removeDocument = async (d: ProjectDocument) => {
        if (!(await appConfirm("Detach this document from the project?"))) return;
        await fetch(`/api/admin/finance/projects/${projectId}/documents/${d.id}`, { method: "DELETE" });
        loadDocuments();
    };
    const cancelMeeting = async (m: ProjectMeeting) => {
        if (!(await appConfirm("Cancel this meeting?"))) return;
        await fetch(`/api/admin/finance/projects/${projectId}/meetings/${m.id}`, { method: "DELETE" });
        loadMeetings();
    };

    const startInstantChat = async () => {
        const r = await fetch(`/api/admin/finance/projects/${projectId}/chat`, { method: "POST" });
        const d = await r.json();
        if (!r.ok) return appAlert(d.error || "Couldn't start chat.");
        setChatThreadId(d.thread?.id ?? null);
        appAlert("Project chat ready - team members will see it in their team chat.");
    };

    return (
        <div className="space-y-6">
            {/* Assignments */}
            <div className={`${glassCard} p-6`}>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-[15px] font-semibold text-[#0D1B39] flex items-center gap-2">
                            <Users className="w-4 h-4" /> Assignees
                        </h3>
                        <p className="text-[12px] text-gray-500">
                            Add a team member, or an entire department - every active member in that department
                            will see the project automatically.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <Link
                            href={`/admin/announcements?audience=project&projectId=${projectId}`}
                            className="inline-flex h-10 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 px-4 text-[13px] font-semibold text-[#0A4FE8] transition hover:bg-blue-100"
                        >
                            <MessageSquare className="w-4 h-4 mr-1.5" /> Announce
                        </Link>
                        <Button
                            onClick={() => setShowAssign(true)}
                            className="rounded-xl bg-[#0A4FE8] hover:bg-[#083EC0]"
                        >
                            <Plus className="w-4 h-4 mr-1.5" /> Assign
                        </Button>
                    </div>
                </div>
                {assignments.length === 0 ? (
                    <p className="text-center py-8 text-[12.5px] text-gray-400">
                        No assignees yet.
                    </p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {assignments.map((a) => (
                            <div
                                key={a.id}
                                className="rounded-xl border border-gray-200 bg-white p-3 flex items-center gap-3"
                            >
                                <div
                                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-[13px] font-bold shrink-0 ${
                                        a.team_member_id
                                            ? "bg-[#0A4FE8]/10 text-[#0A4FE8]"
                                            : "bg-amber-50 text-amber-700"
                                    }`}
                                >
                                    {a.team_member_id ? (
                                        a.team_members?.full_name ? initials(a.team_members.full_name) : "?"
                                    ) : (
                                        <Building2 className="w-4 h-4" />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-[13px] font-semibold text-[#0D1B39] truncate">
                                        {a.team_member_id
                                            ? a.team_members?.full_name ?? "Unknown member"
                                            : `${a.department} department`}
                                    </div>
                                    <div className="text-[11px] text-gray-400 truncate">
                                        {a.team_member_id
                                            ? [a.team_members?.role_title, a.team_members?.department]
                                                  .filter(Boolean)
                                                  .join(" · ") || a.team_members?.email
                                            : "Everyone in this department"}
                                        {a.role ? ` · ${a.role}` : ""}
                                    </div>
                                </div>
                                <button
                                    onClick={() => removeAssignment(a)}
                                    className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                                    title="Remove"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Documents */}
            <div className={`${glassCard} p-6`}>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-[15px] font-semibold text-[#0D1B39] flex items-center gap-2">
                            <FileText className="w-4 h-4" /> Documents
                        </h3>
                        <p className="text-[12px] text-gray-500">
                            Attach internal docs, protected (password-gated) docs, or external links.
                        </p>
                    </div>
                    <Button onClick={() => setShowDoc(true)} className="rounded-xl bg-[#0A4FE8] hover:bg-[#083EC0]">
                        <Plus className="w-4 h-4 mr-1.5" /> Attach
                    </Button>
                </div>
                {documents.length === 0 ? (
                    <p className="text-center py-8 text-[12.5px] text-gray-400">
                        No documents attached yet.
                    </p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {documents.map((d) => {
                            const Icon = d.kind === "protected" ? Shield : d.kind === "link" ? LinkIcon : FileText;
                            const href =
                                d.kind === "cdoc"
                                    ? `/team/cdocs/${d.cdoc_id}`
                                    : d.kind === "protected"
                                      ? `/team/protect-docs`
                                      : d.file_url ?? "#";
                            return (
                                <div
                                    key={d.id}
                                    className="rounded-xl border border-gray-200 bg-white p-3 flex items-center gap-3"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                                        <Icon className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[13px] font-semibold text-[#0D1B39] truncate">{d.title}</div>
                                        <div className="text-[11px] text-gray-400 truncate capitalize">
                                            {d.kind === "cdoc" ? "cDoc" : d.kind === "protected" ? "Protected doc" : "External link"}
                                            {" · "}
                                            {new Date(d.created_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                    <a
                                        href={href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-2 rounded-lg text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50 transition"
                                        title="Open"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                    </a>
                                    <button
                                        onClick={() => removeDocument(d)}
                                        className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                                        title="Detach"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Chat + meetings */}
            <div className={`${glassCard} p-6`}>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-[15px] font-semibold text-[#0D1B39] flex items-center gap-2">
                            <MessageSquare className="w-4 h-4" /> Chat &amp; Group Call
                        </h3>
                        <p className="text-[12px] text-gray-500">
                            Start a project chat or kick off a call - now or on a schedule. Everyone assigned above gets added.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={startInstantChat} className="rounded-xl">
                            <MessageSquare className="w-4 h-4 mr-1.5" />
                            {chatThreadId ? "Open Project Chat" : "Start Chat"}
                        </Button>
                        <Button onClick={() => setShowMeeting(true)} className="rounded-xl bg-[#0A4FE8] hover:bg-[#083EC0]">
                            <Video className="w-4 h-4 mr-1.5" /> New Meeting
                        </Button>
                    </div>
                </div>

                {chatThreadId && (
                    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                            <Check className="w-4 h-4" />
                        </div>
                        <div className="text-[12.5px] text-emerald-800 flex-1">
                            A project chat thread is live. Everyone assigned sees it under <strong>Team Chat</strong> in their portal.
                        </div>
                    </div>
                )}

                {meetings.length === 0 ? (
                    <p className="text-center py-6 text-[12.5px] text-gray-400">
                        No scheduled or live meetings.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {meetings.map((m) => (
                            <div
                                key={m.id}
                                className="rounded-xl border border-gray-200 bg-white p-3 flex items-center gap-3"
                            >
                                <div
                                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                        m.status === "live"
                                            ? "bg-rose-50 text-rose-700"
                                            : "bg-blue-50 text-blue-700"
                                    }`}
                                >
                                    {m.status === "live" ? <Video className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-[13px] font-semibold text-[#0D1B39] truncate">
                                        {m.title}
                                        {m.status === "live" && (
                                            <span className="ml-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-rose-600">
                                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" /> live
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-[11.5px] text-gray-400 truncate">
                                        <span className="font-mono">{m.room_code}</span>
                                        {m.scheduled_for ? ` · ${new Date(m.scheduled_for).toLocaleString()}` : " · Starts now"}
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(m.room_code);
                                        appAlert(`Room code copied: ${m.room_code}`);
                                    }}
                                    className="p-2 rounded-lg text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50 transition"
                                    title="Copy room code"
                                >
                                    <Copy className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => cancelMeeting(m)}
                                    className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                                    title="Cancel meeting"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {showAssign && (
                <AssignModal
                    projectId={projectId}
                    members={unassignedMembers}
                    departments={unassignedDepts}
                    onClose={() => setShowAssign(false)}
                    onDone={() => {
                        setShowAssign(false);
                        loadAssignments();
                    }}
                />
            )}
            {showDoc && (
                <DocumentModal
                    projectId={projectId}
                    cdocs={cdocs}
                    protectedDocs={protectedDocs}
                    onClose={() => setShowDoc(false)}
                    onDone={() => {
                        setShowDoc(false);
                        loadDocuments();
                    }}
                />
            )}
            {showMeeting && (
                <MeetingModal
                    projectId={projectId}
                    onClose={() => setShowMeeting(false)}
                    onDone={() => {
                        setShowMeeting(false);
                        loadMeetings();
                    }}
                />
            )}
        </div>
    );
}

/* ------------ sub-components ------------ */

function ModalShell({
    title,
    onClose,
    children,
}: {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
}) {
    return (
        <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-[#0D1B39]">{title}</h3>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>
                <div className="p-6">{children}</div>
            </div>
        </div>
    );
}

function AssignModal({
    projectId,
    members,
    departments,
    onClose,
    onDone,
}: {
    projectId: string;
    members: Member[];
    departments: string[];
    onClose: () => void;
    onDone: () => void;
}) {
    const [mode, setMode] = useState<"member" | "department">("member");
    const [memberId, setMemberId] = useState("");
    const [department, setDepartment] = useState("");
    const [role, setRole] = useState("");
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        if (mode === "member" && !memberId) return appAlert("Pick a team member.");
        if (mode === "department" && !department) return appAlert("Pick a department.");
        setSaving(true);
        try {
            const r = await fetch(`/api/admin/finance/projects/${projectId}/assignments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    team_member_id: mode === "member" ? memberId : null,
                    department: mode === "department" ? department : null,
                    role: role || null,
                }),
            });
            const d = await r.json();
            if (!r.ok) return appAlert(d.error || "Couldn't assign.");
            onDone();
        } finally {
            setSaving(false);
        }
    };

    return (
        <ModalShell title="Assign to project" onClose={onClose}>
            <div className="flex gap-2 mb-4">
                <button
                    type="button"
                    onClick={() => setMode("member")}
                    className={`flex-1 px-3 py-2 rounded-xl text-[12.5px] font-semibold transition ${
                        mode === "member" ? "bg-[#0A4FE8] text-white" : "bg-gray-50 text-gray-600"
                    }`}
                >
                    <Users className="w-3.5 h-3.5 inline mr-1.5" /> Team member
                </button>
                <button
                    type="button"
                    onClick={() => setMode("department")}
                    className={`flex-1 px-3 py-2 rounded-xl text-[12.5px] font-semibold transition ${
                        mode === "department" ? "bg-[#0A4FE8] text-white" : "bg-gray-50 text-gray-600"
                    }`}
                >
                    <Building2 className="w-3.5 h-3.5 inline mr-1.5" /> Department
                </button>
            </div>

            {mode === "member" ? (
                <div className="space-y-3">
                    <div>
                        <Label className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Team member</Label>
                        <Select value={memberId} onValueChange={setMemberId}>
                            <SelectTrigger className="h-11 rounded-xl mt-1.5">
                                <SelectValue placeholder="Select a member" />
                            </SelectTrigger>
                            <SelectContent>
                                {members.length === 0 ? (
                                    <div className="px-3 py-2 text-[12px] text-gray-400">No more active members to assign.</div>
                                ) : (
                                    members.map((m) => (
                                        <SelectItem key={m.id} value={m.id}>
                                            {m.full_name} - {m.department || "No dept."}
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    <div>
                        <Label className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Department</Label>
                        <Select value={department} onValueChange={setDepartment}>
                            <SelectTrigger className="h-11 rounded-xl mt-1.5">
                                <SelectValue placeholder="Select a department" />
                            </SelectTrigger>
                            <SelectContent>
                                {departments.length === 0 ? (
                                    <div className="px-3 py-2 text-[12px] text-gray-400">No more departments to assign.</div>
                                ) : (
                                    departments.map((d) => (
                                        <SelectItem key={d} value={d}>{d}</SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            )}

            <div className="mt-3">
                <Label className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Role (optional)</Label>
                <Input
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="e.g. Lead designer"
                    className="h-11 rounded-xl mt-1.5"
                />
            </div>

            <div className="flex justify-end gap-2 mt-5">
                <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
                <Button onClick={submit} disabled={saving} className="bg-[#0A4FE8] hover:bg-[#083EC0]">
                    {saving ? "Assigning…" : "Assign"}
                </Button>
            </div>
        </ModalShell>
    );
}

function DocumentModal({
    projectId,
    cdocs,
    protectedDocs,
    onClose,
    onDone,
}: {
    projectId: string;
    cdocs: CDoc[];
    protectedDocs: ProtectedDoc[];
    onClose: () => void;
    onDone: () => void;
}) {
    const [kind, setKind] = useState<"cdoc" | "protected" | "link">("cdoc");
    const [cdocId, setCdocId] = useState("");
    const [protectedId, setProtectedId] = useState("");
    const [title, setTitle] = useState("");
    const [fileUrl, setFileUrl] = useState("");
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        const payload: Record<string, unknown> = { kind, title: title.trim() };
        if (kind === "cdoc") {
            if (!cdocId) return appAlert("Pick a cDoc.");
            payload.cdoc_id = cdocId;
            if (!title.trim()) payload.title = cdocs.find((c) => c.id === cdocId)?.title ?? "Untitled";
        } else if (kind === "protected") {
            if (!protectedId) return appAlert("Pick a protected document.");
            payload.protected_doc_id = protectedId;
            if (!title.trim()) payload.title = protectedDocs.find((p) => p.id === protectedId)?.title ?? "Protected document";
        } else {
            if (!fileUrl.trim()) return appAlert("Paste a link URL.");
            if (!title.trim()) return appAlert("Give the link a title.");
            payload.file_url = fileUrl.trim();
        }
        setSaving(true);
        try {
            const r = await fetch(`/api/admin/finance/projects/${projectId}/documents`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const d = await r.json();
            if (!r.ok) return appAlert(d.error || "Couldn't attach.");
            onDone();
        } finally {
            setSaving(false);
        }
    };

    return (
        <ModalShell title="Attach document" onClose={onClose}>
            <div className="flex gap-2 mb-4">
                {([
                    { v: "cdoc", label: "cDoc", icon: FileText },
                    { v: "protected", label: "Protected", icon: Shield },
                    { v: "link", label: "External link", icon: LinkIcon },
                ] as const).map((t) => (
                    <button
                        key={t.v}
                        type="button"
                        onClick={() => setKind(t.v)}
                        className={`flex-1 px-3 py-2 rounded-xl text-[12px] font-semibold transition ${
                            kind === t.v ? "bg-[#0A4FE8] text-white" : "bg-gray-50 text-gray-600"
                        }`}
                    >
                        <t.icon className="w-3.5 h-3.5 inline mr-1.5" /> {t.label}
                    </button>
                ))}
            </div>

            {kind === "cdoc" && (
                <div>
                    <Label className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Select cDoc</Label>
                    <Select value={cdocId} onValueChange={setCdocId}>
                        <SelectTrigger className="h-11 rounded-xl mt-1.5">
                            <SelectValue placeholder="Pick a cDoc" />
                        </SelectTrigger>
                        <SelectContent>
                            {cdocs.length === 0 ? (
                                <div className="px-3 py-2 text-[12px] text-gray-400">No cDocs available.</div>
                            ) : (
                                cdocs.map((c) => (
                                    <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                                ))
                            )}
                        </SelectContent>
                    </Select>
                </div>
            )}
            {kind === "protected" && (
                <div>
                    <Label className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Select protected doc</Label>
                    <Select value={protectedId} onValueChange={setProtectedId}>
                        <SelectTrigger className="h-11 rounded-xl mt-1.5">
                            <SelectValue placeholder="Pick a protected document" />
                        </SelectTrigger>
                        <SelectContent>
                            {protectedDocs.length === 0 ? (
                                <div className="px-3 py-2 text-[12px] text-gray-400">No protected docs available.</div>
                            ) : (
                                protectedDocs.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                                ))
                            )}
                        </SelectContent>
                    </Select>
                </div>
            )}
            {kind === "link" && (
                <div>
                    <Label className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">File / link URL</Label>
                    <Input
                        value={fileUrl}
                        onChange={(e) => setFileUrl(e.target.value)}
                        placeholder="https://…"
                        className="h-11 rounded-xl mt-1.5"
                    />
                </div>
            )}

            <div className="mt-3">
                <Label className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">
                    Display title {kind !== "link" && <span className="text-gray-400">(optional - defaults to the doc title)</span>}
                </Label>
                <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="h-11 rounded-xl mt-1.5"
                />
            </div>

            <div className="flex justify-end gap-2 mt-5">
                <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
                <Button onClick={submit} disabled={saving} className="bg-[#0A4FE8] hover:bg-[#083EC0]">
                    {saving ? "Attaching…" : "Attach"}
                </Button>
            </div>
        </ModalShell>
    );
}

function MeetingModal({
    projectId,
    onClose,
    onDone,
}: {
    projectId: string;
    onClose: () => void;
    onDone: () => void;
}) {
    const [title, setTitle] = useState("");
    const [agenda, setAgenda] = useState("");
    const [mode, setMode] = useState<"now" | "schedule">("now");
    const [scheduledFor, setScheduledFor] = useState("");
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        if (!title.trim()) return appAlert("Give the meeting a title.");
        if (mode === "schedule" && !scheduledFor) return appAlert("Pick a date/time.");
        setSaving(true);
        try {
            const r = await fetch(`/api/admin/finance/projects/${projectId}/meetings`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: title.trim(),
                    agenda: agenda.trim() || null,
                    scheduled_for: mode === "schedule" ? scheduledFor : null,
                }),
            });
            const d = await r.json();
            if (!r.ok) return appAlert(d.error || "Couldn't create meeting.");
            onDone();
        } finally {
            setSaving(false);
        }
    };

    return (
        <ModalShell title="New project meeting" onClose={onClose}>
            <div className="flex gap-2 mb-4">
                <button
                    type="button"
                    onClick={() => setMode("now")}
                    className={`flex-1 px-3 py-2 rounded-xl text-[12.5px] font-semibold transition ${
                        mode === "now" ? "bg-[#0A4FE8] text-white" : "bg-gray-50 text-gray-600"
                    }`}
                >
                    Start now
                </button>
                <button
                    type="button"
                    onClick={() => setMode("schedule")}
                    className={`flex-1 px-3 py-2 rounded-xl text-[12.5px] font-semibold transition ${
                        mode === "schedule" ? "bg-[#0A4FE8] text-white" : "bg-gray-50 text-gray-600"
                    }`}
                >
                    Schedule
                </button>
            </div>

            <div className="space-y-3">
                <div>
                    <Label className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Title</Label>
                    <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. Weekly project review"
                        className="h-11 rounded-xl mt-1.5"
                    />
                </div>
                {mode === "schedule" && (
                    <div>
                        <Label className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Scheduled for</Label>
                        <Input
                            type="datetime-local"
                            value={scheduledFor}
                            onChange={(e) => setScheduledFor(e.target.value)}
                            className="h-11 rounded-xl mt-1.5"
                        />
                    </div>
                )}
                <div>
                    <Label className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Agenda (optional)</Label>
                    <Textarea
                        value={agenda}
                        onChange={(e) => setAgenda(e.target.value)}
                        className="rounded-xl min-h-[80px] mt-1.5"
                    />
                </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
                <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
                <Button onClick={submit} disabled={saving} className="bg-[#0A4FE8] hover:bg-[#083EC0]">
                    {saving ? "Saving…" : mode === "now" ? "Start meeting" : "Schedule meeting"}
                </Button>
            </div>
        </ModalShell>
    );
}
