"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Activity,
  Archive,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Copy,
  File,
  FileText,
  GripVertical,
  Link2,
  ListPlus,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Package,
  Paperclip,
  Send,
  Plus,
  RefreshCw,
  ClipboardList,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { appAlert, appConfirm } from "@/lib/app-notify";
import { PlatformMediaViewer } from "@/components/media/PlatformMediaViewer";
import {
  TASKBOARD_COLORS,
  TASK_PRIORITIES,
  type TaskPriority,
  type TaskboardAttachment,
  type TaskboardBoard,
  type TaskboardComment,
  type TaskboardDocumentOption,
  type TaskboardList,
  type TaskboardMember,
  type TaskboardPayload,
  type TaskboardTask,
} from "@/lib/taskboard/types";

interface Props {
  portal: "admin" | "team";
}

type TaskCompletionPatch = Pick<
  TaskboardTask,
  "completed_at" | "completed_by_kind" | "completed_by_id" | "completed_by_name"
>;

type Modal =
  | { type: "board" }
  | { type: "members" }
  | { type: "activity" }
  | { type: "task"; task: TaskboardTask }
  | null;

const fieldClass = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-[#0D1B39] outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100";
const taskDndId = (id: string) => `task:${id}`;
const listDndId = (id: string) => `list:${id}`;
const rawId = (id: string) => id.slice(id.indexOf(":") + 1);

function isImageAttachment(attachment: TaskboardAttachment) {
  return attachment.mime_type?.startsWith("image/") || /\.(png|jpe?g|webp|gif)(?:$|[?#])/i.test(attachment.url) || /\.(png|jpe?g|webp|gif)$/i.test(attachment.title);
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function dueInput(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function friendlyDue(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });
}

function isOverdue(task: TaskboardTask) {
  return !!task.due_at && !task.completed_at && new Date(task.due_at).getTime() < Date.now();
}

function priorityClass(priority: TaskPriority) {
  if (priority === "urgent") return "bg-rose-50 text-rose-700";
  if (priority === "high") return "bg-amber-50 text-amber-700";
  if (priority === "low") return "bg-slate-100 text-slate-500";
  return "bg-blue-50 text-blue-700";
}

function findTaskList(lists: TaskboardList[], taskId: string) {
  return lists.find((list) => list.tasks.some((task) => task.id === taskId)) || null;
}

function taskListElementId(id: string) {
  return `taskboard-list-${id}`;
}

export function Taskboard({ portal }: Props) {
  const [data, setData] = useState<TaskboardPayload | null>(null);
  const [lists, setLists] = useState<TaskboardList[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [newListTitle, setNewListTitle] = useState("");
  const [addingList, setAddingList] = useState(false);
  const sensors = useSensors(
    // Mouse users can begin dragging after a short movement. Touch users must
    // deliberately hold first, so ordinary vertical and horizontal swipes are
    // never mistaken for a task drag.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const scrollToList = useCallback((listId: string) => {
    document.getElementById(taskListElementId(listId))?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "start",
    });
  }, []);

  const load = useCallback(async (boardId?: string, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const params = new URLSearchParams({ portal });
      if (boardId) params.set("board_id", boardId);
      const res = await fetch(`/api/taskboard?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not load Taskboard.");
      setData(json);
      setLists(json.lists || []);
      if (typeof window !== "undefined") {
        const currentParams = new URLSearchParams(window.location.search);
        const linkedTaskId = currentParams.get("task_id");
        const linkedTask = linkedTaskId
          ? (json.lists || []).flatMap((list: TaskboardList) => list.tasks).find((task: TaskboardTask) => task.id === linkedTaskId)
          : null;
        if (linkedTask) {
          setModal({ type: "task", task: linkedTask });
          currentParams.delete("task_id");
          const query = currentParams.toString();
          window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load Taskboard.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [portal]);

  useEffect(() => {
    const boardId = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("board_id") || undefined
      : undefined;
    void load(boardId);
  }, [load]);

  const post = useCallback(async (action: string, payload: Record<string, unknown> = {}) => {
    const res = await fetch("/api/taskboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        portal,
        action,
        board_id: data?.board?.id,
        ...payload,
      }),
    });
    const json = await res.json().catch(() => ({ ok: false, error: "Taskboard request failed." }));
    if (!res.ok || !json.ok) throw new Error(json.error || "Taskboard request failed.");
    return json;
  }, [data?.board?.id, portal]);

  const updateTaskCompletion = useCallback((taskId: string, completion: TaskCompletionPatch) => {
    setLists((current) => current.map((list) => ({
      ...list,
      tasks: list.tasks.map((task) => task.id === taskId
        ? { ...task, ...completion }
        : task),
    })));
  }, []);

  const persistOrder = useCallback(async (nextLists: TaskboardList[]) => {
    try {
      await post("reorder", {
        columns: nextLists.map((list) => ({
          list_id: list.id,
          task_ids: list.tasks.map((task) => task.id),
        })),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the new order.");
      void load(data?.board?.id, true);
    }
  }, [data?.board?.id, load, post]);

  function onDragOver(event: DragOverEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : "";
    if (!activeId.startsWith("task:") || !overId) return;
    const activeTaskId = rawId(activeId);
    const source = findTaskList(lists, activeTaskId);
    const target = overId.startsWith("list:")
      ? lists.find((list) => list.id === rawId(overId))
      : findTaskList(lists, rawId(overId));
    if (!source || !target || source.id === target.id) return;

    setLists((current) => {
      const sourceList = current.find((list) => list.id === source.id);
      const targetList = current.find((list) => list.id === target.id);
      const moved = sourceList?.tasks.find((task) => task.id === activeTaskId);
      if (!sourceList || !targetList || !moved) return current;
      const overTaskId = overId.startsWith("task:") ? rawId(overId) : null;
      const targetIndex = overTaskId
        ? Math.max(0, targetList.tasks.findIndex((task) => task.id === overTaskId))
        : targetList.tasks.length;
      return current.map((list) => {
        if (list.id === sourceList.id) {
          return { ...list, tasks: list.tasks.filter((task) => task.id !== moved.id) };
        }
        if (list.id === targetList.id) {
          const tasks = [...list.tasks];
          tasks.splice(targetIndex, 0, { ...moved, list_id: list.id });
          return { ...list, tasks };
        }
        return list;
      });
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : "";
    if (!overId) return;

    if (activeId.startsWith("list:") && overId.startsWith("list:")) {
      const oldIndex = lists.findIndex((list) => list.id === rawId(activeId));
      const newIndex = lists.findIndex((list) => list.id === rawId(overId));
      if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
        const next = arrayMove(lists, oldIndex, newIndex);
        setLists(next);
        void persistOrder(next);
      }
      return;
    }

    if (!activeId.startsWith("task:")) return;
    const activeTaskId = rawId(activeId);
    const overTaskId = overId.startsWith("task:") ? rawId(overId) : null;
    let next = lists;
    const source = findTaskList(lists, activeTaskId);
    const target = overTaskId
      ? findTaskList(lists, overTaskId)
      : lists.find((list) => list.id === rawId(overId));
    if (source && target && source.id === target.id && overTaskId) {
      const oldIndex = source.tasks.findIndex((task) => task.id === activeTaskId);
      const newIndex = source.tasks.findIndex((task) => task.id === overTaskId);
      if (oldIndex !== newIndex) {
        next = lists.map((list) => list.id === source.id
          ? { ...list, tasks: arrayMove(list.tasks, oldIndex, newIndex) }
          : list);
        setLists(next);
      }
    }
    void persistOrder(next);
  }

  async function createList() {
    if (!newListTitle.trim()) return;
    setSaving(true);
    try {
      await post("create_list", { title: newListTitle });
      setNewListTitle("");
      setAddingList(false);
      await load(data?.board?.id, true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add list.");
    } finally {
      setSaving(false);
    }
  }

  async function archiveBoard() {
    if (!data?.board) return;
    const confirmed = await appConfirm({
      title: "Archive this board?",
      message: "The board will disappear from both dashboards. Its tasks and history stay in the database.",
      confirmLabel: "Archive board",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await post("archive_board");
      setBoardMenuOpen(false);
      await load();
      toast.success("Board archived.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not archive board.");
    }
  }

  const totalTasks = useMemo(() => lists.reduce((sum, list) => sum + list.tasks.length, 0), [lists]);
  const completedTasks = useMemo(() => lists.reduce((sum, list) => sum + list.tasks.filter((task) => task.completed_at).length, 0), [lists]);

  if (loading) {
    return <div className="grid min-h-[70vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[#0A4FE8]" /></div>;
  }

  return (
    <div className="min-h-[calc(100dvh-80px)] w-full min-w-0 max-w-full overflow-x-hidden bg-[#F4F7FD]">
      <header className="px-4 pt-4 md:px-7">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-4 rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm md:px-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold text-[#0A4FE8]">HRM · Taskboard</p>
              {data?.board && (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10.5px] font-semibold text-slate-500">
                  {completedTasks}/{totalTasks} complete
                </span>
              )}
            </div>
            <div className="relative mt-1 inline-flex max-w-full items-center gap-2">
              <button
                type="button"
                onClick={() => setBoardMenuOpen((open) => !open)}
                className="inline-flex max-w-full items-center gap-2 rounded-xl px-1 py-1 text-left transition hover:bg-slate-50"
              >
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: data?.board?.color || "#0A4FE8" }} />
                <span className="truncate text-[25px] font-bold tracking-tight text-[#0D1B39]">
                  {data?.board?.title || "Taskboard"}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
              {boardMenuOpen && (
                <button
                  type="button"
                  aria-label="Close board menu"
                  onClick={() => setBoardMenuOpen(false)}
                  className="fixed inset-0 z-30 cursor-default"
                />
              )}
              {boardMenuOpen && (
                <div className="absolute left-0 top-full z-40 mt-2 w-[min(300px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-100 bg-white p-2 shadow-xl">
                  <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Your boards</p>
                  {(data?.boards || []).map((board) => (
                    <button
                      key={board.id}
                      type="button"
                      onClick={() => {
                        setBoardMenuOpen(false);
                        void load(board.id);
                      }}
                      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold ${
                        data?.board?.id === board.id ? "bg-blue-50 text-[#0A4FE8]" : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: board.color }} />
                      <span className="truncate">{board.title}</span>
                      {data?.board?.id === board.id && <Check className="ml-auto h-4 w-4" />}
                    </button>
                  ))}
                  {(portal === "admin" || (data?.board && data.viewer.can_manage)) && <div className="my-2 border-t border-slate-100" />}
                  {portal === "admin" && (
                    <button type="button" onClick={() => { setBoardMenuOpen(false); setModal({ type: "board" }); }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-[#0A4FE8] hover:bg-blue-50">
                      <Plus className="h-4 w-4" /> New board
                    </button>
                  )}
                  {data?.board && data.viewer.can_manage && (
                    <button type="button" onClick={archiveBoard}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-rose-600 hover:bg-rose-50">
                      <Archive className="h-4 w-4" /> Archive board
                    </button>
                  )}
                </div>
              )}
            </div>
            <p className="mt-1 max-w-2xl text-[12.5px] text-slate-500">
              {data?.board?.description || "Create a shared board, organise work into lists and move tasks as priorities change."}
            </p>
          </div>

          <div className="-mx-1 flex flex-nowrap items-center gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
            {portal === "admin" && (
              <button type="button" onClick={() => setModal({ type: "board" })}
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-[12px] font-bold text-white shadow-md shadow-blue-200 hover:bg-[#083EC0]">
                <Plus className="h-4 w-4" /> New board
              </button>
            )}
            <button type="button" onClick={() => void load(data?.board?.id, true)}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600 hover:bg-slate-50">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            {data?.board && (
              <>
                <button type="button" onClick={() => setModal({ type: "activity" })}
                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600 hover:bg-slate-50">
                  <Activity className="h-4 w-4" /> Activity
                </button>
                <button type="button" onClick={() => setModal({ type: "members" })}
                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600 hover:bg-slate-50">
                  <Users className="h-4 w-4" /> Members
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px]">{data.members.length}</span>
                </button>
                {data.viewer.can_add_list && (
                  <button type="button" onClick={() => setAddingList(true)}
                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-[12px] font-bold text-[#0A4FE8] hover:bg-blue-100">
                    <ListPlus className="h-4 w-4" /> Add list
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {!data?.board ? (
        <div className="mx-auto grid min-h-[65vh] max-w-xl place-items-center px-4 text-center">
          <div>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-blue-50 text-[#0A4FE8]">
              <ClipboardList className="h-7 w-7" />
            </div>
            {portal === "admin" ? (
              <>
                <h2 className="mt-5 text-2xl font-bold text-[#0D1B39]">Start one smooth workflow</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Create a board for the team, a department or a project. Add members, files, cDocs and external references to every task.
                </p>
                <button type="button" onClick={() => setModal({ type: "board" })}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 py-3 text-sm font-bold text-white">
                  <Plus className="h-4 w-4" /> Create your first board
                </button>
              </>
            ) : (
              <>
                <h2 className="mt-5 text-2xl font-bold text-[#0D1B39]">No taskboard yet</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  An admin will set up a board for your team. Once tasks are assigned to you, they will show up here.
                </p>
              </>
            )}
          </div>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        >
          {lists.length > 0 && (
            <nav className="px-4 pt-3 md:px-7 lg:hidden" aria-label="Taskboard lists">
              <div className="rounded-2xl border border-blue-100 bg-white p-2.5 shadow-sm">
                <div className="flex items-center justify-between gap-3 px-1">
                  <span className="text-[11px] font-semibold text-[#0D1B39]">Jump to a list</span>
                  <span className="text-[10px] text-slate-400">Swipe sideways or tap</span>
                </div>
                <div className="mt-2 flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {lists.map((list) => (
                    <button
                      key={list.id}
                      type="button"
                      onClick={() => scrollToList(list.id)}
                      className="inline-flex min-h-9 shrink-0 snap-start items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[11.5px] font-semibold text-slate-600 active:border-blue-300 active:bg-blue-50 active:text-[#0A4FE8]"
                    >
                      <span className="max-w-[150px] truncate">{list.title}</span>
                      <span className="rounded-full bg-white px-1.5 py-0.5 text-[9.5px] font-bold text-slate-500">
                        {list.tasks.filter((task) => !task.completed_at).length}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </nav>
          )}
          <div
            data-testid="taskboard-scroll-area"
            className="w-full min-w-0 snap-x snap-proximity scroll-smooth scroll-px-4 overflow-x-auto overflow-y-hidden overscroll-x-contain px-4 pb-6 pt-3 [scrollbar-width:thin] md:scroll-px-7 md:px-7 lg:h-[calc(100dvh-230px)] lg:min-h-[420px] lg:snap-none lg:overflow-auto lg:overscroll-contain lg:py-5"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <SortableContext items={lists.map((list) => listDndId(list.id))} strategy={horizontalListSortingStrategy}>
              <div className="flex w-max min-w-full items-start gap-3 pb-4 sm:gap-4">
                {lists.map((list) => (
                  <TaskList
                    key={list.id}
                    list={list}
                    portal={portal}
                    boardMembers={data.members}
                    canEdit={data.viewer.can_edit}
                    canManage={
                      data.viewer.can_manage
                      || (list.created_by_kind === data.viewer.kind && list.created_by_id === data.viewer.id)
                    }
                    canReorder={data.viewer.can_manage}
                    availableMembers={data.available_members}
                    onReload={() => load(data.board?.id, true)}
                    onTaskCompletionChange={updateTaskCompletion}
                    onOpenTask={(task) => setModal({ type: "task", task })}
                    post={post}
                  />
                ))}
                {lists.length === 0 && !data.viewer.can_view_all_tasks && !addingList && (
                  <div className="grid min-h-[320px] w-full min-w-[280px] place-items-center rounded-2xl border border-dashed border-blue-200 bg-white/70 px-6 text-center">
                    <div>
                      <CheckCircle2 className="mx-auto h-7 w-7 text-[#0A4FE8]" />
                      <h2 className="mt-3 text-base font-bold text-[#0D1B39]">No tasks assigned yet</h2>
                      <p className="mt-1 text-[12px] leading-5 text-slate-500">
                        Create your own board or start a private list here. Other members only see a list when a task inside it is assigned to them.
                      </p>
                      <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
                        {data.viewer.can_add_list && (
                          <button type="button" onClick={() => setAddingList(true)}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-[12px] font-bold text-white">
                            <ListPlus className="h-4 w-4" /> Create a list
                          </button>
                        )}
                        {portal === "admin" && (
                          <button type="button" onClick={() => setModal({ type: "board" })}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 text-[12px] font-bold text-[#0A4FE8]">
                            <Plus className="h-4 w-4" /> Create a board
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {addingList && (
                  <div className="w-[310px] shrink-0 rounded-2xl border border-blue-200 bg-white p-3 shadow-sm">
                    <input autoFocus value={newListTitle} onChange={(event) => setNewListTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void createList();
                        if (event.key === "Escape") setAddingList(false);
                      }}
                      placeholder="List name" className={fieldClass} />
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={createList} disabled={saving}
                        className="rounded-lg bg-[#0A4FE8] px-5 py-2 text-[12px] font-bold text-white hover:bg-[#083EC0] disabled:opacity-50">
                        Add list
                      </button>
                      <button type="button" onClick={() => setAddingList(false)}
                        className="rounded-lg px-4 py-2 text-[12px] font-semibold text-slate-500 hover:bg-slate-100">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </SortableContext>
          </div>
        </DndContext>
      )}

      {modal?.type === "board" && (
        <CreateBoardModal
          portal={portal}
          members={data?.available_members || []}
          onClose={() => setModal(null)}
          onCreated={async (board: TaskboardBoard) => {
            setModal(null);
            await load(board.id);
          }}
        />
      )}
      {modal?.type === "members" && data?.board && (
        <MembersModal
          members={data.members}
          available={data.available_members}
          canManage={data.viewer.can_manage}
          post={post}
          onClose={() => setModal(null)}
          onChanged={() => load(data.board?.id, true)}
        />
      )}
      {modal?.type === "activity" && (
        <ActivityModal activity={data?.activity || []} onClose={() => setModal(null)} />
      )}
      {modal?.type === "task" && data?.board && (
        <TaskModal
          portal={portal}
          task={modal.task}
          members={data.available_members}
          boardMemberIds={data.members.map((member) => member.id)}
          lists={lists}
          documents={data.document_options}
          canDuplicate={data.viewer.can_edit}
          post={post}
          onClose={() => setModal(null)}
          onChanged={async () => {
            setModal(null);
            await load(data.board?.id, true);
          }}
        />
      )}
    </div>
  );
}

function TaskList({
  list,
  boardMembers,
  canEdit,
  canManage,
  canReorder,
  availableMembers,
  onReload,
  onTaskCompletionChange,
  onOpenTask,
  post,
}: {
  list: TaskboardList;
  portal: "admin" | "team";
  boardMembers: TaskboardMember[];
  canEdit: boolean;
  canManage: boolean;
  canReorder: boolean;
  availableMembers: TaskboardMember[];
  onReload: () => Promise<void>;
  onTaskCompletionChange: (taskId: string, completion: TaskCompletionPatch) => void;
  onOpenTask: (task: TaskboardTask) => void;
  post: (action: string, payload?: Record<string, unknown>) => Promise<any>;
}) {
  const [title, setTitle] = useState(list.title);
  const [newTask, setNewTask] = useState("");
  const [adding, setAdding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [achievedOpen, setAchievedOpen] = useState(false);
  const activeTasks = useMemo(() => list.tasks.filter((task) => !task.completed_at), [list.tasks]);
  const achievedTasks = useMemo(() => list.tasks
    .filter((task) => !!task.completed_at)
    .sort((left, right) => new Date(right.completed_at || 0).getTime() - new Date(left.completed_at || 0).getTime()), [list.tasks]);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: listDndId(list.id),
    data: { type: "list", listId: list.id },
    // Only a board manager may reorder the lists themselves, but the column has
    // to stay a drop target for everyone: a boolean `disabled` switches off the
    // droppable as well as the draggable, which stopped anyone else dropping a
    // task into another list at all, and into an empty list in particular.
    disabled: { draggable: !canReorder, droppable: false },
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  async function createTask() {
    if (!newTask.trim()) return;
    try {
      await post("create_task", {
        list_id: list.id,
        title: newTask,
        priority: "medium",
        assignee_ids: [],
      });
      setNewTask("");
      setAdding(false);
      await onReload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add task.");
    }
  }

  async function saveTitle() {
    if (!title.trim() || title.trim() === list.title) {
      setTitle(list.title);
      return;
    }
    try {
      await post("update_list", { list_id: list.id, title });
      await onReload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rename list.");
      setTitle(list.title);
    }
  }

  async function deleteList() {
    const confirmed = await appConfirm({
      title: `Delete “${list.title}”?`,
      message: "Only empty lists can be deleted.",
      confirmLabel: "Delete list",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await post("delete_list", { list_id: list.id });
      await onReload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete list.");
    }
  }

  return (
    <section
      id={taskListElementId(list.id)}
      data-taskboard-list={list.id}
      ref={setNodeRef}
      style={style}
      className={`w-[calc(100vw-2.5rem)] min-w-[272px] max-w-[310px] shrink-0 scroll-mx-4 snap-start rounded-2xl border border-slate-200/70 bg-slate-100 p-2.5 shadow-sm sm:w-[310px] sm:min-w-[310px] md:scroll-mx-7 lg:snap-none ${isDragging ? "opacity-60" : ""}`}
    >
      <div className="mb-2 flex items-center gap-1.5 px-1.5">
        {canReorder ? (
          <button type="button" {...attributes} {...listeners} className="touch-none cursor-grab rounded-lg p-1.5 text-slate-400 hover:bg-white active:cursor-grabbing" aria-label={`Move ${list.title}`}>
            <GripVertical className="h-4 w-4" />
          </button>
        ) : (
          <span className="h-7 w-1" aria-hidden="true" />
        )}
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => canManage && void saveTitle()}
          readOnly={!canManage}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setTitle(list.title);
              event.currentTarget.blur();
            }
          }}
          className="min-w-0 flex-1 rounded-lg bg-transparent px-2.5 py-1.5 text-[13px] font-bold text-[#0D1B39] outline-none transition focus:bg-white"
        />
        <span className="rounded-full bg-white px-2 py-0.5 text-[10.5px] font-bold text-slate-500">{activeTasks.length}</span>
        {canManage && <div className="relative">
          <button type="button" onClick={() => setMenuOpen((open) => !open)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white">
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-20 cursor-default"
            />
          )}
          {menuOpen && (
            <div className="absolute right-0 top-full z-30 mt-1 w-44 rounded-xl border border-slate-100 bg-white p-1.5 shadow-xl">
              <button type="button" onClick={() => { setMenuOpen(false); setPeopleOpen(true); }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] font-semibold text-slate-700 hover:bg-slate-50">
                <UserPlus className="h-3.5 w-3.5" /> Add people
              </button>
              <button type="button" onClick={() => { setMenuOpen(false); void deleteList(); }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] font-semibold text-rose-600 hover:bg-rose-50">
                <Trash2 className="h-3.5 w-3.5" /> Delete list
              </button>
            </div>
          )}
        </div>}
      </div>

      {list.members.length > 0 && (
        <div className="mb-2 flex items-center gap-1.5 px-1.5">
          <span className="flex -space-x-1.5">
            {list.members.slice(0, 5).map((member) => (
              <span key={member.id} title={member.full_name} className="grid h-6 w-6 place-items-center rounded-full border-2 border-[#EAF0FA] bg-[#0A4FE8] text-[8px] font-bold text-white">
                {initials(member.full_name)}
              </span>
            ))}
          </span>
          {list.members.length > 5 && (
            <span className="text-[10.5px] font-semibold text-slate-400">+{list.members.length - 5}</span>
          )}
          <span className="text-[10.5px] text-slate-400">
            {list.members.length === 1 ? "1 person" : `${list.members.length} people`} on this list
          </span>
        </div>
      )}

      {peopleOpen && (
        <ListPeopleModal
          list={list}
          available={availableMembers}
          post={post}
          onClose={() => setPeopleOpen(false)}
          onChanged={onReload}
        />
      )}

      <SortableContext items={activeTasks.map((task) => taskDndId(task.id))} strategy={verticalListSortingStrategy}>
        <div className="min-h-3 space-y-2">
          {activeTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              boardMembers={boardMembers}
              onOpen={() => onOpenTask(task)}
              onCompletionChange={(taskId, completion) => {
                if (completion.completed_at) setAchievedOpen(false);
                onTaskCompletionChange(taskId, completion);
              }}
              post={post}
            />
          ))}
        </div>
      </SortableContext>

      {canEdit && (adding ? (
        <div className="mt-2 rounded-xl bg-white p-2.5 shadow-sm">
          <textarea
            autoFocus
            rows={2}
            value={newTask}
            onChange={(event) => setNewTask(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void createTask();
              }
              if (event.key === "Escape") setAdding(false);
            }}
            placeholder="Task title"
            className="w-full resize-none rounded-lg bg-transparent px-3 py-2 text-[13px] text-[#0D1B39] outline-none"
          />
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={createTask} className="rounded-lg bg-[#0A4FE8] px-5 py-2 text-[12px] font-bold text-white hover:bg-[#083EC0]">Add</button>
            <button type="button" onClick={() => setAdding(false)} className="rounded-lg px-4 py-2 text-[12px] font-semibold text-slate-500 hover:bg-slate-100">Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)}
          className="mt-2 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-[12px] font-semibold text-slate-500 transition hover:bg-white hover:text-[#0A4FE8]">
          <Plus className="h-4 w-4" /> Add a task
        </button>
      ))}

      {achievedTasks.length > 0 && (
        <div className="mt-2 border-t border-slate-200/80 pt-2">
          <button
            type="button"
            onClick={() => setAchievedOpen((open) => !open)}
            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[12px] font-semibold text-slate-500 transition hover:bg-white hover:text-[#0A4FE8]"
            aria-expanded={achievedOpen}
          >
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>Achieved</span>
            <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500">{achievedTasks.length}</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${achievedOpen ? "rotate-180" : ""}`} />
          </button>
          {achievedOpen && (
            <SortableContext items={achievedTasks.map((task) => taskDndId(task.id))} strategy={verticalListSortingStrategy}>
              <div className="mt-2 space-y-2">
                {achievedTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    boardMembers={boardMembers}
                    disableDrag
                    onOpen={() => onOpenTask(task)}
                    onCompletionChange={onTaskCompletionChange}
                    post={post}
                  />
                ))}
              </div>
            </SortableContext>
          )}
        </div>
      )}
    </section>
  );
}

function TaskCard({
  task,
  onOpen,
  onCompletionChange,
  post,
  disableDrag = false,
}: {
  task: TaskboardTask;
  boardMembers: TaskboardMember[];
  onOpen: () => void;
  onCompletionChange: (taskId: string, completion: TaskCompletionPatch) => void;
  post: (action: string, payload?: Record<string, unknown>) => Promise<any>;
  disableDrag?: boolean;
}) {
  const [completionSaving, setCompletionSaving] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: taskDndId(task.id),
    data: { type: "task", taskId: task.id, listId: task.list_id },
    disabled: disableDrag,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  async function toggleComplete(event: React.MouseEvent) {
    event.stopPropagation();
    if (completionSaving) return;
    const completed = !task.completed_at;
    const previous: TaskCompletionPatch = {
      completed_at: task.completed_at,
      completed_by_kind: task.completed_by_kind,
      completed_by_id: task.completed_by_id,
      completed_by_name: task.completed_by_name,
    };
    onCompletionChange(task.id, {
      completed_at: completed ? new Date().toISOString() : null,
      completed_by_kind: completed ? task.completed_by_kind : null,
      completed_by_id: completed ? task.completed_by_id : null,
      completed_by_name: completed ? task.completed_by_name : null,
    });
    setCompletionSaving(true);
    try {
      const result = await post("set_task_completion", {
        task_id: task.id,
        completed,
      });
      const persisted = result?.task as (TaskCompletionPatch & { id?: string }) | undefined;
      if (!persisted || persisted.id !== task.id || Boolean(persisted.completed_at) !== completed) {
        throw new Error("The task completion state was not saved.");
      }
      onCompletionChange(task.id, persisted);
      toast.success(completed ? "Task moved to Achieved." : "Task reopened.");
    } catch (error) {
      onCompletionChange(task.id, previous);
      toast.error(error instanceof Error ? error.message : "Could not update task.");
    } finally {
      setCompletionSaving(false);
    }
  }

  return (
    <article
      ref={setNodeRef}
      style={style}
      onClick={onOpen}
      className={`group touch-manipulation cursor-pointer rounded-xl border border-white bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${isDragging ? "opacity-60 shadow-xl" : ""}`}
    >
      <div className="flex items-start gap-2">
        <button type="button" onClick={toggleComplete} disabled={completionSaving}
          className="mt-0.5 shrink-0 text-slate-300 hover:text-emerald-600 disabled:cursor-wait disabled:opacity-60"
          aria-label={task.completed_at ? "Reopen task" : "Complete task"}>
          {completionSaving
            ? <Loader2 className="h-4.5 w-4.5 animate-spin text-[#0A4FE8]" />
            : task.completed_at
              ? <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" />
              : <Circle className="h-4.5 w-4.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={`text-[13px] font-semibold leading-5 ${task.completed_at ? "text-slate-400 line-through" : "text-[#0D1B39]"}`}>
            {task.title}
          </p>
          {task.notes && <p className="mt-1 line-clamp-2 text-[11.5px] leading-4 text-slate-500">{task.notes}</p>}
        </div>
        {!disableDrag && (
          <button type="button" {...attributes} {...listeners} onClick={(event) => event.stopPropagation()}
            className="grid h-8 w-8 shrink-0 touch-none cursor-grab place-items-center rounded-lg text-slate-300 opacity-100 transition hover:bg-slate-50 active:cursor-grabbing sm:h-auto sm:w-auto sm:rounded sm:p-1 sm:opacity-0 sm:group-hover:opacity-100" aria-label={`Move ${task.title}`}>
            <GripVertical className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-md px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${priorityClass(task.priority)}`}>
          {task.priority}
        </span>
        {task.due_at && (
          <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
            isOverdue(task) ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-500"
          }`}>
            <Calendar className="h-3 w-3" /> {friendlyDue(task.due_at)}
          </span>
        )}
        {task.attachments.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
            <Paperclip className="h-3 w-3" /> {task.attachments.length}
          </span>
        )}
        {task.assignees.length > 0 && (
          <span className="ml-auto flex -space-x-1.5">
            {task.assignees.slice(0, 3).map((member) => (
              <span key={member.id} title={member.full_name} className="grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-[#0A4FE8] text-[8px] font-bold text-white">
                {initials(member.full_name)}
              </span>
            ))}
            {task.assignees.length > 3 && (
              <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-slate-200 text-[8px] font-bold text-slate-600">
                +{task.assignees.length - 3}
              </span>
            )}
          </span>
        )}
      </div>
    </article>
  );
}

function ModalShell({ title, subtitle, onClose, children, wide = false }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#040B37]/55 p-2 backdrop-blur-sm sm:p-4" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <div className={`max-h-[96dvh] w-full overflow-x-hidden overflow-y-auto overscroll-contain rounded-[20px] border border-white/70 bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-[24px] ${wide ? "max-w-4xl" : "max-w-xl"}`}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
          <div>
            <h2 className="text-[19px] font-bold text-[#0D1B39]">{title}</h2>
            {subtitle && <p className="mt-1 text-[12px] text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function memberDepartments(member: TaskboardMember) {
  return Array.from(new Set([
    ...(member.departments || []),
    ...(member.department ? [member.department] : []),
  ].map((name) => name.trim()).filter(Boolean)));
}

function MemberPicker({
  members,
  selectedIds,
  onChange,
  boardMemberIds = [],
}: {
  members: TaskboardMember[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  boardMemberIds?: string[];
}) {
  const [department, setDepartment] = useState("");
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const availableIds = useMemo(() => new Set(members.map((member) => member.id)), [members]);
  const taskboardTeamIds = useMemo(
    () => boardMemberIds.filter((id) => availableIds.has(id)),
    [availableIds, boardMemberIds],
  );
  const departments = useMemo(
    () => Array.from(new Set(members.flatMap(memberDepartments))).sort((a, b) => a.localeCompare(b)),
    [members],
  );

  function toggleGroup(ids: string[]) {
    const uniqueIds = Array.from(new Set(ids.filter((id) => availableIds.has(id))));
    const allSelected = uniqueIds.length > 0 && uniqueIds.every((id) => selected.has(id));
    if (allSelected) {
      const removed = new Set(uniqueIds);
      onChange(selectedIds.filter((id) => !removed.has(id)));
      return;
    }
    onChange(Array.from(new Set([...selectedIds, ...uniqueIds])));
  }

  function selectGroup(value: string) {
    setDepartment("");
    if (!value) return;
    if (value === "__everyone__") {
      toggleGroup(members.map((member) => member.id));
      return;
    }
    if (value === "__team__") {
      toggleGroup(taskboardTeamIds);
      return;
    }
    if (value.startsWith("dept:")) {
      const name = value.slice(5);
      toggleGroup(
        members
          .filter((member) => memberDepartments(member).includes(name))
          .map((member) => member.id),
      );
    }
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-white">
      <div className="border-b border-slate-100 p-3">
        {/* Promoted from a footnote to the card's title so the picker's purpose
            leads. Group shortcuts (Everyone / Taskboard team) now live inside the
            selector below instead of as separate buttons. */}
        <p className="text-[12px] font-semibold text-[#0D1B39]">Select people individually or use a group.</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <select value={department} onChange={(event) => selectGroup(event.target.value)}
            className="min-h-9 min-w-[180px] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11.5px] font-semibold text-slate-600 outline-none focus:border-blue-300">
            <option value="">Select a group or department</option>
            <option value="__everyone__">Everyone</option>
            {taskboardTeamIds.length > 0 && <option value="__team__">Taskboard team</option>}
            {departments.length > 0 && (
              <optgroup label="Departments">
                {departments.map((name) => <option key={name} value={`dept:${name}`}>{name}</option>)}
              </optgroup>
            )}
          </select>
          <strong className="whitespace-nowrap text-[12px] font-bold text-[#0A4FE8]">{selectedIds.length} selected</strong>
          {selectedIds.length > 0 && (
            <button type="button" onClick={() => onChange([])}
              className="min-h-9 rounded-lg px-3 text-[11px] font-semibold text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
              Clear
            </button>
          )}
        </div>
      </div>
      <div className="grid max-h-56 gap-1 overflow-y-auto p-2 sm:grid-cols-2">
        {members.map((member) => (
          <label key={member.id} className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-slate-50">
            <input type="checkbox" checked={selected.has(member.id)}
              onChange={(event) => onChange(event.target.checked
                ? Array.from(new Set([...selectedIds, member.id]))
                : selectedIds.filter((id) => id !== member.id))}
              className="h-4 w-4 shrink-0 rounded border-slate-300 text-[#0A4FE8]" />
            <span className="min-w-0">
              <span className="block truncate text-[11.5px] font-semibold text-slate-600">{member.full_name}</span>
              <span className="block truncate text-[9.5px] text-slate-400">
                {memberDepartments(member).join(", ") || member.role_title || "Team member"}
              </span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function CreateBoardModal({ portal, members, onClose, onCreated }: {
  portal: "admin" | "team";
  members: TaskboardMember[];
  onClose: () => void;
  onCreated: (board: TaskboardBoard) => void;
}) {
  const [form, setForm] = useState({ title: "", description: "", color: TASKBOARD_COLORS[0] as string });
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!form.title.trim()) return toast.error("Enter a board name.");
    setSaving(true);
    try {
      const res = await fetch("/api/taskboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ portal, action: "create_board", ...form, member_ids: memberIds }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not create board.");
      toast.success("Taskboard created.");
      onCreated(json.board);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create board.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Create Taskboard" subtitle="Start with five flexible lists; rename or move them any time." onClose={onClose}>
      <div className="space-y-4 p-5">
        <label>
          <span className="mb-1.5 block text-[12px] font-semibold text-slate-600">Board name</span>
          <input autoFocus value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Marketing team" className={fieldClass} />
        </label>
        <label>
          <span className="mb-1.5 block text-[12px] font-semibold text-slate-600">Description</span>
          <textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder="What work belongs on this board?" className={`${fieldClass} resize-y`} />
        </label>
        <div>
          <span className="mb-2 block text-[12px] font-semibold text-slate-600">Colour</span>
          <div className="flex flex-wrap gap-2">
            {TASKBOARD_COLORS.map((color) => (
              <button key={color} type="button" onClick={() => setForm({ ...form, color })}
                className={`h-9 w-9 rounded-full border-4 transition ${form.color === color ? "border-blue-100 ring-2 ring-[#0A4FE8]" : "border-white"}`}
                style={{ backgroundColor: color }} aria-label={`Use ${color}`} />
            ))}
          </div>
        </div>
        <div>
          <span className="mb-2 block text-[12px] font-semibold text-slate-600">Add team members</span>
          <MemberPicker members={members} selectedIds={memberIds} onChange={setMemberIds} />
        </div>
      </div>
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4">
        <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-[12.5px] font-semibold text-slate-500">Cancel</button>
        <button type="button" onClick={submit} disabled={saving}
          className="inline-flex min-w-32 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-4 py-2.5 text-[12.5px] font-bold text-white disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create board
        </button>
      </div>
    </ModalShell>
  );
}

function MembersModal({ members, available, canManage, post, onClose, onChanged }: {
  members: TaskboardMember[];
  available: TaskboardMember[];
  canManage: boolean;
  post: (action: string, payload?: Record<string, unknown>) => Promise<any>;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const candidates = available.filter((member) => !members.some((current) => current.id === member.id));

  async function add() {
    if (!selectedIds.length) return;
    setSaving(true);
    try {
      const result = await post("add_member", { member_ids: selectedIds });
      setSelectedIds([]);
      await onChanged();
      toast.success(result.added === 1 ? "Member added to the board." : `${result.added || selectedIds.length} members added to the board.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add member.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(member: TaskboardMember) {
    const confirmed = await appConfirm({
      title: `Remove ${member.full_name}?`,
      message: "They will lose access and be unassigned from tasks on this board.",
      confirmLabel: "Remove member",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await post("remove_member", { member_id: member.id });
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove member.");
    }
  }

  return (
    <ModalShell title="Board members" subtitle={canManage ? "Add people in bulk. Each person only sees lists containing their assigned tasks." : "Board membership does not reveal tasks unless the person is assigned."} onClose={onClose}>
      <div className="p-5">
        {canManage && (
          <div>
            <MemberPicker members={candidates} selectedIds={selectedIds} onChange={setSelectedIds} />
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={add} disabled={!selectedIds.length || saving}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-[12px] font-bold text-white disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Add selected
              </button>
            </div>
          </div>
        )}
        <div className="mt-5 divide-y divide-slate-100">
          {members.map((member) => (
            <div key={member.id} className="flex items-center gap-3 py-3">
              <MemberIdentity member={member} />
              <span className="ml-auto rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-500">{member.board_role || "editor"}</span>
              {canManage && (
                <button type="button" onClick={() => void remove(member)} className="rounded-lg p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${member.full_name}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}

function ListPeopleModal({ list, available, post, onClose, onChanged }: {
  list: TaskboardList;
  available: TaskboardMember[];
  post: (action: string, payload?: Record<string, unknown>) => Promise<any>;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const currentIds = useMemo(() => new Set(list.members.map((member) => member.id)), [list.members]);
  const candidates = available.filter((member) => !currentIds.has(member.id));

  async function add() {
    if (!selectedIds.length) return;
    setSaving(true);
    try {
      await post("add_list_members", { list_id: list.id, member_ids: selectedIds });
      setSelectedIds([]);
      await onChanged();
      toast.success(selectedIds.length === 1 ? "Person added to the list." : `${selectedIds.length} people added to the list.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add people.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(member: TaskboardMember) {
    const confirmed = await appConfirm({
      title: `Remove ${member.full_name}?`,
      message: "They lose access to this list and its tasks (unless a task is directly assigned to them).",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await post("remove_list_member", { list_id: list.id, member_id: member.id });
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove person.");
    }
  }

  return (
    <ModalShell title={`People on "${list.title}"`} subtitle="Anyone added here can see this whole list and every task in it." onClose={onClose}>
      <div className="p-5">
        <MemberPicker members={candidates} selectedIds={selectedIds} onChange={setSelectedIds} />
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={add} disabled={!selectedIds.length || saving}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-[12px] font-bold text-white disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Add to list
          </button>
        </div>
        <div className="mt-5 divide-y divide-slate-100">
          {list.members.length === 0 ? (
            <p className="py-4 text-center text-[12px] text-slate-400">No one is on this list yet.</p>
          ) : list.members.map((member) => (
            <div key={member.id} className="flex items-center gap-3 py-3">
              <MemberIdentity member={member} />
              <button type="button" onClick={() => void remove(member)} className="ml-auto rounded-lg p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${member.full_name}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}

function MemberIdentity({ member }: { member: TaskboardMember }) {
  return (
    <>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-50 text-[10px] font-bold text-[#0A4FE8]">{initials(member.full_name)}</span>
      <span className="min-w-0">
        <span className="block truncate text-[12.5px] font-semibold text-[#0D1B39]">{member.full_name}</span>
        <span className="block truncate text-[10.5px] text-slate-400">{member.role_title || member.department || "Team member"}</span>
      </span>
    </>
  );
}

function ActivityModal({ activity, onClose }: { activity: TaskboardPayload["activity"]; onClose: () => void }) {
  return (
    <ModalShell title="Board activity" subtitle="A clear record of who changed what." onClose={onClose}>
      <div className="p-5">
        {activity.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">No activity yet.</p>
        ) : (
          <div className="space-y-4">
            {activity.map((item) => (
              <div key={item.id} className="flex gap-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-50 text-[#0A4FE8]">
                  <Activity className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[12.5px] text-slate-600">
                    <strong className="text-[#0D1B39]">{item.actor_name || "System"}</strong>{" "}
                    {item.detail || item.event_type.replace(/_/g, " ")}
                  </p>
                  <p className="mt-0.5 text-[10.5px] text-slate-400">
                    {new Date(item.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function TaskModal({ portal, task, members, boardMemberIds, lists, documents, canDuplicate, post, onClose, onChanged }: {
  portal: "admin" | "team";
  task: TaskboardTask;
  members: TaskboardMember[];
  boardMemberIds: string[];
  lists: TaskboardList[];
  documents: TaskboardDocumentOption[];
  canDuplicate: boolean;
  post: (action: string, payload?: Record<string, unknown>) => Promise<any>;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    title: task.title,
    notes: task.notes || "",
    priority: task.priority,
    list_id: task.list_id,
    due_at: dueInput(task.due_at),
    assignee_ids: task.assignees.map((member) => member.id),
    completed: !!task.completed_at,
  });
  const [attachments, setAttachments] = useState<TaskboardAttachment[]>(task.attachments);
  const [comments, setComments] = useState<TaskboardComment[]>(task.comments || []);
  const [commentDraft, setCommentDraft] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [openingDelivery, setOpeningDelivery] = useState(false);

  /**
   * Opens the delivery draft for this task and sends the reader to it, so the
   * finished files go through review and approval rather than through chat.
   * Pressing it twice returns the same draft: the server will not open a rival
   * one that the first uploader would never see.
   */
  const createDelivery = async () => {
    if (openingDelivery) return;
    setOpeningDelivery(true);
    try {
      const response = await fetch("/api/taskboard/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ portal, task_id: task.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.delivery_id) throw new Error(payload.error || "Could not open a delivery for this task.");
      await appAlert(payload.existing
        ? "This task already has a delivery draft. Opening it now."
        : "Delivery draft created. Upload the design files, then submit it for review.");
      window.location.href = portal === "admin" ? "/admin/clients/deliveries" : "/team/deliveries";
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Could not open a delivery for this task.");
    } finally {
      setOpeningDelivery(false);
    }
  };
  const [uploading, setUploading] = useState(false);
  const [link, setLink] = useState({ title: "", url: "" });
  const [selectedDoc, setSelectedDoc] = useState("");

  async function addComment() {
    const body = commentDraft.trim();
    if (!body) return;
    setPostingComment(true);
    try {
      const res = await post("add_comment", { task_id: task.id, body });
      if (res?.comment) setComments((prev) => [...prev, res.comment]);
      setCommentDraft("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not post comment.");
    } finally {
      setPostingComment(false);
    }
  }

  async function save() {
    if (!form.title.trim()) return toast.error("Task title is required.");
    setSaving(true);
    try {
      await post("update_task", {
        task_id: task.id,
        ...form,
        due_at: form.due_at ? `${form.due_at}T17:00:00+01:00` : null,
      });
      toast.success("Task updated.");
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save task.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTask() {
    const confirmed = await appConfirm({
      title: `Delete “${task.title}”?`,
      message: "Its attachments and activity references will also be removed.",
      confirmLabel: "Delete task",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await post("delete_task", { task_id: task.id });
      toast.success("Task deleted.");
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete task.");
    }
  }

  async function duplicateTask() {
    setDuplicating(true);
    try {
      await post("duplicate_task", { task_id: task.id });
      toast.success("Task duplicated.");
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not duplicate task.");
    } finally {
      setDuplicating(false);
    }
  }

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("portal", portal);
      formData.set("task_id", task.id);
      formData.set("file", file);
      const res = await fetch("/api/taskboard/upload", { method: "POST", credentials: "include", body: formData });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Upload failed.");
      setAttachments((current) => [...current, json.attachment]);
      toast.success("File attached.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  // Paste an image (e.g. a screenshot from the clipboard) anywhere in the modal
  // to attach it. Text pastes into fields are unaffected.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            event.preventDefault();
            void uploadFile(file);
          }
          return;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addLink(
    kind: "external" | "cdoc" | "brand_brief",
    values: { title: string; url: string; documentId?: string },
  ) {
    if (!values.url) return;
    try {
      const json = await post("add_attachment", {
        task_id: task.id,
        kind,
        title: values.title,
        url: values.url,
        document_id: values.documentId,
      });
      setAttachments((current) => [...current, json.attachment]);
      setLink({ title: "", url: "" });
      setSelectedDoc("");
      toast.success("Document attached.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not attach document.");
    }
  }

  async function removeAttachment(attachment: TaskboardAttachment) {
    try {
      await post("remove_attachment", { attachment_id: attachment.id });
      setAttachments((current) => current.filter((item) => item.id !== attachment.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove attachment.");
    }
  }

  const selectedDocRow = documents.find((doc) => `${doc.kind}:${doc.id}` === selectedDoc);

  return (
    <ModalShell title="Task details" subtitle="Everything the assignees need, in one place." onClose={onClose} wide>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-100 px-4 py-3 text-[11.5px] text-slate-500 sm:px-5">
        <span>
          Created by <strong className="font-semibold text-slate-700">{task.created_by_name || "Unknown"}</strong>
          {" · "}{new Date(task.created_at).toLocaleString()}
        </span>
        {task.completed_at && (
          <span className="inline-flex items-center gap-1 text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> Completed by <strong className="font-semibold">{task.completed_by_name || "Unknown"}</strong>
            {" · "}{new Date(task.completed_at).toLocaleString()}
          </span>
        )}
      </div>
      <div className="grid gap-6 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
        <div className="space-y-4">
          <label>
            <span className="mb-1.5 block text-[12px] font-semibold text-slate-600">Task</span>
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={fieldClass} />
          </label>
          <label>
            <span className="mb-1.5 block text-[12px] font-semibold text-slate-600">Notes and instructions</span>
            <textarea rows={7} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder="Context, expected outcome, links or acceptance criteria…" className={`${fieldClass} resize-y`} />
          </label>
          {lists.length > 1 && (
            <label>
              <span className="mb-1.5 block text-[12px] font-semibold text-slate-600">List</span>
              <select value={form.list_id} onChange={(event) => setForm({ ...form, list_id: event.target.value })} className={fieldClass}>
                {lists.map((list) => <option key={list.id} value={list.id}>{list.title}</option>)}
              </select>
            </label>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-[12px] font-semibold text-slate-600">Due date</span>
              <input type="date" value={form.due_at} onChange={(event) => setForm({ ...form, due_at: event.target.value })} className={fieldClass} />
            </label>
            <label>
              <span className="mb-1.5 block text-[12px] font-semibold text-slate-600">Priority</span>
              <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as TaskPriority })} className={fieldClass}>
                {TASK_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority[0].toUpperCase() + priority.slice(1)}</option>)}
              </select>
            </label>
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <input type="checkbox" checked={form.completed} onChange={(event) => setForm({ ...form, completed: event.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
            <span>
              <span className="block text-[12.5px] font-semibold text-[#0D1B39]">Mark task complete</span>
              <span className="block text-[10.5px] text-slate-400">It remains visible and can be reopened.</span>
            </span>
          </label>
          <div>
            <span className="mb-2 block text-[12px] font-semibold text-slate-600">Assignees</span>
            <MemberPicker
              members={members}
              selectedIds={form.assignee_ids}
              boardMemberIds={boardMemberIds}
              onChange={(assigneeIds) => setForm((current) => ({ ...current, assignee_ids: assigneeIds }))}
            />
          </div>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
            <h3 className="flex items-center gap-2 text-[13px] font-bold text-[#0D1B39]"><Paperclip className="h-4 w-4 text-[#0A4FE8]" /> Attachments</h3>
            <div className="mt-3 space-y-2">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-white p-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#0A4FE8]">
                    {attachment.kind === "external"
                      ? <Link2 className="h-4 w-4" />
                      : attachment.kind === "upload"
                        ? <File className="h-4 w-4" />
                        : <FileText className="h-4 w-4" />}
                  </span>
                  {isImageAttachment(attachment) ? (
                    <PlatformMediaViewer url={attachment.url} title={attachment.title} detail={attachment.size_bytes ? `${Math.max(1, Math.round(attachment.size_bytes / 1024))} KB` : undefined} triggerClassName="min-w-0 flex-1 truncate text-left text-[11.5px] font-semibold text-slate-600 hover:text-[#0A4FE8] hover:underline">
                      {attachment.title}
                    </PlatformMediaViewer>
                  ) : (
                    <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-slate-600 hover:text-[#0A4FE8] hover:underline">
                      {attachment.title}
                    </a>
                  )}
                  <button type="button" onClick={() => void removeAttachment(attachment)} className="rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${attachment.title}`}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {attachments.length === 0 && <p className="py-3 text-center text-[11.5px] text-slate-400">No documents attached yet.</p>}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-100 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Upload internal file</p>
            <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-blue-200 bg-blue-50/60 px-3 py-3 text-[11.5px] font-semibold text-[#0A4FE8] hover:bg-blue-50">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "Uploading…" : "Choose document or image"}
              <input type="file" className="hidden" disabled={uploading} onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadFile(file);
                event.currentTarget.value = "";
              }} />
            </label>
            <p className="mt-2 text-center text-[10.5px] text-slate-400">…or paste an image (Cmd/Ctrl + V) to attach it</p>
          </section>

          <section className="rounded-2xl border border-slate-100 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">External document or link</p>
            <div className="mt-2 space-y-2">
              <input value={link.title} onChange={(event) => setLink({ ...link, title: event.target.value })} placeholder="Document title" className={fieldClass} />
              <input value={link.url} onChange={(event) => setLink({ ...link, url: event.target.value })} placeholder="https://…" className={fieldClass} />
              <button type="button" onClick={() => void addLink("external", link)} disabled={!link.url}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-[11.5px] font-bold text-white disabled:opacity-40">
                <Link2 className="h-3.5 w-3.5" /> Attach link
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-100 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Internal documents</p>
            <p className="mt-1 text-[10.5px] leading-4 text-slate-400">Choose a cDoc or a completed brand brief.</p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <select value={selectedDoc} onChange={(event) => setSelectedDoc(event.target.value)} className={`${fieldClass} min-w-0 flex-1`}>
                <option value="">Choose a document</option>
                <optgroup label="Completed brand briefs">
                  {documents.filter((doc) => doc.kind === "brand_brief").map((doc) => (
                    <option key={`${doc.kind}:${doc.id}`} value={`${doc.kind}:${doc.id}`}>
                      {doc.title}{doc.subtitle ? ` | ${doc.subtitle}` : ""}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Internal cDocs">
                  {documents.filter((doc) => doc.kind === "cdoc").map((doc) => (
                    <option key={`${doc.kind}:${doc.id}`} value={`${doc.kind}:${doc.id}`}>
                      {doc.title}{doc.subtitle ? ` | ${doc.subtitle}` : ""}
                    </option>
                  ))}
                </optgroup>
              </select>
              <button type="button" disabled={!selectedDocRow} onClick={() => selectedDocRow && void addLink(selectedDocRow.kind, {
                title: selectedDocRow.title,
                url: selectedDocRow.url,
                documentId: selectedDocRow.id,
              })}
                className="min-h-10 shrink-0 rounded-xl bg-blue-50 px-3 text-[11.5px] font-bold text-[#0A4FE8] disabled:opacity-40">
                Attach
              </button>
            </div>
          </section>
        </aside>
      </div>

      {/* Comments - everyone on the task can discuss here */}
      <div className="border-t border-slate-100 px-4 py-4 sm:px-5">
        <h3 className="mb-3 flex items-center gap-2 text-[13px] font-bold text-[#0D1B39]">
          <MessageSquare className="h-4 w-4 text-[#0A4FE8]" /> Comments
          {comments.length > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{comments.length}</span>}
        </h3>
        <div className="space-y-3">
          {comments.length === 0 ? (
            <p className="text-[12px] text-slate-400">No comments yet. Start the conversation.</p>
          ) : comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-50 text-[10px] font-bold text-[#0A4FE8]">{initials(c.author_name || "?")}</span>
              <div className="min-w-0 flex-1 rounded-2xl bg-slate-50 px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-2">
                  <span className="text-[12px] font-semibold text-[#0D1B39]">{c.author_name || "Someone"}</span>
                  <span className="text-[10.5px] text-slate-400">{new Date(c.created_at).toLocaleString()}</span>
                </div>
                <p className="mt-0.5 whitespace-pre-line break-words text-[12.5px] text-slate-600">{c.body}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-end gap-2">
          <textarea
            value={commentDraft}
            onChange={(event) => setCommentDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void addComment(); } }}
            rows={2}
            placeholder="Add a comment…  (Cmd/Ctrl + Enter to post)"
            className={`${fieldClass} resize-none`}
          />
          <button type="button" onClick={addComment} disabled={postingComment || !commentDraft.trim()}
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#0A4FE8] px-4 text-[12px] font-bold text-white disabled:opacity-50">
            {postingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Post
          </button>
        </div>
      </div>

      <div className="sticky bottom-0 flex flex-col-reverse items-stretch justify-between gap-3 border-t border-slate-100 bg-white px-4 py-4 sm:flex-row sm:items-center sm:px-5">
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={deleteTask} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[12px] font-semibold text-rose-600 hover:bg-rose-50 sm:justify-start">
            <Trash2 className="h-4 w-4" /> Delete
          </button>
          {canDuplicate && (
            <button type="button" onClick={duplicateTask} disabled={duplicating}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 sm:justify-start">
              {duplicating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />} Duplicate task
            </button>
          )}
          {/* Only a saved task can carry a delivery, since the draft is keyed to it. */}
          {task.id && (
            <button type="button" onClick={createDelivery} disabled={openingDelivery}
              title="Open a delivery draft for this task, upload the design files, then submit it for review"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#0A4FE8]/30 bg-[#0A4FE8]/[0.04] px-3 py-2.5 text-[12px] font-semibold text-[#0A4FE8] hover:bg-[#0A4FE8]/10 disabled:opacity-50 sm:justify-start">
              {openingDelivery ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />} Create delivery
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className="min-h-10 flex-1 rounded-xl px-4 py-2.5 text-[12.5px] font-semibold text-slate-500 sm:flex-none">Cancel</button>
          <button type="button" onClick={save} disabled={saving}
            className="inline-flex min-h-10 min-w-32 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-4 py-2.5 text-[12.5px] font-bold text-white disabled:opacity-50 sm:flex-none">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save task
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
