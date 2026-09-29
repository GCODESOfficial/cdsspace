/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BedDouble,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  Eye,
  FileImage,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Printer,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  Video,
  X,
} from "lucide-react";
import { UniversalShareButton } from "@/components/share/UniversalShareButton";
import { appConfirm } from "@/lib/app-notify";

type Section = "overview" | "sops" | "library" | "approvals";
type SaveState = "idle" | "saving" | "saved" | "error";

interface Workspace {
  sops: any[];
  books: any[];
  loans: any[];
  overnightRequests: any[];
  members: any[];
  departments: string[];
  canInviteLeads: boolean;
  canDeleteSops: boolean;
  capabilities: Record<Section, boolean>;
}

const EMPTY: Workspace = {
  sops: [],
  books: [],
  loans: [],
  overnightRequests: [],
  members: [],
  departments: [],
  canInviteLeads: false,
  canDeleteSops: false,
  capabilities: {
    overview: false,
    sops: false,
    library: false,
    approvals: false,
  },
};

function readableDate(value?: string | null, withTime = false) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(
    "en-NG",
    withTime
      ? { dateStyle: "medium", timeStyle: "short" }
      : { dateStyle: "medium" },
  ).format(date);
}

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Status({ value }: { value: string }) {
  const tone =
    value === "published" ||
    value === "available" ||
    value === "approved" ||
    value === "returned"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : value === "pending" ||
          value === "requested" ||
          value === "borrowed" ||
          value === "overdue"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : value === "rejected" || value === "retired"
          ? "bg-rose-50 text-rose-700 border-rose-200"
          : "bg-slate-50 text-slate-600 border-slate-200";
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone}`}
    >
      {titleCase(value)}
    </span>
  );
}

function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[#07142D]/45 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="absolute inset-0"
        onClick={onClose}
        aria-label="Close dialog"
      />
      <div
        className={`relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl ${wide ? "max-w-5xl" : "max-w-2xl"}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-7">
          <div>
            <h2 className="text-lg font-semibold text-[#0D1B39]">{title}</h2>
            {subtitle && (
              <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5 sm:px-7">{children}</div>
      </div>
    </div>
  );
}

function Saving({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs ${state === "error" ? "text-rose-600" : "text-slate-500"}`}
    >
      {state === "saving" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : state === "saved" ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <CircleAlert className="h-3.5 w-3.5" />
      )}
      {state === "saving"
        ? "Saving draft…"
        : state === "saved"
          ? "Draft saved"
          : "Could not save draft"}
    </span>
  );
}

export default function AdminTeamCompliance({ section }: { section: Section }) {
  const [data, setData] = useState<Workspace>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [sopEditor, setSopEditor] = useState<any | null>(null);
  const [sopDirty, setSopDirty] = useState(false);
  const [sopSave, setSopSave] = useState<SaveState>("idle");
  const [sopDepartmentFilter, setSopDepartmentFilter] = useState("all");
  const [bookEditor, setBookEditor] = useState<any | null>(null);
  const [bookDirty, setBookDirty] = useState(false);
  const [bookSave, setBookSave] = useState<SaveState>("idle");
  const uploadRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/team-compliance", {
        cache: "no-store",
        credentials: "include",
      });
      const json = await response.json();
      if (!response.ok)
        throw new Error(json.error || "Could not load Team compliance.");
      setData(json);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load Team compliance.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function post(payload: Record<string, unknown>) {
    const response = await fetch("/api/admin/team-compliance", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(json.error || "The change could not be saved.");
    return json;
  }

  function sopForm(sop: any) {
    const assignments = Array.isArray(sop.assignments) ? sop.assignments : [];
    return {
      ...sop,
      all_team: assignments.some((item: any) => item.audience_type === "all"),
      assignment_departments: assignments
        .filter((item: any) => item.audience_type === "department")
        .map((item: any) => item.department),
      assignment_member_ids: assignments
        .filter((item: any) => item.audience_type === "member")
        .map((item: any) => item.team_member_id),
      collaborators: Array.isArray(sop.collaborators) ? sop.collaborators : [],
      media: Array.isArray(sop.media) ? sop.media : [],
    };
  }

  function sopPayload(editor: any, status = editor.status, autosave = false) {
    return {
      action: "save_sop",
      id: editor.id,
      title: editor.title,
      summary: editor.summary,
      content: editor.content,
      scope_type: editor.scope_type,
      department: editor.department,
      task_name: editor.task_name,
      status,
      all_team: editor.all_team,
      assignment_departments: editor.assignment_departments,
      assignment_member_ids: editor.assignment_member_ids,
      collaborators: editor.collaborators,
      autosave,
    };
  }

  useEffect(() => {
    if (!sopEditor || !sopDirty) return;
    setSopSave("saving");
    const timer = window.setTimeout(async () => {
      try {
        await post(sopPayload(sopEditor, sopEditor.status, true));
        setSopDirty(false);
        setSopSave("saved");
      } catch {
        setSopSave("error");
      }
    }, 850);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sopEditor, sopDirty]);

  function bookPayload(editor: any, status = editor.status, autosave = false) {
    return {
      action: "save_book",
      id: editor.id,
      title: editor.title,
      author: editor.author,
      isbn: editor.isbn,
      category: editor.category,
      description: editor.description,
      acquisition_type: editor.acquisition_type,
      donor_member_id: editor.donor_member_id,
      donor_name: editor.donor_name,
      book_condition: editor.book_condition,
      status,
      autosave,
    };
  }

  useEffect(() => {
    if (!bookEditor || !bookDirty) return;
    setBookSave("saving");
    const timer = window.setTimeout(async () => {
      try {
        await post(bookPayload(bookEditor, bookEditor.status, true));
        setBookDirty(false);
        setBookSave("saved");
      } catch {
        setBookSave("error");
      }
    }, 850);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookEditor, bookDirty]);

  const stats = useMemo(
    () => ({
      published: data.sops.filter((item) => item.status === "published").length,
      available: data.books.filter((item) => item.status === "available")
        .length,
      loans: data.loans.filter((item) =>
        ["requested", "borrowed", "overdue"].includes(item.status),
      ).length,
      approvals: data.overnightRequests.filter(
        (item) => item.status === "pending",
      ).length,
    }),
    [data],
  );

  const sopDepartmentOptions = useMemo(
    () =>
      Array.from(
        new Set(
          data.sops
            .filter((sop) => sop.scope_type === "department" && sop.department)
            .map((sop) => String(sop.department)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [data.sops],
  );

  const visibleSops = useMemo(
    () =>
      data.sops
        .filter((sop) => {
          if (sopDepartmentFilter === "all") return true;
          if (sopDepartmentFilter === "general")
            return sop.scope_type === "general";
          if (sopDepartmentFilter === "task") return sop.scope_type === "task";
          return (
            sop.scope_type === "department" &&
            sop.department === sopDepartmentFilter
          );
        })
        .sort((a, b) =>
          String(a.sop_number || "").localeCompare(
            String(b.sop_number || ""),
            undefined,
            { numeric: true },
          ),
        ),
    [data.sops, sopDepartmentFilter],
  );

  const sopTabs = useMemo(
    () => [
      { value: "all", label: "All" },
      { value: "general", label: "Generalist" },
      { value: "task", label: "Dashboard tasks" },
      ...sopDepartmentOptions.map((department) => ({
        value: department,
        label: department,
      })),
    ],
    [sopDepartmentOptions],
  );

  const sopPdfHref = useMemo(() => {
    if (sopDepartmentFilter === "all") {
      return "/api/admin/team-compliance/pdf?scope=all";
    }
    if (sopDepartmentFilter === "general" || sopDepartmentFilter === "task") {
      return `/api/admin/team-compliance/pdf?scope=${sopDepartmentFilter}`;
    }
    return `/api/admin/team-compliance/pdf?scope=department&department=${encodeURIComponent(sopDepartmentFilter)}`;
  }, [sopDepartmentFilter]);

  async function createSop() {
    setBusy("new-sop");
    try {
      const json = await post({ action: "create_sop_draft" });
      setSopEditor(
        sopForm({ ...json.sop, assignments: [], collaborators: [], media: [] }),
      );
      setSopDirty(false);
      setSopSave("saved");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not create an SOP draft.",
      );
    } finally {
      setBusy("");
    }
  }

  async function finishSop(status: "published" | "draft" | "archived") {
    if (!sopEditor) return;
    setBusy(`sop-${status}`);
    setError("");
    try {
      await post(sopPayload(sopEditor, status));
      setSopEditor(null);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save the SOP.",
      );
    } finally {
      setBusy("");
    }
  }

  async function uploadMedia(file?: File) {
    if (!file || !sopEditor) return;
    setBusy("media");
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("sop_id", sopEditor.id);
      const response = await fetch("/api/admin/team-compliance/upload", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(json.error || "Attachment upload failed.");
      setSopEditor((current: any) => ({
        ...current,
        media: [...(current.media || []), json.media],
      }));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Attachment upload failed.",
      );
    } finally {
      setBusy("");
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  async function deleteSop(sop: any) {
    if (
      !(await appConfirm(
        `Delete “${sop.title || "Untitled SOP"}” and its attachments?`,
      ))
    )
      return;
    setBusy(`delete-${sop.id}`);
    try {
      await post({ action: "delete_sop", id: sop.id });
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not delete the SOP.",
      );
    } finally {
      setBusy("");
    }
  }

  async function deleteMedia(media: any) {
    if (!sopEditor || !(await appConfirm(`Remove ${media.file_name}?`))) return;
    setBusy("media-delete");
    try {
      await post({ action: "delete_media", id: media.id });
      setSopEditor((current: any) => ({
        ...current,
        media: current.media.filter((item: any) => item.id !== media.id),
      }));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not remove the attachment.",
      );
    } finally {
      setBusy("");
    }
  }

  async function createBook() {
    setBusy("new-book");
    try {
      const json = await post({ action: "create_book_draft" });
      setBookEditor(json.book);
      setBookDirty(false);
      setBookSave("saved");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not create a book draft.",
      );
    } finally {
      setBusy("");
    }
  }

  async function finishBook(status: string) {
    if (!bookEditor) return;
    setBusy("book-save");
    setError("");
    try {
      await post(bookPayload(bookEditor, status));
      setBookEditor(null);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save the book.",
      );
    } finally {
      setBusy("");
    }
  }

  async function deleteBook(book: any) {
    if (
      !(await appConfirm(
        `Delete ${book.inventory_number}: ${book.title || "Untitled book"}?`,
      ))
    )
      return;
    setBusy(`book-delete-${book.id}`);
    try {
      await post({ action: "delete_book", id: book.id });
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not delete the book.",
      );
    } finally {
      setBusy("");
    }
  }

  function printLabel(book: any) {
    const popup = window.open("", "_blank", "width=720,height=500");
    if (!popup) {
      setError("Allow pop-ups to print the library label.");
      return;
    }
    const title = String(book.title || "Office library book").replace(
      /[<>&"']/g,
      "",
    );
    popup.document.write(
      `<!doctype html><html><head><title>${book.inventory_number}</title><style>@page{size:85.6mm 54mm;margin:0}body{margin:0;font-family:Arial,sans-serif}.label{box-sizing:border-box;width:85.6mm;height:54mm;padding:7mm;border:1px solid #dbe4f0;display:flex;flex-direction:column;justify-content:space-between}.brand{font-size:11px;color:#0A4FE8;font-weight:700}.number{font-size:21px;font-weight:800;color:#0D1B39;letter-spacing:.04em}.title{font-size:12px;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}</style></head><body><div class="label"><div class="brand">CDS Space office library</div><div class="number">${book.inventory_number}</div><div class="title">${title}</div></div><script>window.print();window.onafterprint=()=>window.close();</script></body></html>`,
    );
    popup.document.close();
  }

  async function reviewLoan(id: string, decision: string) {
    setBusy(`loan-${id}`);
    setError("");
    try {
      await post({ action: "review_loan", id, decision });
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not review the loan.",
      );
    } finally {
      setBusy("");
    }
  }

  async function reviewOvernight(id: string, decision: string) {
    setBusy(`approval-${id}`);
    setError("");
    try {
      await post({ action: "review_overnight", id, decision });
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not review the request.",
      );
    } finally {
      setBusy("");
    }
  }

  const nav = [
    {
      id: "overview",
      label: "Overview",
      href: "/admin/team-compliance",
      icon: ShieldCheck,
    },
    {
      id: "sops",
      label: "SOPs",
      href: "/admin/team-compliance/sops",
      icon: FileText,
    },
    {
      id: "library",
      label: "Library",
      href: "/admin/team-compliance/library",
      icon: BookOpen,
    },
    {
      id: "approvals",
      label: "Extra approvals",
      href: "/admin/team-compliance/approvals",
      icon: BedDouble,
    },
  ] as const;

  if (loading)
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]" />
      </div>
    );

  return (
    <div className="min-h-full bg-[#F3F7FE] px-3 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="rounded-3xl bg-[#0A4FE8] p-6 text-white shadow-[0_16px_45px_rgba(10,79,232,0.18)] sm:p-8">
          <p className="text-xs font-medium text-white/75">
            People operations · Team compliance
          </p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Standards, learning, and workplace approvals
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/80">
                Publish office procedures, manage the shared book library, and
                make overnight office requests accountable.
              </p>
            </div>
            {section === "sops" && (
              <button
                type="button"
                onClick={() => void createSop()}
                disabled={busy === "new-sop"}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-[#0A4FE8] transition hover:bg-blue-50 disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                New SOP
              </button>
            )}
            {section === "library" && (
              <button
                type="button"
                onClick={() => void createBook()}
                disabled={busy === "new-book"}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-[#0A4FE8] transition hover:bg-blue-50 disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                Add book
              </button>
            )}
          </div>
        </div>

        <nav
          className="mt-5 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
          aria-label="Team compliance sections"
        >
          {nav
            .filter((item) => data.capabilities?.[item.id] !== false)
            .map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-medium transition ${section === item.id ? "bg-[#0A4FE8] text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
        </nav>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              className="ml-auto"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {section === "overview" && (
          <div className="mt-6 space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                [
                  "Published SOPs",
                  stats.published,
                  FileText,
                  "/admin/team-compliance/sops",
                ],
                [
                  "Available books",
                  stats.available,
                  BookOpen,
                  "/admin/team-compliance/library",
                ],
                [
                  "Active loans",
                  stats.loans,
                  Clock3,
                  "/admin/team-compliance/library",
                ],
                [
                  "Pending approvals",
                  stats.approvals,
                  BedDouble,
                  "/admin/team-compliance/approvals",
                ],
              ].map(([label, value, Icon, href]: any) => (
                <Link
                  href={href}
                  key={label}
                  className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#0A4FE8]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-300 transition group-hover:text-[#0A4FE8]" />
                  </div>
                  <p className="mt-5 text-2xl font-semibold text-[#0D1B39]">
                    {value}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{label}</p>
                </Link>
              ))}
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-semibold text-[#0D1B39]">
                  Recently updated SOPs
                </h2>
                <div className="mt-4 divide-y divide-slate-100">
                  {data.sops.slice(0, 5).map((sop) => (
                    <Link
                      href="/admin/team-compliance/sops"
                      key={sop.id}
                      className="flex items-center gap-3 py-3"
                    >
                      <FileText className="h-4 w-4 text-[#0A4FE8]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {sop.title || "Untitled SOP draft"}
                        </p>
                        <p className="text-xs text-slate-400">
                          Updated {readableDate(sop.updated_at, true)}
                        </p>
                      </div>
                      <Status value={sop.status} />
                    </Link>
                  ))}
                  {!data.sops.length && (
                    <p className="py-8 text-center text-sm text-slate-400">
                      No SOPs yet.
                    </p>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-semibold text-[#0D1B39]">
                  Requests needing attention
                </h2>
                <div className="mt-4 space-y-3">
                  {data.loans
                    .filter((item) => item.status === "requested")
                    .slice(0, 3)
                    .map((loan) => (
                      <Link
                        href="/admin/team-compliance/library"
                        key={loan.id}
                        className="flex items-center gap-3 rounded-xl bg-amber-50 p-3 text-sm"
                      >
                        <BookOpen className="h-4 w-4 text-amber-700" />
                        <span className="min-w-0 flex-1 truncate">
                          {loan.member_name} · {loan.book_title}
                        </span>
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    ))}
                  {data.overnightRequests
                    .filter((item) => item.status === "pending")
                    .slice(0, 3)
                    .map((request) => (
                      <Link
                        href="/admin/team-compliance/approvals"
                        key={request.id}
                        className="flex items-center gap-3 rounded-xl bg-blue-50 p-3 text-sm"
                      >
                        <BedDouble className="h-4 w-4 text-[#0A4FE8]" />
                        <span className="min-w-0 flex-1 truncate">
                          {request.member_name} ·{" "}
                          {readableDate(request.requested_date)}
                        </span>
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    ))}
                  {!stats.loans && !stats.approvals && (
                    <p className="py-8 text-center text-sm text-slate-400">
                      No requests need attention.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {section === "sops" && (
          <div className="mt-6">
            <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#0D1B39]">
                    SOP departments
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Select a tab to view or download its procedures.
                  </p>
                </div>
                <a
                  href={sopPdfHref}
                  download
                  className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#083FC0]"
                >
                  <Download className="h-4 w-4" />
                  Download all as PDF
                </a>
              </div>
              <div
                className="mt-4 flex gap-2 overflow-x-auto pb-1"
                role="tablist"
                aria-label="Filter SOPs by department"
              >
                {sopTabs.map((tab) => {
                  const selected = sopDepartmentFilter === tab.value;
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setSopDepartmentFilter(tab.value)}
                      className={`min-h-10 shrink-0 rounded-xl border px-4 text-sm font-medium transition ${
                        selected
                          ? "border-[#0A4FE8] bg-[#0A4FE8] text-white shadow-sm"
                          : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-[#0A4FE8]"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {visibleSops.map((sop) => (
                <article
                  key={sop.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-700">
                          {sop.sop_number || "Number pending"}
                        </span>
                        <Status value={sop.status} />
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-[#0A4FE8]">
                          {titleCase(sop.scope_type)}
                        </span>
                      </div>
                      <h2 className="mt-3 text-lg font-semibold text-[#0D1B39]">
                        {sop.title || "Untitled SOP draft"}
                      </h2>
                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">
                        {sop.summary ||
                          sop.content ||
                          "The procedure has not been written yet."}
                      </p>
                    </div>
                    <div className="ml-auto flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSopEditor(sopForm(sop));
                          setSopDirty(false);
                          setSopSave("idle");
                        }}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                        aria-label="Edit SOP"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {data.canDeleteSops && (
                        <button
                          type="button"
                          onClick={() => void deleteSop(sop)}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50"
                          aria-label="Delete SOP"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap gap-x-5 gap-y-2">
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        {sop.assignments?.length || 0} audience rules
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <FileImage className="h-3.5 w-3.5" />
                        {sop.media?.length || 0} media files
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {sop.acknowledgement_count || 0} acknowledgements
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {sop.status === "published" ? (
                        <Link
                          href={`/team/compliance?sop=${encodeURIComponent(sop.sop_number)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#0A4FE8]"
                        >
                          <Eye className="h-4 w-4" />
                          View as team
                        </Link>
                      ) : (
                        <span className="inline-flex min-h-10 cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-400">
                          <Eye className="h-4 w-4" />
                          View as team
                        </span>
                      )}
                      <UniversalShareButton
                        title={`${sop.sop_number} · ${sop.title}`}
                        text={`Read ${sop.sop_number}: ${sop.title} in CDS Space Team compliance.`}
                        chatText={`Team SOP: ${sop.sop_number} · ${sop.title}`}
                        url={`/team/compliance?sop=${encodeURIComponent(sop.sop_number)}`}
                        label="Share with team"
                        disabled={sop.status !== "published"}
                        className="min-h-10 rounded-xl px-3 text-xs"
                      />
                    </div>
                  </div>
                </article>
              ))}
              {!visibleSops.length && (
                <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
                  <FileText className="mx-auto h-8 w-8 text-slate-300" />
                  <h2 className="mt-3 font-semibold text-slate-800">
                    No SOPs in this department
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Choose another department or create a new procedure.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {section === "library" && (
          <div className="mt-6 space-y-6">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 p-5">
                <div>
                  <h2 className="font-semibold text-[#0D1B39]">
                    Book catalogue
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Each saved book receives a printable card-size inventory
                    label.
                  </p>
                </div>
                <span className="text-sm text-slate-500">
                  {data.books.filter((book) => book.status !== "draft").length}{" "}
                  listed
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {data.books.map((book) => (
                  <div
                    key={book.id}
                    className="grid gap-3 p-4 sm:grid-cols-[150px_1fr_auto] sm:items-center"
                  >
                    <div>
                      <p className="font-mono text-xs font-semibold text-[#0A4FE8]">
                        {book.inventory_number}
                      </p>
                      <div className="mt-2">
                        <Status value={book.status} />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">
                        {book.title || "Untitled book draft"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {book.author || "Author not added"}
                        {book.acquisition_type === "donated"
                          ? ` · Gifted by ${book.donor_name || data.members.find((item) => item.id === book.donor_member_id)?.full_name || "team member"}`
                          : ""}
                      </p>
                      {book.borrowed_by && (
                        <p className="mt-1 text-xs text-amber-700">
                          With {book.borrowed_by} until{" "}
                          {readableDate(book.due_at)}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => printLabel(book)}
                        disabled={book.status === "draft"}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                        aria-label="Print inventory label"
                      >
                        <Printer className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBookEditor(book);
                          setBookDirty(false);
                          setBookSave("idle");
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                        aria-label="Edit book"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteBook(book)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50"
                        aria-label="Delete book"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {!data.books.length && (
                  <p className="p-10 text-center text-sm text-slate-400">
                    No books have been catalogued.
                  </p>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-[#0D1B39]">
                Loan requests and active loans
              </h2>
              <div className="mt-4 space-y-3">
                {data.loans
                  .filter((loan) =>
                    ["requested", "borrowed", "overdue"].includes(loan.status),
                  )
                  .map((loan) => (
                    <div
                      key={loan.id}
                      className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 lg:flex-row lg:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-slate-800">
                            {loan.book_title}
                          </p>
                          <Status value={loan.status} />
                        </div>
                        <p className="mt-1 text-sm text-slate-500">
                          {loan.member_name} · {loan.requested_days} day
                          {loan.requested_days === 1 ? "" : "s"}
                          {loan.due_at
                            ? ` · Due ${readableDate(loan.due_at)}`
                            : ""}
                        </p>
                        {loan.request_note && (
                          <p className="mt-2 text-sm text-slate-600">
                            {loan.request_note}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {loan.status === "requested" && (
                          <>
                            <button
                              type="button"
                              onClick={() => void reviewLoan(loan.id, "reject")}
                              disabled={busy === `loan-${loan.id}`}
                              className="min-h-10 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void reviewLoan(loan.id, "approve")
                              }
                              disabled={busy === `loan-${loan.id}`}
                              className="min-h-10 rounded-xl bg-[#0A4FE8] px-3 text-xs font-semibold text-white hover:bg-[#083FC0]"
                            >
                              Approve loan
                            </button>
                          </>
                        )}
                        {["borrowed", "overdue"].includes(loan.status) && (
                          <button
                            type="button"
                            onClick={() => void reviewLoan(loan.id, "return")}
                            disabled={busy === `loan-${loan.id}`}
                            className="min-h-10 rounded-xl bg-[#0A4FE8] px-3 text-xs font-semibold text-white hover:bg-[#083FC0]"
                          >
                            Mark returned
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                {!data.loans.some((loan) =>
                  ["requested", "borrowed", "overdue"].includes(loan.status),
                ) && (
                  <p className="py-8 text-center text-sm text-slate-400">
                    No active loan requests.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {section === "approvals" && (
          <div className="mt-6 space-y-4">
            {data.overnightRequests.map((request) => (
              <article
                key={request.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-[#0D1B39]">
                        {request.member_name}
                      </h2>
                      <Status value={request.status} />
                    </div>
                    <p className="mt-2 text-sm text-slate-500">
                      {readableDate(request.requested_date)} ·{" "}
                      {String(request.planned_start || "").slice(0, 5)} to{" "}
                      {String(request.planned_end || "").slice(0, 5)} · Signed{" "}
                      {readableDate(request.signed_at, true)}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-slate-700">
                      {request.purpose}
                    </p>
                    <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                      <p>
                        <span className="font-medium">Emergency contact:</span>{" "}
                        {request.emergency_contact}
                      </p>
                      <p>
                        <span className="font-medium">Signed as:</span>{" "}
                        {request.signature_name}
                      </p>
                      <p>
                        <span className="font-medium">Terms version:</span>{" "}
                        {request.terms_version}
                      </p>
                      <details className="mt-2 border-t border-slate-200 pt-2">
                        <summary className="cursor-pointer font-medium text-slate-700">
                          View signed terms
                        </summary>
                        <p className="mt-2 whitespace-pre-wrap leading-5">
                          {request.terms_text_snapshot}
                        </p>
                      </details>
                    </div>
                  </div>
                  {request.status === "pending" && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void reviewOvernight(request.id, "reject")
                        }
                        disabled={busy === `approval-${request.id}`}
                        className="min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void reviewOvernight(request.id, "approve")
                        }
                        disabled={busy === `approval-${request.id}`}
                        className="min-h-10 rounded-xl bg-[#0A4FE8] px-4 text-sm font-semibold text-white hover:bg-[#083FC0]"
                      >
                        Approve
                      </button>
                    </div>
                  )}
                </div>
              </article>
            ))}
            {!data.overnightRequests.length && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
                <BedDouble className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm text-slate-500">
                  No overnight office requests yet.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {sopEditor && (
        <Modal
          title={sopEditor.title || "New SOP"}
          subtitle={`${sopEditor.sop_number || "SOP number pending"} · Changes autosave to this single server draft.`}
          onClose={() => {
            setSopEditor(null);
            void load();
          }}
          wide
        >
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Title
                <input
                  value={sopEditor.title || ""}
                  onChange={(event) => {
                    setSopEditor({ ...sopEditor, title: event.target.value });
                    setSopDirty(true);
                  }}
                  placeholder="Example: Locking the office at close"
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-[#0A4FE8]"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Scope
                <select
                  value={sopEditor.scope_type || "general"}
                  onChange={(event) => {
                    setSopEditor({
                      ...sopEditor,
                      scope_type: event.target.value,
                    });
                    setSopDirty(true);
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-[#0A4FE8]"
                >
                  <option value="general">General office SOP</option>
                  <option value="department">Department SOP</option>
                  <option value="task">Task-focused SOP</option>
                </select>
              </label>
              {sopEditor.scope_type === "department" && (
                <label className="text-sm font-medium text-slate-700">
                  Department
                  <input
                    list="compliance-departments"
                    value={sopEditor.department || ""}
                    onChange={(event) => {
                      setSopEditor({
                        ...sopEditor,
                        department: event.target.value,
                      });
                      setSopDirty(true);
                    }}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-[#0A4FE8]"
                  />
                </label>
              )}
              {sopEditor.scope_type === "task" && (
                <label className="text-sm font-medium text-slate-700">
                  Task name
                  <input
                    value={sopEditor.task_name || ""}
                    onChange={(event) => {
                      setSopEditor({
                        ...sopEditor,
                        task_name: event.target.value,
                      });
                      setSopDirty(true);
                    }}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-[#0A4FE8]"
                  />
                </label>
              )}
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Summary
              <textarea
                value={sopEditor.summary || ""}
                onChange={(event) => {
                  setSopEditor({ ...sopEditor, summary: event.target.value });
                  setSopDirty(true);
                }}
                rows={2}
                placeholder="What this procedure covers and when it applies"
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-6 outline-none focus:border-[#0A4FE8]"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Standard operating procedure
              <textarea
                value={sopEditor.content || ""}
                onChange={(event) => {
                  setSopEditor({ ...sopEditor, content: event.target.value });
                  setSopDirty(true);
                }}
                rows={12}
                placeholder="Write the purpose, owner, materials, numbered steps, checks, exceptions, and escalation path."
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-6 outline-none focus:border-[#0A4FE8]"
              />
            </label>
            <section className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">
                    Images and videos
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    PNG, JPEG, WebP, GIF up to 8 MB; MP4, MOV, WebM up to 150 MB.
                  </p>
                </div>
                <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-blue-200 px-3 text-xs font-semibold text-[#0A4FE8] hover:bg-blue-50">
                  <Upload className="h-4 w-4" />
                  {busy === "media" ? "Uploading…" : "Upload"}
                  <input
                    ref={uploadRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                    className="hidden"
                    onChange={(event) =>
                      void uploadMedia(event.target.files?.[0])
                    }
                  />
                </label>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {sopEditor.media?.map((media: any) => (
                  <div
                    key={media.id}
                    className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"
                  >
                    {media.media_type === "video" ? (
                      <Video className="h-5 w-5 text-[#0A4FE8]" />
                    ) : (
                      <FileImage className="h-5 w-5 text-[#0A4FE8]" />
                    )}
                    <a
                      href={media.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700 hover:text-[#0A4FE8]"
                    >
                      {media.file_name}
                    </a>
                    <button
                      type="button"
                      onClick={() => void deleteMedia(media)}
                      className="text-rose-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
            <section className="grid gap-5 rounded-2xl border border-slate-200 p-4 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">
                  Who must follow it?
                </h3>
                <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={!!sopEditor.all_team}
                    onChange={(event) => {
                      setSopEditor({
                        ...sopEditor,
                        all_team: event.target.checked,
                      });
                      setSopDirty(true);
                    }}
                    className="h-4 w-4 accent-[#0A4FE8]"
                  />
                  Entire team
                </label>
                {!sopEditor.all_team && (
                  <>
                    <p className="mt-4 text-xs font-medium text-slate-500">
                      Departments
                    </p>
                    <div className="mt-2 max-h-32 space-y-2 overflow-y-auto">
                      {data.departments.map((department) => (
                        <label
                          key={department}
                          className="flex items-center gap-2 text-sm text-slate-600"
                        >
                          <input
                            type="checkbox"
                            checked={sopEditor.assignment_departments.includes(
                              department,
                            )}
                            onChange={(event) => {
                              const next = event.target.checked
                                ? [
                                    ...sopEditor.assignment_departments,
                                    department,
                                  ]
                                : sopEditor.assignment_departments.filter(
                                    (item: string) => item !== department,
                                  );
                              setSopEditor({
                                ...sopEditor,
                                assignment_departments: next,
                              });
                              setSopDirty(true);
                            }}
                            className="h-4 w-4 accent-[#0A4FE8]"
                          />
                          {department}
                        </label>
                      ))}
                    </div>
                    <p className="mt-4 text-xs font-medium text-slate-500">
                      Individual team members
                    </p>
                    <div className="mt-2 max-h-40 space-y-2 overflow-y-auto">
                      {data.members.map((member) => (
                        <label
                          key={member.id}
                          className="flex items-center gap-2 text-sm text-slate-600"
                        >
                          <input
                            type="checkbox"
                            checked={sopEditor.assignment_member_ids.includes(
                              member.id,
                            )}
                            onChange={(event) => {
                              const next = event.target.checked
                                ? [
                                    ...sopEditor.assignment_member_ids,
                                    member.id,
                                  ]
                                : sopEditor.assignment_member_ids.filter(
                                    (item: string) => item !== member.id,
                                  );
                              setSopEditor({
                                ...sopEditor,
                                assignment_member_ids: next,
                              });
                              setSopDirty(true);
                            }}
                            className="h-4 w-4 accent-[#0A4FE8]"
                          />
                          <span>
                            {member.full_name}
                            <span className="text-xs text-slate-400">
                              {" "}
                              · {member.department || "No department"}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className={sopEditor.all_team ? "opacity-100" : ""}>
                <h3 className="text-sm font-semibold text-slate-800">
                  Invited SOP authors
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Super admins can invite team leads or specialists to draft
                  this SOP and optionally publish it.
                </p>
                {data.canInviteLeads ? (
                  <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                    {data.members.map((member) => {
                      const invite = sopEditor.collaborators.find(
                        (item: any) => item.team_member_id === member.id,
                      );
                      return (
                        <div
                          key={member.id}
                          className="rounded-xl bg-slate-50 p-3"
                        >
                          <label className="flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={!!invite}
                              onChange={(event) => {
                                const next = event.target.checked
                                  ? [
                                      ...sopEditor.collaborators,
                                      {
                                        team_member_id: member.id,
                                        full_name: member.full_name,
                                        can_edit: true,
                                        can_publish: false,
                                      },
                                    ]
                                  : sopEditor.collaborators.filter(
                                      (item: any) =>
                                        item.team_member_id !== member.id,
                                    );
                                setSopEditor({
                                  ...sopEditor,
                                  collaborators: next,
                                });
                                setSopDirty(true);
                              }}
                              className="h-4 w-4 accent-[#0A4FE8]"
                            />
                            {member.full_name}
                          </label>
                          {invite && (
                            <label className="ml-6 mt-2 flex items-center gap-2 text-xs text-slate-500">
                              <input
                                type="checkbox"
                                checked={!!invite.can_publish}
                                onChange={(event) => {
                                  const next = sopEditor.collaborators.map(
                                    (item: any) =>
                                      item.team_member_id === member.id
                                        ? {
                                            ...item,
                                            can_publish: event.target.checked,
                                          }
                                        : item,
                                  );
                                  setSopEditor({
                                    ...sopEditor,
                                    collaborators: next,
                                  });
                                  setSopDirty(true);
                                }}
                                className="h-3.5 w-3.5 accent-[#0A4FE8]"
                              />
                              May publish and invite relevant readers
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-700">
                    Only the super admin can change invited authors. Existing
                    invitations remain in place.
                  </p>
                )}
              </div>
            </section>
            <datalist id="compliance-departments">
              {data.departments.map((department) => (
                <option key={department} value={department} />
              ))}
            </datalist>
            <div className="sticky bottom-0 -mx-5 flex flex-col gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:-mx-7 sm:flex-row sm:items-center sm:px-7">
              <Saving state={sopSave} />
              <div className="ml-auto flex flex-wrap gap-2">
                {sopEditor.status !== "archived" && (
                  <button
                    type="button"
                    onClick={() => void finishSop("archived")}
                    className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Archive
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void finishSop("draft")}
                  className="min-h-11 rounded-xl border border-blue-200 px-4 text-sm font-semibold text-[#0A4FE8] hover:bg-blue-50"
                >
                  Keep as draft
                </button>
                <button
                  type="button"
                  onClick={() => void finishSop("published")}
                  disabled={busy.startsWith("sop-")}
                  className="min-h-11 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white hover:bg-[#083FC0] disabled:opacity-60"
                >
                  Publish SOP
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {bookEditor && (
        <Modal
          title={bookEditor.title || "Add a library book"}
          subtitle={`${bookEditor.inventory_number} · This entry autosaves as you type.`}
          onClose={() => {
            setBookEditor(null);
            void load();
          }}
        >
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Book title
                <input
                  value={bookEditor.title || ""}
                  onChange={(event) => {
                    setBookEditor({ ...bookEditor, title: event.target.value });
                    setBookDirty(true);
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-[#0A4FE8]"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Author
                <input
                  value={bookEditor.author || ""}
                  onChange={(event) => {
                    setBookEditor({
                      ...bookEditor,
                      author: event.target.value,
                    });
                    setBookDirty(true);
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-[#0A4FE8]"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                ISBN
                <input
                  value={bookEditor.isbn || ""}
                  onChange={(event) => {
                    setBookEditor({ ...bookEditor, isbn: event.target.value });
                    setBookDirty(true);
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-[#0A4FE8]"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Category
                <input
                  value={bookEditor.category || ""}
                  onChange={(event) => {
                    setBookEditor({
                      ...bookEditor,
                      category: event.target.value,
                    });
                    setBookDirty(true);
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-[#0A4FE8]"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Condition
                <select
                  value={bookEditor.book_condition || "good"}
                  onChange={(event) => {
                    setBookEditor({
                      ...bookEditor,
                      book_condition: event.target.value,
                    });
                    setBookDirty(true);
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-[#0A4FE8]"
                >
                  <option value="new">New</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="repair">Needs repair</option>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                How it entered the library
                <select
                  value={bookEditor.acquisition_type || "purchased"}
                  onChange={(event) => {
                    setBookEditor({
                      ...bookEditor,
                      acquisition_type: event.target.value,
                    });
                    setBookDirty(true);
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-[#0A4FE8]"
                >
                  <option value="purchased">Company purchase</option>
                  <option value="donated">Gift from a team member</option>
                </select>
              </label>
            </div>
            {bookEditor.acquisition_type === "donated" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  Team member
                  <select
                    value={bookEditor.donor_member_id || ""}
                    onChange={(event) => {
                      const donor = data.members.find(
                        (item) => item.id === event.target.value,
                      );
                      setBookEditor({
                        ...bookEditor,
                        donor_member_id: event.target.value,
                        donor_name: donor?.full_name || bookEditor.donor_name,
                      });
                      setBookDirty(true);
                    }}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-[#0A4FE8]"
                  >
                    <option value="">Not in the active directory</option>
                    {data.members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Name to credit
                  <input
                    value={bookEditor.donor_name || ""}
                    onChange={(event) => {
                      setBookEditor({
                        ...bookEditor,
                        donor_name: event.target.value,
                      });
                      setBookDirty(true);
                    }}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-[#0A4FE8]"
                  />
                </label>
              </div>
            )}
            <label className="block text-sm font-medium text-slate-700">
              Description or notes
              <textarea
                value={bookEditor.description || ""}
                onChange={(event) => {
                  setBookEditor({
                    ...bookEditor,
                    description: event.target.value,
                  });
                  setBookDirty(true);
                }}
                rows={4}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-6 outline-none focus:border-[#0A4FE8]"
              />
            </label>
            <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center">
              <Saving state={bookSave} />
              <div className="ml-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void finishBook("draft")}
                  className="min-h-11 rounded-xl border border-blue-200 px-4 text-sm font-semibold text-[#0A4FE8]"
                >
                  Keep draft
                </button>
                {bookEditor.status !== "draft" &&
                  bookEditor.status !== "borrowed" && (
                    <button
                      type="button"
                      onClick={() => void finishBook("retired")}
                      className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600"
                    >
                      Retire
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() =>
                    void finishBook(
                      bookEditor.status === "borrowed"
                        ? "borrowed"
                        : bookEditor.book_condition === "repair"
                          ? "maintenance"
                          : "available",
                    )
                  }
                  disabled={busy === "book-save"}
                  className="min-h-11 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Save and list
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
