"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileUp,
  Filter,
  FolderKanban,
  Loader2,
  MessageSquare,
  Milestone,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { appAlert } from "@/lib/app-notify";

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
  approvals: ApprovalRow[];
  activity: ActivityRow[];
  calendar_events: CalendarEvent[];
  chat_threads: ChatThread[];
  team_members: TeamMemberOption[];
  departments: string[];
  capabilities: { can_create_project: boolean; can_manage_projects: boolean };
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

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(value: string | null) {
  if (!value) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(`${value}T00:00:00`);
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
  const [tab, setTab] = useState("overview");
  const [createOpen, setCreateOpen] = useState(false);
  const [projectForm, setProjectForm] = useState(emptyProjectForm);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);
  const [docForm, setDocForm] = useState(emptyDocForm);
  const [approvalForm, setApprovalForm] = useState(emptyApprovalForm);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

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

  const postAction = async (action: string, payload: Record<string, unknown>) => {
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
      await load();
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
    const json = await postAction("create_project", projectForm);
    if (json?.project?.id) {
      setSelectedProjectId(json.project.id);
      setCreateOpen(false);
      setProjectForm(emptyProjectForm);
    }
  };

  const createTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProject) return;
    const json = await postAction("create_task", { ...taskForm, project_id: selectedProject.id });
    if (json?.task) setTaskForm(emptyTaskForm);
  };

  const addDocument = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProject) return;
    const json = await postAction("add_document", { ...docForm, project_id: selectedProject.id });
    if (json?.document) setDocForm(emptyDocForm);
  };

  const requestApproval = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProject) return;
    const json = await postAction("request_approval", { ...approvalForm, project_id: selectedProject.id });
    if (json?.approval) setApprovalForm(emptyApprovalForm);
  };

  const updateTask = async (task: TaskRow, patch: Record<string, unknown>) => {
    if (!selectedProject) return;
    await postAction("update_task", { project_id: selectedProject.id, task_id: task.id, ...patch });
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
    const json = await postAction("ensure_project_chat", { project_id: selectedProject.id });
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
        {data.capabilities.can_create_project && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand-blue px-5 text-[14px] font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-[#083EC0]"
          >
            <Plus className="h-4 w-4" />
            New Project
          </button>
        )}
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        <Metric icon={BriefcaseBusiness} label="Total" value={data.stats.total} />
        <Metric icon={FolderKanban} label="Active" value={data.stats.active} />
        <Metric icon={CheckCircle2} label="Completed" value={data.stats.completed} />
        <Metric icon={AlertTriangle} label="Delayed" value={data.stats.delayed} tone="danger" />
        <Metric icon={CalendarDays} label="Upcoming" value={data.stats.upcoming_deadlines} />
        <Metric icon={ShieldCheck} label="Approvals" value={data.stats.pending_approvals} />
        <Metric icon={Clock3} label="Overdue" value={data.stats.overdue_tasks} tone="danger" />
      </section>

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
        <aside className="rounded-2xl border border-white/80 bg-white p-3 shadow-sm sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-bold text-brand-navy">Projects</h2>
              <p className="text-[12px] text-brand-body/55">{filteredProjects.length} visible</p>
            </div>
            <Filter className="h-4 w-4 text-brand-body/40" />
          </div>
          <div className="space-y-2 xl:max-h-[calc(100dvh-360px)] xl:overflow-y-auto">
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
            <ProjectHeader project={selectedProject} onChat={openProjectChat} working={working === "ensure_project_chat"} />

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0 rounded-2xl border border-white/80 bg-white p-3 shadow-sm sm:p-4">
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  {["overview", "tasks", "milestones", "files", "approvals", "calendar"].map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setTab(item)}
                      className={`h-10 rounded-2xl px-3 text-[12px] font-bold transition ${
                        tab === item ? "bg-brand-blue text-white shadow-md shadow-blue-600/15" : "bg-brand-bg/70 text-brand-body hover:bg-blue-50 hover:text-brand-blue"
                      }`}
                    >
                      {label(item)}
                    </button>
                  ))}
                </div>

                <div className="mt-4">
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
                      working={working}
                      commentDrafts={commentDrafts}
                      setCommentDrafts={setCommentDrafts}
                      addComment={addComment}
                    />
                  )}
                  {tab === "milestones" && <MilestonesTab milestones={projectMilestones} />}
                  {tab === "files" && (
                    <FilesTab
                      documents={projectDocuments}
                      form={docForm}
                      setForm={setDocForm}
                      onSubmit={addDocument}
                      working={working}
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
                </div>
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

                <Panel title="Smart Analysis" icon={Sparkles}>
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

function ProjectHeader({ project, onChat, working }: { project: Project; onChat: () => void; working: boolean }) {
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
        <button
          type="button"
          onClick={onChat}
          disabled={working}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-brand-navy px-4 text-[13px] font-bold text-white transition hover:bg-[#101C3F] disabled:opacity-60"
        >
          {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
          Project chat
        </button>
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
      <div className="grid gap-3 md:grid-cols-3">
        <ProgressPanel title="Progress" value={project.progress} sub={`${project.task_count} tasks`} />
        <ProgressPanel title="Milestones" value={project.milestone_count ? Math.round((project.progress + 20) / 1.2) : 0} sub={`${project.milestone_count} planned`} />
        <ProgressPanel title="Team Coverage" value={Math.min(100, assignments.length * 18)} sub={`${assignments.length} assignment${assignments.length === 1 ? "" : "s"}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Project Intelligence" icon={Sparkles}>
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

function ProgressPanel({ title, value, sub }: { title: string; value: number; sub: string }) {
  const normalized = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="rounded-3xl bg-brand-bg/60 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-brand-body/50">{title}</p>
        <p className="text-[18px] font-bold text-brand-navy">{normalized}%</p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
        <div className="h-full rounded-full bg-brand-blue" style={{ width: `${normalized}%` }} />
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
  working,
  commentDrafts,
  setCommentDrafts,
  addComment,
}: {
  tasks: TaskRow[];
  members: TeamMemberOption[];
  departments: string[];
  form: typeof emptyTaskForm;
  setForm: (form: typeof emptyTaskForm) => void;
  onSubmit: (event: React.FormEvent) => void;
  onUpdateTask: (task: TaskRow, patch: Record<string, unknown>) => void;
  working: string | null;
  commentDrafts: Record<string, string>;
  setCommentDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  addComment: (task: TaskRow) => void;
}) {
  return (
    <div className="grid gap-4">
      <form onSubmit={onSubmit} className="rounded-3xl bg-brand-bg/60 p-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <TextInput value={form.title} onChange={(title) => setForm({ ...form, title })} placeholder="Task title" required />
          <TextInput value={form.due_date} onChange={(due_date) => setForm({ ...form, due_date })} type="date" />
          <select value={form.assignee_id} onChange={(event) => setForm({ ...form, assignee_id: event.target.value })} className={inputClass}>
            <option value="">Assign member</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}
          </select>
          <select value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} className={inputClass}>
            <option value="">Department</option>
            {departments.map((department) => <option key={department} value={department}>{department}</option>)}
          </select>
          <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} className={inputClass}>
            {PRIORITY_OPTIONS.map((priority) => <option key={priority} value={priority}>{label(priority)}</option>)}
          </select>
          <button type="submit" disabled={working === "create_task"} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand-blue px-4 text-[13px] font-bold text-white disabled:opacity-60">
            {working === "create_task" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add Task
          </button>
        </div>
        <textarea
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
          placeholder="Task description"
          className={`${inputClass} mt-3 min-h-[88px] py-3`}
        />
      </form>

      {tasks.length === 0 ? (
        <EmptyState icon={Milestone} title="No tasks yet" body="Create the first task and assign responsibility." />
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
                  <select value={task.status} onChange={(event) => onUpdateTask(task, { status: event.target.value })} className={smallInputClass}>
                    {TASK_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{label(status)}</option>)}
                  </select>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={task.progress}
                    onChange={(event) => onUpdateTask(task, { progress: Number(event.target.value) })}
                    className={smallInputClass}
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

function MilestonesTab({ milestones }: { milestones: MilestoneRow[] }) {
  if (milestones.length === 0) return <EmptyState icon={Milestone} title="No milestones" body="Milestones created for this project will show here." />;
  return (
    <div className="grid gap-3">
      {milestones.map((milestone, index) => (
        <div key={milestone.id} className="flex gap-3 rounded-3xl border border-brand-stroke/40 bg-white p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[13px] font-bold text-brand-blue">
            {index + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-1.5">
              <Pill value={label(milestone.status)} className={statusClass(milestone.status)} />
              <Pill value={`${milestone.progress || 0}%`} />
              <Pill value={label(milestone.approval_status)} />
            </div>
            <h3 className="mt-2 text-[15px] font-bold text-brand-navy">{milestone.description}</h3>
            <p className="mt-1 text-[12px] text-brand-body/55">
              {milestone.assigned_to || "Unassigned"} · Due {formatDate(milestone.due_date || milestone.duration_end)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function FilesTab({ documents, form, setForm, onSubmit, working }: {
  documents: ProjectDocument[];
  form: typeof emptyDocForm;
  setForm: (form: typeof emptyDocForm) => void;
  onSubmit: (event: React.FormEvent) => void;
  working: string | null;
}) {
  const grouped = documents.reduce<Record<string, ProjectDocument[]>>((acc, document) => {
    const folder = document.folder || "Client Files";
    acc[folder] = [...(acc[folder] || []), document];
    return acc;
  }, {});
  return (
    <div className="grid gap-4">
      <form onSubmit={onSubmit} className="grid gap-3 rounded-3xl bg-brand-bg/60 p-4 lg:grid-cols-2">
        <TextInput value={form.title} onChange={(title) => setForm({ ...form, title })} placeholder="Document title" required />
        <TextInput value={form.file_url} onChange={(file_url) => setForm({ ...form, file_url })} placeholder="File URL or shared link" required />
        <select value={form.folder} onChange={(event) => setForm({ ...form, folder: event.target.value })} className={inputClass}>
          {DOCUMENT_FOLDERS.map((folder) => <option key={folder} value={folder}>{folder}</option>)}
        </select>
        <button type="submit" disabled={working === "add_document"} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand-blue px-4 text-[13px] font-bold text-white disabled:opacity-60">
          {working === "add_document" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
          Add File
        </button>
      </form>
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
  return (
    <div className="grid gap-4">
      <form onSubmit={onSubmit} className="grid gap-3 rounded-3xl bg-brand-bg/60 p-4 lg:grid-cols-2">
        <select value={form.task_id} onChange={(event) => setForm({ ...form, task_id: event.target.value, milestone_id: "" })} className={inputClass}>
          <option value="">Task for approval</option>
          {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
        </select>
        <select value={form.milestone_id} onChange={(event) => setForm({ ...form, milestone_id: event.target.value, task_id: "" })} className={inputClass}>
          <option value="">Milestone for approval</option>
          {milestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.description}</option>)}
        </select>
        <select value={form.reviewer_member_id} onChange={(event) => setForm({ ...form, reviewer_member_id: event.target.value })} className={inputClass}>
          <option value="">Reviewer</option>
          {members.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}
        </select>
        <TextInput value={form.note} onChange={(note) => setForm({ ...form, note })} placeholder="Approval note" />
        <button type="submit" disabled={working === "request_approval"} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand-blue px-4 text-[13px] font-bold text-white disabled:opacity-60 lg:col-span-2">
          {working === "request_approval" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Request Approval
        </button>
      </form>
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
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#07143B]/35 p-3 backdrop-blur-sm sm:items-center sm:p-6">
      <form onSubmit={onSubmit} className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-blue">New Project</p>
            <h2 className="mt-1 text-[24px] font-bold text-brand-navy">Create Project Workspace</h2>
          </div>
          <button type="button" onClick={onClose} className="h-10 rounded-2xl bg-brand-bg px-4 text-[12px] font-bold text-brand-body">Close</button>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <TextInput value={form.name} onChange={(name) => setForm({ ...form, name })} placeholder="Project name" required />
          <TextInput value={form.client} onChange={(client) => setForm({ ...form, client })} placeholder="Client name" required />
          <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className={inputClass}>
            {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} className={inputClass}>
            {PRIORITY_OPTIONS.map((priority) => <option key={priority} value={priority}>{label(priority)} Priority</option>)}
          </select>
          <TextInput value={form.duration_start} onChange={(duration_start) => setForm({ ...form, duration_start })} type="date" />
          <TextInput value={form.client_delivery_date} onChange={(client_delivery_date) => setForm({ ...form, client_delivery_date, duration_end: client_delivery_date })} type="date" />
          <TextInput value={form.internal_deadline} onChange={(internal_deadline) => setForm({ ...form, internal_deadline })} type="date" />
          <select value={form.project_manager_id} onChange={(event) => setForm({ ...form, project_manager_id: event.target.value })} className={inputClass}>
            <option value="">Project manager</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}
          </select>
          <select value={form.department_lead_id} onChange={(event) => setForm({ ...form, department_lead_id: event.target.value })} className={inputClass}>
            <option value="">Department lead</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}
          </select>
          <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-brand-stroke/50 bg-brand-bg/50 px-4 text-[13px] font-bold text-brand-navy">
            <input
              type="checkbox"
              checked={form.seed_milestones}
              onChange={(event) => setForm({ ...form, seed_milestones: event.target.checked })}
              className="h-4 w-4 accent-brand-blue"
            />
            Add default milestones
          </label>
          <textarea
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder="Project description"
            className={`${inputClass} min-h-[112px] py-3 md:col-span-2`}
          />
        </div>
        <button type="submit" disabled={working} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-blue px-5 text-[14px] font-bold text-white disabled:opacity-60">
          {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create Project
        </button>
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
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className="h-9 w-9 rounded-full object-cover" />;
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-blue text-[12px] font-bold text-white">
      {name.charAt(0).toUpperCase()}
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

const inputClass = "h-12 w-full rounded-2xl border border-brand-stroke/50 bg-white px-4 text-[13px] font-semibold text-brand-navy outline-none transition focus:border-brand-blue/40 focus:ring-4 focus:ring-blue-100";
const smallInputClass = "h-10 w-full rounded-xl border border-brand-stroke/50 bg-white px-3 text-[12px] font-semibold text-brand-navy outline-none focus:border-brand-blue/40";

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
