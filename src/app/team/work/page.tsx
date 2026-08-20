"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { initials } from "@/lib/utils";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Brain,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  FileUp,
  Filter,
  FolderKanban,
  Link2,
  Loader2,
  Lock,
  MessageSquare,
  Milestone,
  Pencil,
  Plus,
  Search,
  Trash2,
  Send,
  ShieldCheck,
  TrendingUp,
  Unlink,
  Users,
  X,
  CalendarRange,
  Command as CommandIcon,
  CornerDownLeft,
  LayoutGrid,
  List as ListIcon,
  UserRound,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { appAlert, appConfirm } from "@/lib/app-notify";
import { BRAND_BRIEF_FIELD_LABELS } from "@/lib/brand-brief";

type ProjectStatus = "new" | "active" | "paused" | "delayed" | "awaiting_client" | "under_review" | "completed" | "archived";
type TaskStatus = "not_started" | "in_progress" | "under_review" | "needs_revision" | "approved" | "completed" | "delayed";

interface Project {
  id: string;
  name: string;
  client: string | null;
  category: string | null;
  description: string | null;
  priority: string;
  status: ProjectStatus;
  duration_start: string | null;
  duration_end: string | null;
  internal_deadline: string | null;
  client_delivery_date: string | null;
  revision_deadline: string | null;
  launch_date: string | null;
  completion_date: string | null;
  project_manager_id: string | null;
  department_lead_id: string | null;
  project_manager_name: string | null;
  department_lead_name: string | null;
  progress: number;
  task_count: number;
  milestone_count: number;
  team_count: number;
  can_edit_project: boolean;
}

interface Assignment {
  id: string;
  project_id: string;
  team_member_id: string | null;
  department: string | null;
  role: string | null;
  member_name: string | null;
  member_role_title: string | null;
  member_department: string | null;
  member_avatar_url: string | null;
  is_project_leader: boolean;
  can_edit_project: boolean;
  can_manage_tasks: boolean;
}

interface MilestoneRow {
  id: string;
  project_id: string;
  description: string;
  status: string;
  assigned_to: string | null;
  duration_start: string | null;
  duration_end: string | null;
  due_date: string | null;
  approval_status: string;
  progress: number;
}

interface TaskRow {
  id: string;
  project_id: string;
  milestone_id: string | null;
  title: string;
  description: string | null;
  assignee_id: string | null;
  reviewer_id: string | null;
  department: string | null;
  priority: string;
  status: TaskStatus;
  progress: number;
  due_date: string | null;
  assignee_name: string | null;
  reviewer_name: string | null;
}

interface ProjectDocument {
  id: string;
  project_id: string;
  kind: string;
  title: string;
  file_url: string | null;
  folder: string | null;
  description: string | null;
  visibility: string;
  created_at: string;
}

interface BrandBriefSummary {
  id: string;
  project_id: string | null;
  brand_name: string | null;
  brand_tagline: string | null;
  industry: string | null;
  brand_description: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  target_audience: string | null;
  competitors: string | null;
  unique_selling_point: string | null;
  brand_personality: string | null;
  brand_values: string | null;
  design_preferences: string | null;
  inspiration_references: string | null;
  assets_needed: string[] | null;
  goals: string | null;
  long_term_vision: string | null;
  // Only present for management viewers; the server nulls it for everyone else.
  budget_range: string | null;
  timeline: string | null;
  additional_notes: string | null;
  status: string | null;
  submitted_at: string | null;
  created_at: string;
}

interface AttachableBrief {
  id: string;
  project_id: string | null;
  brand_name: string | null;
  invite_label: string | null;
  contact_name: string | null;
  status: string | null;
  submitted_at: string | null;
}

interface ApprovalRow {
  id: string;
  project_id: string;
  task_id: string | null;
  milestone_id: string | null;
  reviewer_member_id: string | null;
  approval_type: string;
  status: string;
  note: string | null;
  decision_note: string | null;
  requested_at: string;
  reviewer_name: string | null;
  requested_by_name: string | null;
}

interface ActivityRow {
  id: string;
  project_id: string;
  action: string;
  title: string;
  body: string | null;
  created_at: string;
  actor_name: string | null;
}

interface CalendarEvent {
  id: string;
  project_id: string;
  title: string;
  event_date: string;
  event_kind: string;
  status: string;
  source_type: string;
}

interface ChatThread {
  id: string;
  project_id: string;
  name: string | null;
}

interface TeamMemberOption {
  id: string;
  full_name: string;
  username: string;
  department: string | null;
  role_title: string | null;
  avatar_url: string | null;
}

interface WorkData {
  projects: Project[];
  assignments: Assignment[];
  milestones: MilestoneRow[];
  tasks: TaskRow[];
  documents: ProjectDocument[];
  briefs: BrandBriefSummary[];
  attachable_briefs: AttachableBrief[];
  approvals: ApprovalRow[];
  activity: ActivityRow[];
  calendar_events: CalendarEvent[];
  chat_threads: ChatThread[];
  team_members: TeamMemberOption[];
  departments: string[];
  capabilities: { can_create_project: boolean; can_manage_projects: boolean; can_view_budget: boolean };
  stats: {
    total: number;
    active: number;
    completed: number;
    delayed: number;
    upcoming_deadlines: number;
    pending_approvals: number;
    overdue_tasks: number;
  };
}

const CATEGORIES = [
  "Branding",
  "Web Design",
  "UI/UX Design",
  "Web3 Development",
  "Print Production",
  "Packaging",
  "Social Media",
  "Environmental Branding",
  "Internal Project",
];

const DEPARTMENTS = [
  "Management",
  "Brand Strategy",
  "Graphic Design",
  "Product Design",
  "Web Development",
  "Content",
  "Social Media",
  "Print Production",
  "Finance",
  "Client Service",
];

const DOCUMENT_FOLDERS = [
  "Project Brief",
  "Brand Assets",
  "Client Files",
  "Design Files",
  "Development Files",
  "Print Files",
  "Contracts",
  "Invoices",
  "Final Deliverables",
];

const STATUS_OPTIONS: ProjectStatus[] = ["new", "active", "paused", "delayed", "awaiting_client", "under_review", "completed"];
const TASK_STATUS_OPTIONS: TaskStatus[] = ["not_started", "in_progress", "under_review", "needs_revision", "approved", "completed", "delayed"];
const PRIORITY_OPTIONS = ["low", "medium", "high", "urgent"];

function label(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

// Accepts both bare `YYYY-MM-DD` and full ISO timestamps (the DB driver may
// return either), so date-only columns don't render as "Invalid Date".
function toDate(value: string | null): Date | null {
  if (!value) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value: string | null) {
  const d = toDate(value);
  if (!d) return "Not set";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(value: string | null) {
  const end = toDate(value);
  if (!end) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
}

function statusClass(status: string) {
  const map: Record<string, string> = {
    new: "bg-blue-50 text-blue-700 ring-blue-100",
    active: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    paused: "bg-amber-50 text-amber-700 ring-amber-100",
    delayed: "bg-rose-50 text-rose-700 ring-rose-100",
    awaiting_client: "bg-violet-50 text-violet-700 ring-violet-100",
    under_review: "bg-cyan-50 text-cyan-700 ring-cyan-100",
    completed: "bg-slate-100 text-slate-700 ring-slate-200",
    not_started: "bg-slate-100 text-slate-700 ring-slate-200",
    in_progress: "bg-blue-50 text-blue-700 ring-blue-100",
    needs_revision: "bg-orange-50 text-orange-700 ring-orange-100",
    approved: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  };
  return map[status] ?? "bg-slate-100 text-slate-700 ring-slate-200";
}

const emptyProjectForm = {
  name: "",
  client: "",
  category: "Branding",
  description: "",
  priority: "medium",
  status: "new",
  duration_start: "",
  duration_end: "",
  internal_deadline: "",
  client_delivery_date: "",
  project_manager_id: "",
  department_lead_id: "",
  seed_milestones: true,
};

const emptyTaskForm = {
  title: "",
  description: "",
  assignee_id: "",
  reviewer_id: "",
  department: "",
  priority: "medium",
  status: "not_started",
  due_date: "",
};

const emptyMilestoneForm = {
  description: "",
  duration_start: "",
  due_date: "",
  assigned_to: "",
};

const emptyDocForm = {
  title: "",
  file_url: "",
  folder: "Project Brief",
  visibility: "internal",
  description: "",
};

const emptyApprovalForm = {
  task_id: "",
  milestone_id: "",
  reviewer_member_id: "",
  approval_type: "manager_approval",
  note: "",
};

async function readJsonResponse<T>(res: Response, fallback: string): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(fallback);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(fallback);
  }
}

export default function TeamWorkPage() {
  const router = useRouter();
  const [data, setData] = useState<WorkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [deadlineFilter, setDeadlineFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [projectForm, setProjectForm] = useState(emptyProjectForm);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);
  const [milestoneForm, setMilestoneForm] = useState(emptyMilestoneForm);
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [docForm, setDocForm] = useState(emptyDocForm);
  const [approvalForm, setApprovalForm] = useState(emptyApprovalForm);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [tab, setTabState] = useState("overview");
  const [taskView, setTaskView] = useState<"list" | "board">("list");
  const [lens, setLens] = useState<"projects" | "my_work">("projects");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [myId, setMyId] = useState("");
  const setTab = (next: string) => { setTabState(next); setLens("projects"); };

  // Identify the signed-in member so the "My Work" lens can filter across projects.
  useEffect(() => {
    fetch("/api/team/session", { credentials: "include", cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => { if (json?.member?.id) setMyId(json.member.id); })
      .catch(() => {});
  }, []);

  // ⌘K / Ctrl-K toggles the command palette anywhere on the page.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/team/work", { credentials: "include", cache: "no-store" });
      const json = await readJsonResponse<WorkData & { ok?: boolean; error?: string }>(
        res,
        "The project workspace API returned an invalid response.",
      );
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not load projects.");
      setData(json);
      const params = new URLSearchParams(window.location.search);
      const projectFromUrl = params.get("project");
      const firstProject = json.projects?.[0]?.id || "";
      setSelectedProjectId((current) => projectFromUrl || current || firstProject);
    } catch (error) {
      void appAlert({
        title: "Project workspace",
        message: error instanceof Error ? error.message : "Could not load projects.",
        kind: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filteredProjects = useMemo(() => {
    const projects = data?.projects ?? [];
    const needle = query.trim().toLowerCase();
    return projects.filter((project) => {
      const dueDays = daysUntil(project.client_delivery_date || project.duration_end);
      const matchesQuery = !needle || [project.name, project.client, project.category, project.description]
        .some((value) => (value || "").toLowerCase().includes(needle));
      const matchesStatus = statusFilter === "all" || project.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || project.priority === priorityFilter;
      const matchesCategory = categoryFilter === "all" || project.category === categoryFilter;
      const matchesDeadline = deadlineFilter === "all"
        || (deadlineFilter === "upcoming" && dueDays != null && dueDays >= 0 && dueDays <= 14)
        || (deadlineFilter === "overdue" && dueDays != null && dueDays < 0);
      return matchesQuery && matchesStatus && matchesPriority && matchesCategory && matchesDeadline;
    });
  }, [categoryFilter, data?.projects, deadlineFilter, priorityFilter, query, statusFilter]);

  const selectedProject = useMemo(() => {
    const projects = data?.projects ?? [];
    return projects.find((project) => project.id === selectedProjectId) ?? filteredProjects[0] ?? projects[0] ?? null;
  }, [data?.projects, filteredProjects, selectedProjectId]);

  const projectTasks = useMemo(
    () => (data?.tasks ?? []).filter((task) => task.project_id === selectedProject?.id),
    [data?.tasks, selectedProject?.id],
  );
  const projectMilestones = useMemo(
    () => (data?.milestones ?? []).filter((milestone) => milestone.project_id === selectedProject?.id),
    [data?.milestones, selectedProject?.id],
  );
  const projectAssignments = useMemo(
    () => (data?.assignments ?? []).filter((assignment) => assignment.project_id === selectedProject?.id),
    [data?.assignments, selectedProject?.id],
  );
  const projectDocuments = useMemo(
    () => (data?.documents ?? []).filter((document) => document.project_id === selectedProject?.id),
    [data?.documents, selectedProject?.id],
  );
  const projectBrief = useMemo(
    () => (data?.briefs ?? []).find((brief) => brief.project_id === selectedProject?.id) ?? null,
    [data?.briefs, selectedProject?.id],
  );
  const projectApprovals = useMemo(
    () => (data?.approvals ?? []).filter((approval) => approval.project_id === selectedProject?.id),
    [data?.approvals, selectedProject?.id],
  );
  const projectActivity = useMemo(
    () => (data?.activity ?? []).filter((event) => event.project_id === selectedProject?.id).slice(0, 8),
    [data?.activity, selectedProject?.id],
  );
  const projectCalendar = useMemo(
    () => (data?.calendar_events ?? []).filter((event) => event.project_id === selectedProject?.id).slice(0, 12),
    [data?.calendar_events, selectedProject?.id],
  );
  const projectThread = useMemo(
    () => (data?.chat_threads ?? []).find((thread) => thread.project_id === selectedProject?.id),
    [data?.chat_threads, selectedProject?.id],
  );

  const postAction = async (
    action: string,
    payload: Record<string, unknown>,
    opts: { silent?: boolean } = {},
  ) => {
    setWorking(action);
    try {
      const res = await fetch("/api/team/work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action, ...payload }),
      });
      const json = await readJsonResponse<Record<string, unknown> & { ok?: boolean; error?: string }>(
        res,
        "The project workspace API returned an invalid response.",
      );
      if (!res.ok || !json.ok) throw new Error(json.error || "Action failed.");
      // `silent` callers patch local state themselves so only the affected card
      // re-renders instead of the whole page reloading behind a spinner.
      if (!opts.silent) await load();
      return json;
    } catch (error) {
      await appAlert({
        title: "Project workspace",
        message: error instanceof Error ? error.message : "Action failed.",
        kind: "error",
      });
      return null;
    } finally {
      setWorking(null);
    }
  };

  const createProject = async (event: React.FormEvent) => {
    event.preventDefault();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await postAction("create_project", projectForm)) as any;
    if (json?.project?.id) {
      setSelectedProjectId(json.project.id);
      setCreateOpen(false);
      setProjectForm(emptyProjectForm);
    }
  };

  const createTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProject) return;
    const json = await postAction("create_task", { ...taskForm, project_id: selectedProject.id }, { silent: true });
    if (json?.task) {
      const created = json.task as TaskRow;
      // The insert returns assignee_name = null; resolve it from the roster so
      // the new card renders correctly without a full reload.
      const assignee = data?.team_members?.find((member) => member.id === created.assignee_id);
      const enriched: TaskRow = { ...created, assignee_name: assignee?.full_name ?? null };
      setData((prev) => (prev ? { ...prev, tasks: [enriched, ...prev.tasks] } : prev));
      setTaskForm(emptyTaskForm);
    }
  };

  const submitMilestone = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProject) return;
    if (editingMilestoneId) {
      const json = await postAction("update_milestone", { ...milestoneForm, milestone_id: editingMilestoneId, project_id: selectedProject.id }, { silent: true });
      if (json?.milestone) {
        const updated = json.milestone as MilestoneRow;
        setData((prev) => (prev ? { ...prev, milestones: prev.milestones.map((m) => (m.id === updated.id ? updated : m)) } : prev));
        setMilestoneForm(emptyMilestoneForm);
        setEditingMilestoneId(null);
      }
      return;
    }
    const json = await postAction("create_milestone", { ...milestoneForm, project_id: selectedProject.id }, { silent: true });
    if (json?.milestone) {
      const created = json.milestone as MilestoneRow;
      setData((prev) => (prev ? { ...prev, milestones: [...prev.milestones, created] } : prev));
      setMilestoneForm(emptyMilestoneForm);
    }
  };

  const startEditMilestone = (milestone: MilestoneRow) => {
    setEditingMilestoneId(milestone.id);
    setMilestoneForm({
      description: milestone.description || "",
      duration_start: milestone.duration_start ? String(milestone.duration_start).slice(0, 10) : "",
      due_date: (milestone.due_date || milestone.duration_end) ? String(milestone.due_date || milestone.duration_end).slice(0, 10) : "",
      assigned_to: milestone.assigned_to || "",
    });
  };

  const cancelEditMilestone = () => {
    setEditingMilestoneId(null);
    setMilestoneForm(emptyMilestoneForm);
  };

  // Optimistic patch for status / progress / mark-done on a milestone card.
  const patchMilestone = async (milestone: MilestoneRow, patch: Record<string, unknown>) => {
    if (!selectedProject) return;
    setData((current) =>
      current ? { ...current, milestones: current.milestones.map((m) => (m.id === milestone.id ? ({ ...m, ...patch } as MilestoneRow) : m)) } : current,
    );
    const json = await postAction("update_milestone", { milestone_id: milestone.id, project_id: selectedProject.id, ...patch }, { silent: true });
    if (json?.milestone) {
      const updated = json.milestone as MilestoneRow;
      setData((current) => (current ? { ...current, milestones: current.milestones.map((m) => (m.id === updated.id ? updated : m)) } : current));
    } else {
      await load();
    }
  };

  const deleteMilestone = async (milestone: MilestoneRow) => {
    if (!selectedProject) return;
    if (!(await appConfirm({ title: "Delete milestone", message: `Delete "${milestone.description}"? This cannot be undone.` }))) return;
    setData((current) => (current ? { ...current, milestones: current.milestones.filter((m) => m.id !== milestone.id) } : current));
    const json = await postAction("delete_milestone", { milestone_id: milestone.id, project_id: selectedProject.id }, { silent: true });
    if (!json?.deleted) await load();
    if (editingMilestoneId === milestone.id) cancelEditMilestone();
  };

  const completeProject = async () => {
    if (!selectedProject) return;
    if (!(await appConfirm({ title: "Complete project", message: `Mark "${selectedProject.name}" as completed?` }))) return;
    const json = await postAction("update_project", { project_id: selectedProject.id, status: "completed", completion_date: new Date().toISOString().slice(0, 10) }, { silent: true });
    if (json?.project) await load();
  };

  const addDocument = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProject) return;
    const json = await postAction("add_document", { ...docForm, project_id: selectedProject.id });
    if (json?.document) setDocForm(emptyDocForm);
  };

  const attachBrief = async (briefId: string) => {
    if (!selectedProject || !briefId) return;
    await postAction("attach_brief", { project_id: selectedProject.id, brief_id: briefId });
  };

  const detachBrief = async () => {
    if (!selectedProject) return;
    await postAction("detach_brief", { project_id: selectedProject.id });
  };

  const requestApproval = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProject) return;
    const json = await postAction("request_approval", { ...approvalForm, project_id: selectedProject.id });
    if (json?.approval) setApprovalForm(emptyApprovalForm);
  };

  // Optimistic task update: patch local state instantly, sync in the background,
  // and only re-fetch if the write fails. Uses the task's own project_id so it
  // works from the board, the list, and the cross-project "My Work" lens alike.
  const updateTask = async (task: TaskRow, patch: Record<string, unknown>) => {
    setData((current) =>
      current
        ? { ...current, tasks: current.tasks.map((row) => (row.id === task.id ? ({ ...row, ...patch } as TaskRow) : row)) }
        : current,
    );
    try {
      const res = await fetch("/api/team/work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "update_task", project_id: task.project_id, task_id: task.id, ...patch }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not update the task.");
    } catch (error) {
      await load();
      void appAlert({
        title: "Project workspace",
        message: error instanceof Error ? error.message : "Could not update the task.",
        kind: "error",
      });
    }
  };

  const quickAddTask = async (title: string) => {
    if (!selectedProject || !title.trim()) return;
    const json = await postAction("create_task", { project_id: selectedProject.id, title: title.trim(), priority: "medium" }, { silent: true });
    if (json?.task) {
      const created = json.task as TaskRow;
      setData((prev) => (prev ? { ...prev, tasks: [{ ...created, assignee_name: null }, ...prev.tasks] } : prev));
    }
  };

  const addComment = async (task: TaskRow) => {
    if (!selectedProject) return;
    const body = (commentDrafts[task.id] || "").trim();
    if (!body) return;
    const json = await postAction("add_comment", { project_id: selectedProject.id, task_id: task.id, body });
    if (json?.comment) setCommentDrafts((current) => ({ ...current, [task.id]: "" }));
  };

  const decideApproval = async (approval: ApprovalRow, status: string) => {
    if (!selectedProject) return;
    await postAction("decide_approval", { project_id: selectedProject.id, approval_id: approval.id, status });
  };

  const openProjectChat = async () => {
    if (!selectedProject) return;
    if (projectThread?.id) {
      router.push(`/team/chat?thread=${projectThread.id}`);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await postAction("ensure_project_chat", { project_id: selectedProject.id })) as any;
    if (json?.thread?.id) router.push(`/team/chat?thread=${json.thread.id}`);
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-blue" />
      </div>
    );
  }

  if (!data) return null;

  const smartInsights = selectedProject ? getSmartInsights(selectedProject, projectTasks, projectApprovals, projectCalendar) : [];

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 sm:gap-5 lg:gap-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-white/80 bg-white px-4 py-5 shadow-sm sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-blue ring-1 ring-blue-100">
            <FolderKanban className="h-3.5 w-3.5" />
            Project Operations
          </div>
          <h1 className="mt-3 text-[28px] font-bold tracking-tight text-brand-navy sm:text-[34px]">
            Project Command Center
          </h1>
          <p className="mt-1 max-w-3xl text-[13.5px] leading-6 text-brand-body/65">
            Manage team assignments, tasks, milestones, files, approvals, deadlines, and project communication in one workspace.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="group inline-flex h-12 items-center gap-2 rounded-full border border-brand-stroke/60 bg-brand-bg/60 px-4 text-[13px] font-semibold text-brand-body/70 transition hover:border-brand-blue/40 hover:bg-white hover:text-brand-navy"
          >
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Quick jump</span>
            <kbd className="hidden items-center gap-0.5 rounded-md border border-brand-stroke/60 bg-white px-1.5 py-0.5 text-[10px] font-bold text-brand-body/60 sm:inline-flex">
              <CommandIcon className="h-2.5 w-2.5" />K
            </kbd>
          </button>
          {data.capabilities.can_create_project && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#0A4FE8] px-6 text-[14px] font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-[#083FC2] active:scale-95"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Project</span>
              <span className="sm:hidden">New</span>
            </button>
          )}
        </div>
      </header>

      {data.projects.length === 0 ? (
        <section className="flex flex-col items-center justify-center rounded-2xl border border-white/80 bg-white px-6 py-16 text-center shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-brand-blue">
            <BriefcaseBusiness className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-[18px] font-bold text-brand-navy">Work has not been assigned to you yet</h2>
          <p className="mt-1 max-w-md text-[13.5px] leading-6 text-brand-body/60">
            Once a project or task is assigned to you, it will show up here. Check back soon.
          </p>
          {data.capabilities.can_create_project && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[#0A4FE8] px-6 text-[13.5px] font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-[#083FC2] active:scale-95"
            >
              <Plus className="h-4 w-4" /> Create the first project
            </button>
          )}
        </section>
      ) : (
        <>
      <section className="no-scrollbar flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-4 sm:overflow-visible sm:pb-0 xl:grid-cols-7">
        <Metric icon={BriefcaseBusiness} label="Total" value={data.stats.total} />
        <Metric icon={FolderKanban} label="Active" value={data.stats.active} />
        <Metric icon={CheckCircle2} label="Completed" value={data.stats.completed} />
        <Metric icon={AlertTriangle} label="Delayed" value={data.stats.delayed} tone="danger" />
        <Metric icon={CalendarDays} label="Upcoming" value={data.stats.upcoming_deadlines} />
        <Metric icon={ShieldCheck} label="Approvals" value={data.stats.pending_approvals} />
        <Metric icon={Clock3} label="Overdue" value={data.stats.overdue_tasks} tone="danger" />
      </section>

      <div className="flex items-center gap-1 self-start rounded-full bg-brand-bg/70 p-1">
        {([["projects", "Projects", FolderKanban], ["my_work", "My Work", UserRound]] as const).map(([key, text, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setLens(key)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12.5px] font-semibold transition ${
              lens === key ? "bg-white text-brand-navy shadow-sm" : "text-brand-body/70 hover:text-brand-navy"
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {text}
          </button>
        ))}
      </div>

      {lens === "my_work" ? (
        <MyWorkView
          tasks={data.tasks}
          projects={data.projects}
          myId={myId}
          onUpdateTask={updateTask}
          onOpenProject={(id) => { setSelectedProjectId(id); setTabState("tasks"); setLens("projects"); }}
        />
      ) : (
      <>
      <section className="rounded-2xl border border-white/80 bg-white p-3 shadow-sm sm:p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_repeat(4,minmax(150px,180px))]">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-body/40" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search project, client, category..."
              className="h-12 w-full rounded-2xl border border-brand-stroke/50 bg-brand-bg/50 pl-10 pr-4 text-[13.5px] font-medium outline-none transition focus:border-brand-blue/40 focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
          </div>
          <FilterSelect value={statusFilter} onChange={setStatusFilter} options={["all", ...STATUS_OPTIONS]} />
          <FilterSelect value={priorityFilter} onChange={setPriorityFilter} options={["all", ...PRIORITY_OPTIONS]} />
          <FilterSelect value={categoryFilter} onChange={setCategoryFilter} options={["all", ...CATEGORIES]} />
          <FilterSelect value={deadlineFilter} onChange={setDeadlineFilter} options={["all", "upcoming", "overdue"]} />
        </div>
      </section>

      <main className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-white/80 bg-white p-3 shadow-sm sm:p-4 xl:sticky xl:top-4 xl:self-start">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-bold text-brand-navy">Projects</h2>
              <p className="text-[12px] text-brand-body/55">{filteredProjects.length} visible</p>
            </div>
            <Filter className="h-4 w-4 text-brand-body/40" />
          </div>
          {/* Grow to fit every project card; only scroll internally when the
              list is taller than the viewport, so cards are never cut off. */}
          <div className="space-y-2 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto">
            {filteredProjects.length === 0 ? (
              <EmptyState icon={Archive} title="No projects found" body="Try a different search or filter." />
            ) : (
              filteredProjects.map((project) => (
                <ProjectListItem
                  key={project.id}
                  project={project}
                  active={selectedProject?.id === project.id}
                  onClick={() => {
                    setSelectedProjectId(project.id);
                    setTab("overview");
                  }}
                />
              ))
            )}
          </div>
        </aside>

        {selectedProject ? (
          <section className="min-w-0 space-y-4">
            <ProjectHeader
              project={selectedProject}
              onChat={openProjectChat}
              working={working === "ensure_project_chat"}
              canManage={selectedProject.can_edit_project}
              onComplete={completeProject}
              completing={working === "update_project"}
            />

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0 rounded-2xl border border-white/80 bg-white p-3 shadow-sm sm:p-4">
                <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-full bg-brand-bg/70 p-1">
                  {["overview", "tasks", "milestones", "timeline", "files", "approvals", "calendar"].map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setTab(item)}
                      className={`shrink-0 rounded-full px-4 py-2 text-[12.5px] font-semibold transition ${
                        tab === item ? "bg-white text-brand-navy shadow-sm" : "text-brand-body/70 hover:text-brand-navy"
                      }`}
                    >
                      {label(item)}
                    </button>
                  ))}
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={tab}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.16, ease: "easeOut" }}
                    className="mt-4"
                  >
                  {tab === "overview" && (
                    <OverviewTab
                      project={selectedProject}
                      assignments={projectAssignments}
                      insights={smartInsights}
                      activity={projectActivity}
                    />
                  )}
                  {tab === "tasks" && (
                    <TasksTab
                      tasks={projectTasks}
                      members={data.team_members}
                      departments={[...new Set([...data.departments, ...DEPARTMENTS])]}
                      form={taskForm}
                      setForm={setTaskForm}
                      onSubmit={createTask}
                      onUpdateTask={updateTask}
                      onQuickAdd={quickAddTask}
                      view={taskView}
                      setView={setTaskView}
                      working={working}
                      commentDrafts={commentDrafts}
                      setCommentDrafts={setCommentDrafts}
                      addComment={addComment}
                      canManage={selectedProject.can_edit_project}
                      viewerId={myId}
                    />
                  )}
                  {tab === "milestones" && (
                    <MilestonesTab
                      milestones={projectMilestones}
                      form={milestoneForm}
                      setForm={setMilestoneForm}
                      onSubmit={submitMilestone}
                      working={working}
                      canManage={selectedProject.can_edit_project}
                      editingId={editingMilestoneId}
                      onEdit={startEditMilestone}
                      onCancelEdit={cancelEditMilestone}
                      onPatch={patchMilestone}
                      onDelete={deleteMilestone}
                    />
                  )}
                  {tab === "timeline" && <TimelineTab milestones={projectMilestones} tasks={projectTasks} />}
                  {tab === "files" && (
                    <FilesTab
                      documents={projectDocuments}
                      form={docForm}
                      setForm={setDocForm}
                      onSubmit={addDocument}
                      working={working}
                      brief={projectBrief}
                      canManageBriefs={data.capabilities.can_view_budget}
                      attachableBriefs={data.attachable_briefs}
                      onAttachBrief={attachBrief}
                      onDetachBrief={detachBrief}
                    />
                  )}
                  {tab === "approvals" && (
                    <ApprovalsTab
                      approvals={projectApprovals}
                      tasks={projectTasks}
                      milestones={projectMilestones}
                      members={data.team_members}
                      form={approvalForm}
                      setForm={setApprovalForm}
                      onSubmit={requestApproval}
                      decideApproval={decideApproval}
                      working={working}
                    />
                  )}
                  {tab === "calendar" && <CalendarTab events={projectCalendar} />}
                  </motion.div>
                </AnimatePresence>
              </div>

              <aside className="space-y-4">
                <Panel title="Team" icon={Users}>
                  <div className="space-y-2">
                    {projectAssignments.length === 0 ? (
                      <p className="text-[12px] text-brand-body/55">No team assignments yet.</p>
                    ) : (
                      projectAssignments.slice(0, 8).map((assignment) => (
                        <div key={assignment.id} className="flex items-center gap-3 rounded-2xl bg-brand-bg/60 px-3 py-2.5">
                          <Avatar name={assignment.member_name || assignment.department || "D"} src={assignment.member_avatar_url} />
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-bold text-brand-navy">
                              {assignment.member_name || `${assignment.department} department`}
                            </p>
                            <p className="truncate text-[11px] text-brand-body/55">
                              {assignment.role || assignment.member_role_title || "Contributor"}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Panel>

                <Panel title="Smart Analysis" icon={Brain}>
                  <div className="space-y-2">
                    {smartInsights.map((insight) => (
                      <div key={insight} className="rounded-2xl bg-blue-50 px-3 py-2 text-[12px] leading-5 text-blue-800">
                        {insight}
                      </div>
                    ))}
                  </div>
                </Panel>
              </aside>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-white/80 bg-white p-4 shadow-sm sm:p-6">
            <EmptyState icon={FolderKanban} title="No project workspace yet" body="Projects assigned to you will appear here." />
          </section>
        )}
      </main>
      </>
      )}
        </>
      )}

      <AnimatePresence>
        {createOpen && data.capabilities.can_create_project && (
          <ProjectCreateModal
            form={projectForm}
            setForm={setProjectForm}
            members={data.team_members}
            working={working === "create_project"}
            onClose={() => setCreateOpen(false)}
            onSubmit={createProject}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {paletteOpen && (
          <CommandPalette
            projects={data.projects}
            canCreateProject={data.capabilities.can_create_project}
            onClose={() => setPaletteOpen(false)}
            onSelectProject={(id) => { setSelectedProjectId(id); setTab("overview"); }}
            onNewProject={data.capabilities.can_create_project ? () => setCreateOpen(true) : undefined}
            onNewTask={() => setTab("tasks")}
            onTab={setTab}
            onMyWork={() => setLens("my_work")}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Metric({ icon: Icon, label: metricLabel, value, tone = "default" }: { icon: React.ElementType; label: string; value: number; tone?: "default" | "danger" }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${tone === "danger" ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-brand-blue"}`}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        <p className="text-[24px] font-bold tracking-tight text-brand-navy">{value}</p>
      </div>
      <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-body/50">{metricLabel}</p>
    </div>
  );
}

function FilterSelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-12 w-full rounded-2xl border border-brand-stroke/50 bg-brand-bg/50 px-3 text-[13px] font-bold text-brand-navy outline-none transition focus:border-brand-blue/40 focus:bg-white focus:ring-4 focus:ring-blue-100"
    >
      {options.map((option) => (
        <option key={option} value={option}>{label(option)}</option>
      ))}
    </select>
  );
}

function ProjectListItem({ project, active, onClick }: { project: Project; active: boolean; onClick: () => void }) {
  const due = daysUntil(project.client_delivery_date || project.duration_end);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-3xl border p-4 text-left transition ${
        active ? "border-brand-blue bg-blue-50 ring-4 ring-blue-100" : "border-brand-stroke/40 bg-white hover:border-blue-200 hover:bg-blue-50/40"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-bold text-brand-navy">{project.name}</p>
          <p className="mt-0.5 truncate text-[12px] text-brand-body/55">{project.client || "Internal"}</p>
        </div>
        <ChevronRight className={`h-4 w-4 shrink-0 ${active ? "text-brand-blue" : "text-brand-body/35"}`} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Pill value={label(project.status)} className={statusClass(project.status)} />
        <Pill value={project.category || "Uncategorized"} />
        <Pill value={label(project.priority)} />
      </div>
      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-[11px] font-semibold text-brand-body/55">
          <span>{project.progress}% complete</span>
          <span>{due == null ? "No due date" : due < 0 ? `${Math.abs(due)}d overdue` : `${due}d left`}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full bg-brand-blue" style={{ width: `${project.progress}%` }} />
        </div>
      </div>
    </button>
  );
}

function ProjectHeader({ project, onChat, working, canManage, onComplete, completing }: { project: Project; onChat: () => void; working: boolean; canManage: boolean; onComplete: () => void; completing: boolean }) {
  const isCompleted = project.status === "completed" || project.status === "archived";
  return (
    <div className="rounded-2xl border border-white/80 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Pill value={label(project.status)} className={statusClass(project.status)} />
            <Pill value={project.category || "Uncategorized"} />
            <Pill value={`${label(project.priority)} priority`} />
          </div>
          <h2 className="mt-3 text-[24px] font-bold tracking-tight text-brand-navy sm:text-[30px]">{project.name}</h2>
          <p className="mt-1 text-[13.5px] text-brand-body/65">{project.client || "Internal project"}</p>
          {project.description && <p className="mt-3 max-w-3xl text-[13px] leading-6 text-brand-body/70">{project.description}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canManage && !isCompleted && (
            <button
              type="button"
              onClick={onComplete}
              disabled={completing}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-[13px] font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
            >
              {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Mark completed
            </button>
          )}
          {isCompleted && (
            <span className="inline-flex h-11 items-center gap-2 rounded-2xl bg-emerald-50 px-4 text-[13px] font-bold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Completed
            </span>
          )}
          <button
            type="button"
            onClick={onChat}
            disabled={working}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand-navy px-4 text-[13px] font-bold text-white transition hover:bg-[#101C3F] disabled:opacity-60"
          >
            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
            Project chat
          </button>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TimelineCell label="Start" value={formatDate(project.duration_start)} />
        <TimelineCell label="Internal" value={formatDate(project.internal_deadline)} />
        <TimelineCell label="Client Delivery" value={formatDate(project.client_delivery_date || project.duration_end)} />
        <TimelineCell label="Launch" value={formatDate(project.launch_date)} />
      </div>
    </div>
  );
}

function TimelineCell({ label: cellLabel, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-brand-bg/60 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-body/45">{cellLabel}</p>
      <p className="mt-1 text-[13px] font-bold text-brand-navy">{value}</p>
    </div>
  );
}

function OverviewTab({ project, assignments, insights, activity }: { project: Project; assignments: Assignment[]; insights: string[]; activity: ActivityRow[] }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <ProgressPanel
          icon={TrendingUp}
          title="Progress"
          value={project.progress}
          sub={`${project.task_count} task${project.task_count === 1 ? "" : "s"}`}
        />
        <ProgressPanel
          icon={Milestone}
          title="Milestones"
          value={project.milestone_count ? Math.round((project.progress + 20) / 1.2) : 0}
          sub={`${project.milestone_count} planned`}
        />
        <ProgressPanel
          icon={Users}
          title="Team Coverage"
          value={Math.min(100, assignments.length * 18)}
          sub={`${assignments.length} assignment${assignments.length === 1 ? "" : "s"}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Project Intelligence" icon={Brain}>
          <div className="space-y-2">
            {insights.map((insight) => (
              <div key={insight} className="rounded-2xl bg-brand-bg/70 px-3 py-2 text-[12px] leading-5 text-brand-body">
                {insight}
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Recent Activity" icon={Clock3}>
          <div className="space-y-3">
            {activity.length === 0 ? (
              <p className="text-[12px] text-brand-body/55">No activity recorded yet.</p>
            ) : activity.map((event) => (
              <div key={event.id} className="border-l-2 border-blue-100 pl-3">
                <p className="text-[13px] font-bold text-brand-navy">{event.title}</p>
                <p className="text-[11px] text-brand-body/50">
                  {event.actor_name || "System"} · {new Date(event.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ProgressPanel({ icon: Icon, title, value, sub }: { icon: React.ElementType; title: string; value: number; sub: string }) {
  const normalized = Math.max(0, Math.min(100, value || 0));
  return (
    // Matches the canonical `Metric` card: icon + value share the top row, and
    // the label sits on its own full-width line below so a long label like
    // "Team Coverage" never collides with (or wraps into) the value.
    <div className="rounded-3xl border border-white/80 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-brand-blue">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <span className="whitespace-nowrap text-[24px] font-bold leading-none tracking-tight tabular-nums text-brand-navy">
          {normalized}%
        </span>
      </div>
      <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-body/50">{title}</p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-brand-bg">
        <div className="h-full rounded-full bg-brand-blue transition-all duration-500" style={{ width: `${normalized}%` }} />
      </div>
      <p className="mt-2 text-[12px] text-brand-body/55">{sub}</p>
    </div>
  );
}

function TasksTab({
  tasks,
  members,
  departments,
  form,
  setForm,
  onSubmit,
  onUpdateTask,
  onQuickAdd,
  view,
  setView,
  working,
  commentDrafts,
  setCommentDrafts,
  addComment,
  canManage,
  viewerId,
}: {
  tasks: TaskRow[];
  members: TeamMemberOption[];
  departments: string[];
  form: typeof emptyTaskForm;
  setForm: (form: typeof emptyTaskForm) => void;
  onSubmit: (event: React.FormEvent) => void;
  onUpdateTask: (task: TaskRow, patch: Record<string, unknown>) => void;
  onQuickAdd: (title: string) => void;
  view: "list" | "board";
  setView: (view: "list" | "board") => void;
  working: string | null;
  commentDrafts: Record<string, string>;
  setCommentDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  addComment: (task: TaskRow) => void;
  canManage: boolean;
  viewerId: string;
}) {
  const [quick, setQuick] = useState("");
  const [showWizard, setShowWizard] = useState(false);
  const submitQuick = () => {
    const title = quick.trim();
    if (!title) return;
    onQuickAdd(title);
    setQuick("");
  };
  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {canManage ? (
          <div className="relative flex-1">
            <Plus className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-body/35" />
            <input
              value={quick}
              onChange={(event) => setQuick(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submitQuick(); } }}
              placeholder="Quick-add a task, then press Enter"
              className="h-11 w-full rounded-2xl border border-brand-stroke/50 bg-brand-bg/50 pl-9 pr-24 text-[13px] font-medium outline-none transition focus:border-brand-blue/40 focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
            {quick.trim() && (
              <button type="button" onClick={submitQuick} className="absolute right-1.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-xl bg-brand-navy px-3 py-1.5 text-[11px] font-bold text-white">
                Add <CornerDownLeft className="h-3 w-3" />
              </button>
            )}
          </div>
        ) : (
          <p className="flex-1 rounded-2xl border border-brand-stroke/40 bg-brand-bg/50 px-4 py-3 text-[12px] text-brand-body/60">Project leaders manage task creation. Assigned members can update their own task status.</p>
        )}
        <div className="flex items-center gap-1 rounded-full bg-brand-bg/70 p-1">
          {([["list", "List", ListIcon], ["board", "Board", LayoutGrid]] as const).map(([key, text, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition ${
                view === key ? "bg-white text-brand-navy shadow-sm" : "text-brand-body/70 hover:text-brand-navy"
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {text}
            </button>
          ))}
        </div>
      </div>

      {canManage && <div className="rounded-2xl border border-brand-stroke/40 bg-white">
        <button
          type="button"
          onClick={() => setShowWizard((open) => !open)}
          className="flex w-full items-center gap-2 px-4 py-3 text-[13px] font-bold text-brand-navy"
        >
          <Plus className="h-4 w-4 text-brand-blue" /> Detailed task (assignee, due date, description)
          <ChevronRight className={`ml-auto h-4 w-4 text-brand-body/40 transition ${showWizard ? "rotate-90" : ""}`} />
        </button>
        {showWizard && (
          <div className="border-t border-brand-stroke/40 p-4">
            <TaskWizard form={form} setForm={setForm} members={members} departments={departments} onSubmit={onSubmit} working={working} embedded />
          </div>
        )}
      </div>}

      {tasks.length === 0 ? (
        <EmptyState icon={Milestone} title="No tasks yet" body="Quick-add above, or open the detailed form to assign responsibility." />
      ) : view === "board" ? (
        <TaskBoard tasks={tasks} onUpdateTask={onUpdateTask} canUpdateTask={(task) => canManage || task.assignee_id === viewerId || task.reviewer_id === viewerId} />
      ) : (
        <div className="grid gap-3">
          {tasks.map((task) => (
            <div key={task.id} className="rounded-3xl border border-brand-stroke/40 bg-white p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-1.5">
                    <Pill value={label(task.status)} className={statusClass(task.status)} />
                    <Pill value={label(task.priority)} />
                    {task.department && <Pill value={task.department} />}
                  </div>
                  <h3 className="mt-2 text-[15px] font-bold text-brand-navy">{task.title}</h3>
                  {task.description && <p className="mt-1 text-[12.5px] leading-5 text-brand-body/65">{task.description}</p>}
                  <p className="mt-2 text-[11px] text-brand-body/50">
                    {task.assignee_name ? `Assigned to ${task.assignee_name}` : "Unassigned"} · Due {formatDate(task.due_date)}
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:w-[260px]">
                  <select disabled={!canManage && task.assignee_id !== viewerId && task.reviewer_id !== viewerId} value={task.status} onChange={(event) => onUpdateTask(task, { status: event.target.value })} className={`${smallInputClass} disabled:cursor-not-allowed disabled:opacity-55`}>
                    {TASK_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{label(status)}</option>)}
                  </select>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    disabled={!canManage && task.assignee_id !== viewerId && task.reviewer_id !== viewerId}
                    value={task.progress}
                    onChange={(event) => onUpdateTask(task, { progress: Number(event.target.value) })}
                    className={`${smallInputClass} disabled:cursor-not-allowed disabled:opacity-55`}
                  />
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-brand-bg">
                <div className="h-full rounded-full bg-brand-blue" style={{ width: `${task.progress}%` }} />
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  value={commentDrafts[task.id] || ""}
                  onChange={(event) => setCommentDrafts((current) => ({ ...current, [task.id]: event.target.value }))}
                  placeholder="Add task comment..."
                  className="h-10 flex-1 rounded-2xl border border-brand-stroke/50 bg-brand-bg/60 px-3 text-[12px] outline-none focus:border-brand-blue/40 focus:bg-white"
                />
                <button type="button" onClick={() => addComment(task)} className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-brand-navy px-4 text-[12px] font-bold text-white">
                  <Send className="h-3.5 w-3.5" /> Comment
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskWizard({ form, setForm, members, departments, onSubmit, working, embedded = false }: {
  form: typeof emptyTaskForm;
  setForm: (form: typeof emptyTaskForm) => void;
  members: TeamMemberOption[];
  departments: string[];
  onSubmit: (event: React.FormEvent) => void;
  working: string | null;
  embedded?: boolean;
}) {
  const steps = ["Task", "Details"];
  const [step, setStep] = useState(0);
  const canNext = step !== 0 || !!form.title.trim();
  return (
    <form onSubmit={(e) => { onSubmit(e); setStep(0); }} className={embedded ? "" : "rounded-2xl border border-brand-stroke/40 bg-white p-4 sm:p-5"}>
      <div className="flex items-center justify-between gap-3">
        {embedded ? <span /> : <p className="text-[13px] font-bold text-brand-navy">New task</p>}
        <div className="w-36 sm:w-52"><Stepper steps={steps} current={step} /></div>
      </div>
      <div className="mt-4">
        {step === 0 && (
          <div className="grid gap-3">
            <Field label="Task title"><TextInput value={form.title} onChange={(title) => setForm({ ...form, title })} placeholder="What needs doing?" required /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Assign to member"><select value={form.assignee_id} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })} className={inputClass}><option value="">Unassigned</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select></Field>
              <Field label="Assign to department"><select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className={inputClass}><option value="">No department</option>{departments.map((d) => <option key={d} value={d}>{d}</option>)}</select></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Priority"><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={inputClass}>{PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{label(p)}</option>)}</select></Field>
              <Field label="Due date"><TextInput value={form.due_date} onChange={(due_date) => setForm({ ...form, due_date })} type="date" /></Field>
            </div>
          </div>
        )}
        {step === 1 && (
          <div className="grid gap-3">
            <Field label="Description"><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Details (optional)" className={`${inputClass} min-h-[80px] py-2.5`} /></Field>
          </div>
        )}
      </div>
      <WizardNav step={step} total={steps.length} onBack={() => setStep((s) => Math.max(0, s - 1))} onNext={() => setStep((s) => Math.min(steps.length - 1, s + 1))} submitLabel="Add task" submitting={working === "create_task"} canNext={canNext} />
    </form>
  );
}

const MILESTONE_STATUS_OPTIONS = ["pending", "in_progress", "completed", "paid"];

function MilestonesTab({ milestones, form, setForm, onSubmit, working, canManage, editingId, onEdit, onCancelEdit, onPatch, onDelete }: {
  milestones: MilestoneRow[];
  form: typeof emptyMilestoneForm;
  setForm: (form: typeof emptyMilestoneForm) => void;
  onSubmit: (event: React.FormEvent) => void;
  working: string | null;
  canManage: boolean;
  editingId: string | null;
  onEdit: (milestone: MilestoneRow) => void;
  onCancelEdit: () => void;
  onPatch: (milestone: MilestoneRow, patch: Record<string, unknown>) => void;
  onDelete: (milestone: MilestoneRow) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const editing = editingId != null;
  // Keep the form open whenever we're editing an existing milestone.
  const formOpen = showForm || editing;
  const busy = working === "create_milestone" || working === "update_milestone";
  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-brand-stroke/40 bg-white">
        <button
          type="button"
          onClick={() => { if (editing) { onCancelEdit(); } setShowForm((open) => !open); }}
          className="flex w-full items-center gap-2 px-4 py-3 text-[13px] font-bold text-brand-navy"
        >
          <Plus className="h-4 w-4 text-brand-blue" /> {editing ? "Editing milestone" : "Add milestone (start & due date)"}
          <ChevronRight className={`ml-auto h-4 w-4 text-brand-body/40 transition ${formOpen ? "rotate-90" : ""}`} />
        </button>
        {formOpen && (
          <form onSubmit={onSubmit} className="grid gap-3 border-t border-brand-stroke/40 p-4">
            <Field label="Milestone title"><TextInput value={form.description} onChange={(description) => setForm({ ...form, description })} placeholder="e.g. Design handoff" required /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Start date"><TextInput value={form.duration_start} onChange={(duration_start) => setForm({ ...form, duration_start })} type="date" /></Field>
              <Field label="Due date"><TextInput value={form.due_date} onChange={(due_date) => setForm({ ...form, due_date })} type="date" /></Field>
            </div>
            <Field label="Owner (optional)"><TextInput value={form.assigned_to} onChange={(assigned_to) => setForm({ ...form, assigned_to })} placeholder="Person or department" /></Field>
            <div className="flex justify-end gap-2">
              {editing && (
                <button type="button" onClick={() => { onCancelEdit(); setShowForm(false); }} className="rounded-2xl border border-brand-stroke/50 px-4 py-2.5 text-[13px] font-bold text-brand-body/70">
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={busy || !form.description.trim()}
                className="inline-flex items-center gap-2 rounded-2xl bg-brand-navy px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
              >
                {busy ? "Saving…" : editing ? "Save changes" : "Add milestone"}
              </button>
            </div>
          </form>
        )}
      </div>

      {milestones.length === 0 ? (
        <EmptyState icon={Milestone} title="No milestones" body="Add a milestone above to start tracking phases with their start and due dates." />
      ) : (
        <div className="grid gap-3">
          {milestones.map((milestone, index) => {
            const done = milestone.status === "completed" || milestone.status === "paid" || milestone.approval_status === "approved";
            return (
              <div key={milestone.id} className="flex gap-3 rounded-3xl border border-brand-stroke/40 bg-white p-4">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-[13px] font-bold ${done ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-brand-blue"}`}>
                  {done ? <Check className="h-5 w-5" /> : index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-1.5">
                    <Pill value={label(milestone.status)} className={statusClass(milestone.status)} />
                    <Pill value={`${milestone.progress || 0}%`} />
                    {milestone.approval_status && milestone.approval_status !== milestone.status && <Pill value={label(milestone.approval_status)} />}
                  </div>
                  <h3 className="mt-2 text-[15px] font-bold text-brand-navy">{milestone.description}</h3>
                  <p className="mt-1 text-[12px] text-brand-body/55">
                    {milestone.assigned_to || "Unassigned"}
                    {milestone.duration_start ? ` · Start ${formatDate(milestone.duration_start)}` : ""}
                    {` · Due ${formatDate(milestone.due_date || milestone.duration_end)}`}
                  </p>

                  {canManage && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-brand-stroke/30 pt-3">
                      {!done && (
                        <button
                          type="button"
                          onClick={() => onPatch(milestone, { mark_done: true })}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-emerald-700"
                        >
                          <Check className="h-3.5 w-3.5" /> Mark done
                        </button>
                      )}
                      <select
                        value={MILESTONE_STATUS_OPTIONS.includes(milestone.status) ? milestone.status : "pending"}
                        onChange={(e) => onPatch(milestone, { status: e.target.value })}
                        className="rounded-lg border border-brand-stroke/50 bg-white px-2 py-1.5 text-[12px] font-semibold text-brand-navy"
                      >
                        {MILESTONE_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                      </select>
                      <button type="button" onClick={() => { onEdit(milestone); setShowForm(true); }} className="inline-flex items-center gap-1.5 rounded-lg border border-brand-stroke/50 px-2.5 py-1.5 text-[12px] font-semibold text-brand-body/70 transition hover:text-brand-navy">
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button type="button" onClick={() => onDelete(milestone)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-1.5 text-[12px] font-semibold text-red-600 transition hover:bg-red-50">
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Read-only display order for a linked brand brief. `assets_needed` is rendered
// separately as chips; `budget_range` only arrives from the server for
// management viewers, so it simply won't appear for anyone else.
const BRIEF_DISPLAY_FIELDS: (keyof BrandBriefSummary)[] = [
  "industry",
  "brand_description",
  "target_audience",
  "competitors",
  "unique_selling_point",
  "brand_personality",
  "brand_values",
  "design_preferences",
  "inspiration_references",
  "goals",
  "long_term_vision",
  "timeline",
  "additional_notes",
  "contact_name",
  "contact_email",
  "contact_phone",
];

function briefOptionLabel(brief: AttachableBrief) {
  return brief.invite_label?.trim() || brief.brand_name?.trim() || brief.contact_name?.trim() || "Untitled brief";
}

function BrandBriefPanel({ brief, canManage, attachableBriefs, onAttach, onDetach, working }: {
  brief: BrandBriefSummary | null;
  canManage: boolean;
  attachableBriefs: AttachableBrief[];
  onAttach: (briefId: string) => void;
  onDetach: () => void;
  working: string | null;
}) {
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState("");
  const busy = working === "attach_brief" || working === "detach_brief";

  // Nothing to show and nothing to do → stay out of the way entirely.
  if (!brief && !canManage) return null;

  if (!brief) {
    // Management, but no brief linked yet → offer the attach picker.
    return (
      <div className="rounded-2xl border border-dashed border-brand-stroke/60 bg-brand-bg/40 p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-brand-blue"><FileText className="h-4.5 w-4.5" /></span>
          <div>
            <p className="text-[13px] font-bold text-brand-navy">Brand brief</p>
            <p className="text-[12px] text-brand-body/60">Link the client&apos;s submitted brief so the team can work from it here.</p>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <select
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
            className={inputClass}
          >
            <option value="">Select a submitted brief…</option>
            {attachableBriefs.map((b) => (
              <option key={b.id} value={b.id}>
                {briefOptionLabel(b)}{b.project_id ? " · linked elsewhere" : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!chosen || busy}
            onClick={() => chosen && onAttach(chosen)}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#0A4FE8] px-5 text-[13px] font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-[#083FC2] active:scale-95 disabled:opacity-60"
          >
            {working === "attach_brief" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Link brief
          </button>
        </div>
        {attachableBriefs.length === 0 && (
          <p className="mt-2 text-[12px] text-brand-body/50">No submitted briefs available to link yet.</p>
        )}
      </div>
    );
  }

  const assets = (brief.assets_needed || []).filter(Boolean);

  return (
    <div className="rounded-2xl border border-brand-stroke/40 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-brand-blue"><FileText className="h-4.5 w-4.5" /></span>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[14px] font-bold text-brand-navy">{brief.brand_name?.trim() || "Brand brief"}</p>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-600">
                {brief.status === "submitted" ? "Filled by client" : brief.status || "Brief"}
              </span>
            </div>
            {brief.brand_tagline?.trim() && <p className="text-[12px] text-brand-body/60">{brief.brand_tagline}</p>}
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-1.5">
            <select
              value=""
              disabled={busy}
              onChange={(e) => e.target.value && onAttach(e.target.value)}
              className="h-9 rounded-full border border-brand-stroke/50 bg-white px-3 text-[12px] font-semibold text-brand-body/70"
              title="Replace with a different brief"
            >
              <option value="">Change…</option>
              {attachableBriefs.filter((b) => b.id !== brief.id).map((b) => (
                <option key={b.id} value={b.id}>{briefOptionLabel(b)}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={onDetach}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-brand-stroke/50 px-3 text-[12px] font-semibold text-brand-body/60 transition hover:border-rose-300 hover:text-rose-500 disabled:opacity-60"
            >
              {working === "detach_brief" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />} Unlink
            </button>
          </div>
        )}
      </div>

      {assets.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-body/45">{BRAND_BRIEF_FIELD_LABELS.assets_needed}</p>
          <div className="flex flex-wrap gap-1.5">
            {assets.map((asset) => (
              <span key={asset} className="rounded-full bg-brand-bg px-2.5 py-1 text-[12px] font-medium text-brand-navy">{asset}</span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {BRIEF_DISPLAY_FIELDS.map((key) => {
          const value = brief[key];
          const text = typeof value === "string" ? value.trim() : "";
          if (!text) return null;
          return (
            <div key={key}>
              <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-body/45">{BRAND_BRIEF_FIELD_LABELS[key] || key}</p>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-brand-navy">{text}</p>
            </div>
          );
        })}
        {brief.budget_range?.trim() && (
          <div>
            <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-brand-body/45">
              {BRAND_BRIEF_FIELD_LABELS.budget_range}
              <span className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-600"><Lock className="h-2.5 w-2.5" /> Admin only</span>
            </p>
            <p className="text-[13px] font-semibold leading-relaxed text-brand-navy">{brief.budget_range}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function FilesTab({ documents, form, setForm, onSubmit, working, brief, canManageBriefs, attachableBriefs, onAttachBrief, onDetachBrief }: {
  documents: ProjectDocument[];
  form: typeof emptyDocForm;
  setForm: (form: typeof emptyDocForm) => void;
  onSubmit: (event: React.FormEvent) => void;
  working: string | null;
  brief: BrandBriefSummary | null;
  canManageBriefs: boolean;
  attachableBriefs: AttachableBrief[];
  onAttachBrief: (briefId: string) => void;
  onDetachBrief: () => void;
}) {
  const [open, setOpen] = useState(false);
  const grouped = documents.reduce<Record<string, ProjectDocument[]>>((acc, document) => {
    const folder = document.folder || "Client Files";
    acc[folder] = [...(acc[folder] || []), document];
    return acc;
  }, {});
  return (
    <div className="grid gap-4">
      <BrandBriefPanel
        brief={brief}
        canManage={canManageBriefs}
        attachableBriefs={attachableBriefs}
        onAttach={onAttachBrief}
        onDetach={onDetachBrief}
        working={working}
      />
      {open ? (
        <form onSubmit={(e) => { onSubmit(e); }} className="rounded-2xl border border-brand-stroke/40 bg-white p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[13px] font-bold text-brand-navy">Add a file</p>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1.5 text-brand-body/50 transition hover:bg-brand-bg"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title"><TextInput value={form.title} onChange={(title) => setForm({ ...form, title })} placeholder="Document name" required /></Field>
            <Field label="File URL / link"><TextInput value={form.file_url} onChange={(file_url) => setForm({ ...form, file_url })} placeholder="Paste a shared link" required /></Field>
            <Field label="Folder"><select value={form.folder} onChange={(e) => setForm({ ...form, folder: e.target.value })} className={inputClass}>{DOCUMENT_FOLDERS.map((f) => <option key={f} value={f}>{f}</option>)}</select></Field>
          </div>
          <div className="mt-4 flex justify-end">
            <button type="submit" disabled={working === "add_document"} className="inline-flex h-11 items-center gap-2 rounded-full bg-[#0A4FE8] px-6 text-[13px] font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-[#083FC2] active:scale-95 disabled:opacity-60">
              {working === "add_document" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} Add file
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-brand-stroke/60 bg-brand-bg/40 py-3.5 text-[13px] font-semibold text-brand-blue transition hover:border-brand-blue/50 hover:bg-blue-50">
          <FileUp className="h-4 w-4" /> Add a file
        </button>
      )}
      {documents.length === 0 ? (
        <EmptyState icon={FileUp} title="No files yet" body="Add briefs, brand assets, contracts, and final deliverable links." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {Object.entries(grouped).map(([folder, docs]) => (
            <Panel key={folder} title={folder} icon={FileUp}>
              <div className="space-y-2">
                {docs.map((document) => (
                  <a key={document.id} href={document.file_url || "#"} target="_blank" rel="noreferrer" className="block rounded-2xl bg-brand-bg/70 px-3 py-2.5 transition hover:bg-blue-50">
                    <p className="truncate text-[13px] font-bold text-brand-navy">{document.title}</p>
                    <p className="text-[11px] text-brand-body/55">{label(document.visibility)} · {formatDate(document.created_at.slice(0, 10))}</p>
                  </a>
                ))}
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}

function ApprovalsTab({ approvals, tasks, milestones, members, form, setForm, onSubmit, decideApproval, working }: {
  approvals: ApprovalRow[];
  tasks: TaskRow[];
  milestones: MilestoneRow[];
  members: TeamMemberOption[];
  form: typeof emptyApprovalForm;
  setForm: (form: typeof emptyApprovalForm) => void;
  onSubmit: (event: React.FormEvent) => void;
  decideApproval: (approval: ApprovalRow, status: string) => void;
  working: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid gap-4">
      {open ? (
        <form onSubmit={(e) => { onSubmit(e); }} className="rounded-2xl border border-brand-stroke/40 bg-white p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[13px] font-bold text-brand-navy">Request an approval</p>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1.5 text-brand-body/50 transition hover:bg-brand-bg"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Task"><select value={form.task_id} onChange={(e) => setForm({ ...form, task_id: e.target.value, milestone_id: "" })} className={inputClass}><option value="">Select a task…</option>{tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>
            <Field label="or Milestone"><select value={form.milestone_id} onChange={(e) => setForm({ ...form, milestone_id: e.target.value, task_id: "" })} className={inputClass}><option value="">Select a milestone…</option>{milestones.map((m) => <option key={m.id} value={m.id}>{m.description}</option>)}</select></Field>
            <Field label="Reviewer"><select value={form.reviewer_member_id} onChange={(e) => setForm({ ...form, reviewer_member_id: e.target.value })} className={inputClass}><option value="">Select…</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select></Field>
            <Field label="Note"><TextInput value={form.note} onChange={(note) => setForm({ ...form, note })} placeholder="What needs review?" /></Field>
          </div>
          <div className="mt-4 flex justify-end">
            <button type="submit" disabled={working === "request_approval"} className="inline-flex h-11 items-center gap-2 rounded-full bg-[#0A4FE8] px-6 text-[13px] font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-[#083FC2] active:scale-95 disabled:opacity-60">
              {working === "request_approval" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Request approval
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-brand-stroke/60 bg-brand-bg/40 py-3.5 text-[13px] font-semibold text-brand-blue transition hover:border-brand-blue/50 hover:bg-blue-50">
          <ShieldCheck className="h-4 w-4" /> Request an approval
        </button>
      )}
      {approvals.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No approvals yet" body="Request internal reviews, manager approvals, or final sign-off." />
      ) : (
        <div className="grid gap-3">
          {approvals.map((approval) => (
            <div key={approval.id} className="rounded-3xl border border-brand-stroke/40 bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap gap-1.5">
                    <Pill value={label(approval.status)} className={statusClass(approval.status)} />
                    <Pill value={label(approval.approval_type)} />
                  </div>
                  <p className="mt-2 text-[14px] font-bold text-brand-navy">{approval.note || "Approval requested"}</p>
                  <p className="mt-1 text-[11px] text-brand-body/55">
                    Reviewer: {approval.reviewer_name || "Unassigned"} · Requested {formatDate(approval.requested_at.slice(0, 10))}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => decideApproval(approval, "approved")} className="h-9 rounded-xl bg-emerald-50 px-3 text-[12px] font-bold text-emerald-700">Approve</button>
                  <button type="button" onClick={() => decideApproval(approval, "revision_requested")} className="h-9 rounded-xl bg-amber-50 px-3 text-[12px] font-bold text-amber-700">Revision</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CalendarTab({ events }: { events: CalendarEvent[] }) {
  if (events.length === 0) return <EmptyState icon={CalendarDays} title="No calendar events" body="Project dates, milestone due dates, and task deadlines will appear here." />;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {events.map((event) => {
        const diff = daysUntil(event.event_date);
        return (
          <div key={event.id} className="rounded-3xl border border-brand-stroke/40 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Pill value={label(event.event_kind)} className={statusClass(event.status)} />
                <p className="mt-2 text-[14px] font-bold text-brand-navy">{event.title}</p>
                <p className="mt-1 text-[12px] text-brand-body/55">{formatDate(event.event_date)}</p>
              </div>
              <span className="rounded-2xl bg-brand-bg px-3 py-1.5 text-[11px] font-bold text-brand-body/70">
                {diff == null ? "" : diff < 0 ? `${Math.abs(diff)}d late` : diff === 0 ? "Today" : `${diff}d`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProjectCreateModal({ form, setForm, members, working, onClose, onSubmit }: {
  form: typeof emptyProjectForm;
  setForm: (form: typeof emptyProjectForm) => void;
  members: TeamMemberOption[];
  working: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  const steps = ["Basics", "Timeline", "Team"];
  const [step, setStep] = useState(0);
  const canNext = step !== 0 || (!!form.name.trim() && !!form.client.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#07143B]/40 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <form onSubmit={onSubmit} className="flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        {/* Header + stepper */}
        <div className="border-b border-brand-stroke/30 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-blue">New Project</p>
              <h2 className="mt-0.5 text-[20px] font-bold text-brand-navy sm:text-[22px]">Create a workspace</h2>
            </div>
            <button type="button" onClick={onClose} className="rounded-full p-2 text-brand-body/60 transition hover:bg-brand-bg"><X className="h-5 w-5" /></button>
          </div>
          <div className="mt-4"><Stepper steps={steps} current={step} /></div>
        </div>

        {/* Step body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {step === 0 && (
            <div className="grid gap-4">
              <Field label="Project name"><TextInput value={form.name} onChange={(name) => setForm({ ...form, name })} placeholder="e.g. Arcadia Branding" required /></Field>
              <Field label="Client"><TextInput value={form.client} onChange={(client) => setForm({ ...form, client })} placeholder="Client or company name" required /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Category"><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
                <Field label="Priority"><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={inputClass}>{PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{label(p)} priority</option>)}</select></Field>
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="grid gap-4">
              <Field label="Start date"><TextInput value={form.duration_start} onChange={(duration_start) => setForm({ ...form, duration_start })} type="date" /></Field>
              <Field label="Client delivery date"><TextInput value={form.client_delivery_date} onChange={(client_delivery_date) => setForm({ ...form, client_delivery_date, duration_end: client_delivery_date })} type="date" /></Field>
              <Field label="Internal deadline"><TextInput value={form.internal_deadline} onChange={(internal_deadline) => setForm({ ...form, internal_deadline })} type="date" /></Field>
            </div>
          )}
          {step === 2 && (
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Project manager"><select value={form.project_manager_id} onChange={(e) => setForm({ ...form, project_manager_id: e.target.value })} className={inputClass}><option value="">Select…</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select></Field>
                <Field label="Department lead"><select value={form.department_lead_id} onChange={(e) => setForm({ ...form, department_lead_id: e.target.value })} className={inputClass}><option value="">Select…</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select></Field>
              </div>
              <Field label="Description"><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What is this project about?" className={`${inputClass} min-h-[100px] py-2.5`} /></Field>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-brand-stroke/50 bg-brand-bg/50 px-4 py-3 text-[13px] font-semibold text-brand-navy">
                <input type="checkbox" checked={form.seed_milestones} onChange={(e) => setForm({ ...form, seed_milestones: e.target.checked })} className="h-4 w-4 accent-brand-blue" />
                Add default milestones
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-brand-stroke/30 p-4 sm:px-6">
          <WizardNav step={step} total={steps.length} onBack={() => setStep((s) => Math.max(0, s - 1))} onNext={() => setStep((s) => Math.min(steps.length - 1, s + 1))} submitLabel="Create project" submitting={working} canNext={canNext} />
        </div>
      </form>
    </div>
  );
}

function getSmartInsights(project: Project, tasks: TaskRow[], approvals: ApprovalRow[], events: CalendarEvent[]) {
  const today = new Date().toISOString().slice(0, 10);
  const overdueTasks = tasks.filter((task) => task.due_date && task.due_date < today && !["approved", "completed"].includes(task.status)).length;
  const pendingApprovals = approvals.filter((approval) => approval.status === "pending").length;
  const nextEvent = events.find((event) => event.event_date >= today);
  const insights = [
    `${project.progress}% complete across ${tasks.length} task${tasks.length === 1 ? "" : "s"} and ${project.milestone_count} milestone${project.milestone_count === 1 ? "" : "s"}.`,
  ];
  if (overdueTasks) insights.push(`${overdueTasks} overdue task${overdueTasks === 1 ? "" : "s"} need attention before delivery risk increases.`);
  if (pendingApprovals) insights.push(`${pendingApprovals} approval${pendingApprovals === 1 ? "" : "s"} waiting for review or sign-off.`);
  if (nextEvent) insights.push(`Next calendar pressure point: ${nextEvent.title} on ${formatDate(nextEvent.event_date)}.`);
  if (!overdueTasks && project.status !== "delayed") insights.push("No delay flag is currently active for this project.");
  return insights;
}

function Panel({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-brand-stroke/40 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-brand-blue" />
        <h3 className="text-[14px] font-bold text-brand-navy">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Pill({ value, className = "bg-brand-bg text-brand-body ring-brand-stroke/60" }: { value: string; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ring-1 ${className}`}>
      {value}
    </span>
  );
}

function Avatar({ name, src }: { name: string; src: string | null }) {
  void src;
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-blue text-[12px] font-bold text-white">
      {initials(name)}
    </div>
  );
}

function EmptyState({ icon: Icon, title, body }: { icon: React.ElementType; title: string; body: string }) {
  return (
    <div className="rounded-3xl bg-brand-bg/60 px-4 py-10 text-center">
      <Icon className="mx-auto h-8 w-8 text-brand-body/30" />
      <p className="mt-3 text-[14px] font-bold text-brand-navy">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-[12px] leading-5 text-brand-body/55">{body}</p>
    </div>
  );
}

const inputClass = "h-11 w-full rounded-xl border border-brand-stroke/60 bg-white px-3.5 text-[13px] font-medium text-brand-navy outline-none transition focus:border-brand-blue focus:ring-4 focus:ring-blue-100 placeholder:text-brand-body/40";
const smallInputClass = "h-10 w-full rounded-xl border border-brand-stroke/50 bg-white px-3 text-[12px] font-semibold text-brand-navy outline-none focus:border-brand-blue/40";

/** Labelled form field wrapper for the wizards. */
function Field({ label: fieldLabel, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-brand-body/55">{fieldLabel}</label>
      {children}
    </div>
  );
}

/** Compact numbered progress stepper for the wizards. */
function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center">
      {steps.map((s, i) => (
        <div key={s} className={`flex items-center ${i < steps.length - 1 ? "flex-1" : ""}`}>
          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold transition ${i < current ? "bg-brand-blue text-white" : i === current ? "bg-brand-blue text-white ring-4 ring-blue-100" : "bg-brand-bg text-brand-body/40"}`}>
            {i < current ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </div>
          <span className={`ml-2 hidden text-[12px] font-semibold sm:block ${i <= current ? "text-brand-navy" : "text-brand-body/40"}`}>{s}</span>
          {i < steps.length - 1 && <div className={`mx-2 h-0.5 flex-1 rounded ${i < current ? "bg-brand-blue" : "bg-brand-stroke/40"}`} />}
        </div>
      ))}
    </div>
  );
}

/** Shared wizard footer buttons (Back / Next / submit). */
function WizardNav({ step, total, onBack, onNext, submitLabel, submitting, canNext = true }: {
  step: number; total: number; onBack: () => void; onNext: () => void;
  submitLabel: string; submitting: boolean; canNext?: boolean;
}) {
  const isLast = step === total - 1;
  return (
    <div className="mt-5 flex items-center justify-between gap-3">
      <button type="button" onClick={onBack} disabled={step === 0}
        className="inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold text-brand-body transition hover:bg-brand-bg disabled:opacity-0">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      {isLast ? (
        <button type="submit" disabled={submitting}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-[#0A4FE8] px-6 text-[13px] font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-[#083FC2] active:scale-95 disabled:opacity-60">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {submitLabel}
        </button>
      ) : (
        <button type="button" onClick={onNext} disabled={!canNext}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-brand-navy px-6 text-[13px] font-bold text-white transition hover:bg-brand-navy/90 active:scale-95 disabled:opacity-40">
          Next <ArrowRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = "text", required = false }: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      type={type}
      required={required}
      className={inputClass}
    />
  );
}

// ── Kanban board ────────────────────────────────────────────────────────────
// Four honest columns; statuses that don't map 1:1 are bucketed for display but
// dragging always writes the exact column status.
const BOARD_COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: "not_started", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "under_review", label: "Review" },
  { key: "completed", label: "Done" },
];

function boardBucket(status: TaskStatus): TaskStatus {
  if (status === "delayed") return "in_progress";
  if (status === "needs_revision") return "under_review";
  if (status === "approved") return "completed";
  return status;
}

function TaskBoard({ tasks, onUpdateTask, canUpdateTask }: {
  tasks: TaskRow[];
  onUpdateTask: (task: TaskRow, patch: Record<string, unknown>) => void;
  canUpdateTask: (task: TaskRow) => boolean;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);
  return (
    <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
      {BOARD_COLUMNS.map((col) => {
        const items = tasks.filter((task) => boardBucket(task.status) === col.key);
        return (
          <div
            key={col.key}
            onDragOver={(event) => { event.preventDefault(); setOverCol(col.key); }}
            onDragLeave={() => setOverCol((current) => (current === col.key ? null : current))}
            onDrop={() => {
              setOverCol(null);
              const task = tasks.find((t) => t.id === dragId);
              setDragId(null);
              if (task && canUpdateTask(task) && boardBucket(task.status) !== col.key) onUpdateTask(task, { status: col.key });
            }}
            className={`flex w-[240px] shrink-0 flex-col rounded-2xl border p-2.5 transition ${
              overCol === col.key ? "border-brand-blue bg-blue-50/60" : "border-brand-stroke/40 bg-brand-bg/40"
            }`}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[12px] font-bold text-brand-navy">{col.label}</span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-brand-body/50">{items.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {items.length === 0 ? (
                <p className="rounded-xl border border-dashed border-brand-stroke/50 px-3 py-6 text-center text-[11px] text-brand-body/40">Drop tasks here</p>
              ) : (
                items.map((task) => (
                  <div
                    key={task.id}
                    draggable={canUpdateTask(task)}
                    onDragStart={() => setDragId(task.id)}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                    className={`${canUpdateTask(task) ? "cursor-grab active:cursor-grabbing" : "cursor-default"} rounded-xl border border-brand-stroke/40 bg-white p-3 shadow-sm transition ${
                      dragId === task.id ? "opacity-40" : "hover:border-brand-blue/40"
                    }`}
                  >
                    <div className="flex flex-wrap gap-1">
                      <Pill value={label(task.priority)} />
                      {task.department && <Pill value={task.department} />}
                    </div>
                    <p className="mt-1.5 text-[12.5px] font-bold leading-snug text-brand-navy">{task.title}</p>
                    <p className="mt-1 text-[10.5px] text-brand-body/50">
                      {task.assignee_name || "Unassigned"} · {task.due_date ? formatDate(task.due_date) : "No date"}
                    </p>
                    {task.progress > 0 && (
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-bg">
                        <div className="h-full rounded-full bg-brand-blue" style={{ width: `${task.progress}%` }} />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── My Work: every task assigned to me, across all projects ─────────────────
const MY_WORK_FILTERS = [
  { key: "active", label: "Active" },
  { key: "overdue", label: "Overdue" },
  { key: "done", label: "Done" },
  { key: "all", label: "All" },
] as const;
type MyWorkFilter = (typeof MY_WORK_FILTERS)[number]["key"];

function MyWorkView({ tasks, projects, myId, onUpdateTask, onOpenProject }: {
  tasks: TaskRow[];
  projects: Project[];
  myId: string;
  onUpdateTask: (task: TaskRow, patch: Record<string, unknown>) => void;
  onOpenProject: (projectId: string) => void;
}) {
  const [filter, setFilter] = useState<MyWorkFilter>("active");
  // Restore the last-used lens so it behaves like a saved view.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("work_mywork_filter") : null;
    if (saved && MY_WORK_FILTERS.some((f) => f.key === saved)) setFilter(saved as MyWorkFilter);
  }, []);
  const setSavedFilter = (next: MyWorkFilter) => {
    setFilter(next);
    try { window.localStorage.setItem("work_mywork_filter", next); } catch { /* ignore */ }
  };

  const mine = useMemo(() => {
    const isDone = (s: TaskStatus) => s === "completed" || s === "approved";
    const overdue = (task: TaskRow) => {
      const days = daysUntil(task.due_date);
      return days != null && days < 0 && !isDone(task.status);
    };
    return (tasks || [])
      .filter((task) => myId && task.assignee_id === myId)
      .filter((task) => {
        if (filter === "all") return true;
        if (filter === "done") return isDone(task.status);
        if (filter === "overdue") return overdue(task);
        return !isDone(task.status); // active
      });
  }, [tasks, myId, filter]);

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name || "Project";
  const grouped = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    for (const task of mine) {
      const list = map.get(task.project_id) || [];
      list.push(task);
      map.set(task.project_id, list);
    }
    return [...map.entries()];
  }, [mine]);

  const counts = useMemo(() => {
    const isDone = (s: TaskStatus) => s === "completed" || s === "approved";
    const owned = (tasks || []).filter((t) => myId && t.assignee_id === myId);
    return {
      active: owned.filter((t) => !isDone(t.status)).length,
      overdue: owned.filter((t) => { const d = daysUntil(t.due_date); return d != null && d < 0 && !isDone(t.status); }).length,
      done: owned.filter((t) => isDone(t.status)).length,
    };
  }, [tasks, myId]);

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric icon={FolderKanban} label="Active" value={counts.active} />
        <Metric icon={AlertTriangle} label="Overdue" value={counts.overdue} tone={counts.overdue ? "danger" : "default"} />
        <Metric icon={CheckCircle2} label="Done" value={counts.done} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/80 bg-white p-3 shadow-sm">
        <UserRound className="h-4 w-4 text-brand-blue" />
        <span className="mr-1 text-[13px] font-bold text-brand-navy">My tasks</span>
        <div className="flex items-center gap-1 rounded-full bg-brand-bg/70 p-1">
          {MY_WORK_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setSavedFilter(f.key)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
                filter === f.key ? "bg-white text-brand-navy shadow-sm" : "text-brand-body/70 hover:text-brand-navy"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {!myId ? (
        <EmptyState icon={UserRound} title="Identifying your work" body="Loading the tasks assigned to you." />
      ) : grouped.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Nothing here" body="No tasks match this view. Nice and clear." />
      ) : (
        <div className="space-y-4">
          {grouped.map(([projectId, list]) => (
            <div key={projectId} className="rounded-2xl border border-white/80 bg-white p-4 shadow-sm">
              <button
                type="button"
                onClick={() => onOpenProject(projectId)}
                className="mb-3 inline-flex items-center gap-1.5 text-[14px] font-bold text-brand-navy transition hover:text-brand-blue"
              >
                {projectName(projectId)} <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <div className="grid gap-2">
                {list.map((task) => {
                  const days = daysUntil(task.due_date);
                  const isDone = task.status === "completed" || task.status === "approved";
                  return (
                    <div key={task.id} className="flex flex-col gap-2 rounded-xl border border-brand-stroke/40 bg-brand-bg/30 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-bold text-brand-navy">{task.title}</p>
                        <p className="mt-0.5 text-[11px] text-brand-body/55">
                          {task.due_date ? `Due ${formatDate(task.due_date)}` : "No due date"}
                          {days != null && !isDone && days < 0 && <span className="ml-1 font-bold text-rose-600">· {Math.abs(days)}d overdue</span>}
                        </p>
                      </div>
                      <select
                        value={task.status}
                        onChange={(event) => onUpdateTask(task, { status: event.target.value })}
                        className={`${smallInputClass} sm:w-44`}
                      >
                        {TASK_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{label(status)}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Timeline (lightweight Gantt) ────────────────────────────────────────────
function TimelineTab({ milestones, tasks }: { milestones: MilestoneRow[]; tasks: TaskRow[] }) {
  const rows = useMemo(() => {
    return milestones
      .map((m) => {
        const startRaw = m.duration_start || m.due_date || m.duration_end;
        const endRaw = m.due_date || m.duration_end || m.duration_start;
        return startRaw && endRaw
          ? { id: m.id, label: m.description, status: m.status, progress: m.progress || 0, start: new Date(startRaw).getTime(), end: new Date(endRaw).getTime() }
          : null;
      })
      .filter((r): r is NonNullable<typeof r> => r != null && !Number.isNaN(r.start) && !Number.isNaN(r.end));
  }, [milestones]);

  const dueTasks = useMemo(
    () => tasks.filter((t) => t.due_date).map((t) => ({ id: t.id, label: t.title, at: new Date(t.due_date as string).getTime() })).filter((t) => !Number.isNaN(t.at)),
    [tasks],
  );

  if (rows.length === 0) {
    return <EmptyState icon={CalendarRange} title="No dated milestones" body="Add start and due dates to milestones to see them on the timeline." />;
  }

  const min = Math.min(...rows.map((r) => r.start), ...dueTasks.map((t) => t.at));
  const max = Math.max(...rows.map((r) => r.end), ...dueTasks.map((t) => t.at));
  const span = Math.max(1, max - min);
  const pct = (value: number) => `${Math.min(100, Math.max(0, ((value - min) / span) * 100))}%`;
  const today = Date.now();
  const todayInRange = today >= min && today <= max;

  return (
    <div className="rounded-2xl border border-brand-stroke/40 bg-white p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-brand-body/50">
        <span>{formatDate(new Date(min).toISOString())}</span>
        <span>{formatDate(new Date(max).toISOString())}</span>
      </div>
      <div className="relative space-y-3">
        {todayInRange && (
          <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-brand-blue/60" style={{ left: pct(today) }}>
            <span className="absolute -top-1 -translate-x-1/2 rounded-full bg-brand-blue px-1.5 py-0.5 text-[8px] font-bold text-white">TODAY</span>
          </div>
        )}
        {rows.map((row) => {
          const left = ((row.start - min) / span) * 100;
          const width = Math.max(4, ((row.end - row.start) / span) * 100);
          return (
            <div key={row.id}>
              <p className="mb-1 truncate text-[12px] font-semibold text-brand-navy">{row.label}</p>
              <div className="relative h-7 rounded-full bg-brand-bg">
                <div
                  className="absolute inset-y-0 flex items-center overflow-hidden rounded-full bg-[#0A4FE8]"
                  style={{ left: `${left}%`, width: `${width}%` }}
                >
                  <div className="h-full rounded-full bg-blue-800/40" style={{ width: `${row.progress}%` }} />
                  <span className="absolute left-2 text-[10px] font-bold text-white">{row.progress}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Command palette (⌘K) ────────────────────────────────────────────────────
function CommandPalette({ projects, canCreateProject, onClose, onSelectProject, onNewProject, onNewTask, onTab, onMyWork }: {
  projects: Project[];
  canCreateProject: boolean;
  onClose: () => void;
  onSelectProject: (id: string) => void;
  onNewProject?: () => void;
  onNewTask: () => void;
  onTab: (tab: string) => void;
  onMyWork: () => void;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  type Cmd = { id: string; label: string; hint: string; icon: React.ElementType; run: () => void };
  const commands = useMemo<Cmd[]>(() => {
    const list: Cmd[] = [];
    if (canCreateProject && onNewProject) list.push({ id: "new-project", label: "New project", hint: "Create", icon: Plus, run: onNewProject });
    list.push({ id: "new-task", label: "New task", hint: "Tasks", icon: Plus, run: onNewTask });
    list.push({ id: "my-work", label: "My Work", hint: "Lens", icon: UserRound, run: onMyWork });
    for (const t of ["overview", "tasks", "milestones", "timeline", "files", "approvals", "calendar"]) {
      list.push({ id: `tab-${t}`, label: `Go to ${label(t)}`, hint: "Tab", icon: ArrowRight, run: () => onTab(t) });
    }
    for (const p of projects) {
      list.push({ id: `project-${p.id}`, label: p.name, hint: p.client || "Project", icon: FolderKanban, run: () => onSelectProject(p.id) });
    }
    return list;
  }, [projects, canCreateProject, onNewProject, onNewTask, onTab, onMyWork, onSelectProject]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((c) => `${c.label} ${c.hint}`.toLowerCase().includes(needle));
  }, [commands, q]);

  useEffect(() => { setActive(0); }, [q]);

  const runAt = (index: number) => {
    const cmd = filtered[index];
    if (!cmd) return;
    cmd.run();
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="fixed inset-0 z-[80] flex items-start justify-center bg-brand-navy/40 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/80 bg-white shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-brand-stroke/40 px-4">
          <Search className="h-4 w-4 shrink-0 text-brand-body/40" />
          <input
            autoFocus
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") { event.preventDefault(); setActive((a) => Math.min(filtered.length - 1, a + 1)); }
              else if (event.key === "ArrowUp") { event.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              else if (event.key === "Enter") { event.preventDefault(); runAt(active); }
              else if (event.key === "Escape") { event.preventDefault(); onClose(); }
            }}
            placeholder="Jump to a project, task, or action..."
            className="h-14 w-full bg-transparent text-[14px] font-medium text-brand-navy outline-none placeholder:text-brand-body/40"
          />
          <kbd className="hidden shrink-0 rounded-md border border-brand-stroke/60 bg-brand-bg px-1.5 py-0.5 text-[10px] font-bold text-brand-body/50 sm:block">ESC</kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-brand-body/50">No matches.</p>
          ) : (
            filtered.map((cmd, index) => (
              <button
                key={cmd.id}
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => runAt(index)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                  active === index ? "bg-blue-50" : "hover:bg-brand-bg/60"
                }`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active === index ? "bg-brand-blue text-white" : "bg-brand-bg text-brand-body/50"}`}>
                  <cmd.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-brand-navy">{cmd.label}</span>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-brand-body/40">{cmd.hint}</span>
              </button>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
