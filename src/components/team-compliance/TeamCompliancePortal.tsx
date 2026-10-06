/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { appConfirm } from "@/lib/app-notify";
import {
  BedDouble,
  BookOpen,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileImage,
  FileText,
  Loader2,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  Video,
  X,
} from "lucide-react";

type Tab = "sops" | "library" | "approvals";
type SaveState = "idle" | "saving" | "saved" | "error";

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
  const tone = ["published", "available", "approved", "returned"].includes(
    value,
  )
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : ["pending", "requested", "borrowed", "overdue"].includes(value)
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : ["rejected", "cancelled"].includes(value)
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-slate-200 bg-slate-50 text-slate-600";
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
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[#07142D]/45 backdrop-blur-sm sm:items-center sm:p-5"
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
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
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
        ? "Saving…"
        : state === "saved"
          ? "Saved"
          : "Could not save"}
    </span>
  );
}

export default function TeamCompliancePortal() {
  const [tab, setTab] = useState<Tab>("sops");
  const [data, setData] = useState<any>({
    sops: [],
    books: [],
    loans: [],
    overnightRequests: [],
    members: [],
    departments: [],
    member: {},
    terms: "",
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sopDepartmentFilter, setSopDepartmentFilter] = useState("all");
  const [viewSop, setViewSop] = useState<any | null>(null);
  const [sopEditor, setSopEditor] = useState<any | null>(null);
  const [sopDirty, setSopDirty] = useState(false);
  const [sopSave, setSopSave] = useState<SaveState>("idle");
  const [loanEditor, setLoanEditor] = useState<any | null>(null);
  const [loanDirty, setLoanDirty] = useState(false);
  const [loanSave, setLoanSave] = useState<SaveState>("idle");
  const [overnightEditor, setOvernightEditor] = useState<any | null>(null);
  const [overnightDirty, setOvernightDirty] = useState(false);
  const [overnightSave, setOvernightSave] = useState<SaveState>("idle");
  const uploadRef = useRef<HTMLInputElement>(null);
  const deepLinkHandledRef = useRef(false);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/team/compliance", {
        cache: "no-store",
        credentials: "include",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(json.error || "Could not load Team compliance.");
      setData(json);
      if (!deepLinkHandledRef.current && typeof window !== "undefined") {
        deepLinkHandledRef.current = true;
        const params = new URLSearchParams(window.location.search);
        const requestedNumber = params.get("sop")?.trim();
        const requestedDepartment = params.get("department")?.trim();
        const requestedSop = requestedNumber
          ? json.sops?.find(
              (sop: any) =>
                String(sop.sop_number).toLowerCase() ===
                requestedNumber.toLowerCase(),
            )
          : requestedDepartment
            ? json.sops?.find(
                (sop: any) =>
                  sop.scope_type === "department" &&
                  (String(sop.department || "").toLowerCase() ===
                    requestedDepartment.toLowerCase() ||
                    sop.assignments?.some(
                      (assignment: any) =>
                        assignment.audience_type === "department" &&
                        String(assignment.department || "").toLowerCase() ===
                          requestedDepartment.toLowerCase(),
                    )),
              )
            : null;
        if (requestedSop) {
          setTab("sops");
          if (requestedSop.scope_type === "department") {
            setSopDepartmentFilter(String(requestedSop.department || "all"));
          }
          setViewSop(requestedSop);
        }
      }
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
    const response = await fetch("/api/team/compliance", {
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
      autosave,
    };
  }

  useEffect(() => {
    if (!sopEditor || !sopDirty) return;
    setSopSave("saving");
    const timer = window.setTimeout(async () => {
      try {
        await post(
          sopPayload(
            sopEditor,
            sopEditor.status === "published" ? "published" : "draft",
            true,
          ),
        );
        setSopDirty(false);
        setSopSave("saved");
      } catch {
        setSopSave("error");
      }
    }, 850);
    return () => window.clearTimeout(timer);
     
  }, [sopEditor, sopDirty]);

  useEffect(() => {
    if (!loanEditor || !loanDirty) return;
    setLoanSave("saving");
    const timer = window.setTimeout(async () => {
      try {
        await post({
          action: "save_loan",
          id: loanEditor.id,
          requested_days: loanEditor.requested_days,
          request_note: loanEditor.request_note,
          submit: false,
        });
        setLoanDirty(false);
        setLoanSave("saved");
      } catch {
        setLoanSave("error");
      }
    }, 750);
    return () => window.clearTimeout(timer);
     
  }, [loanEditor, loanDirty]);

  useEffect(() => {
    if (!overnightEditor || !overnightDirty) return;
    setOvernightSave("saving");
    const timer = window.setTimeout(async () => {
      try {
        await post({
          action: "save_overnight",
          id: overnightEditor.id,
          requested_date: overnightEditor.requested_date,
          planned_start: overnightEditor.planned_start,
          planned_end: overnightEditor.planned_end,
          purpose: overnightEditor.purpose,
          emergency_contact: overnightEditor.emergency_contact,
          signature_name: overnightEditor.signature_name,
          submit: false,
        });
        setOvernightDirty(false);
        setOvernightSave("saved");
      } catch {
        setOvernightSave("error");
      }
    }, 750);
    return () => window.clearTimeout(timer);
     
  }, [overnightEditor, overnightDirty]);

  const sopDepartmentOptions = useMemo(
    () =>
      Array.from(
        new Set<string>(
          data.sops
            .filter(
              (sop: any) => sop.scope_type === "department" && sop.department,
            )
            .map((sop: any) => String(sop.department)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [data.sops],
  );
  const filteredSops = useMemo(
    () =>
      data.sops
        .filter((sop: any) => {
          if (sopDepartmentFilter === "general")
            return sop.scope_type === "general";
          if (sopDepartmentFilter === "task") return sop.scope_type === "task";
          if (sopDepartmentFilter === "invited") return sop.is_invited;
          if (sopDepartmentFilter !== "all")
            return (
              sop.scope_type === "department" &&
              sop.department === sopDepartmentFilter
            );
          return true;
        })
        .filter((sop: any) =>
          `${sop.sop_number} ${sop.title} ${sop.summary} ${sop.department} ${sop.task_name}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        )
        .sort((a: any, b: any) =>
          String(a.sop_number || "").localeCompare(
            String(b.sop_number || ""),
            undefined,
            { numeric: true },
          ),
        ),
    [data.sops, search, sopDepartmentFilter],
  );
  const filteredBooks = useMemo(
    () =>
      data.books.filter((book: any) =>
        `${book.title} ${book.author} ${book.category} ${book.inventory_number}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [data.books, search],
  );

  async function acknowledge(sop: any) {
    setBusy(`ack-${sop.id}`);
    try {
      await post({ action: "acknowledge_sop", id: sop.id });
      setViewSop({ ...sop, acknowledged: true });
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not acknowledge the SOP.",
      );
    } finally {
      setBusy("");
    }
  }

  async function saveSop(status: "draft" | "published") {
    if (!sopEditor) return;
    setBusy("sop-save");
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
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("sop_id", sopEditor.id);
      const response = await fetch("/api/team/compliance/upload", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(json.error || "Attachment upload failed.");
      setSopEditor((current: any) => ({
        ...current,
        media: [...current.media, json.media],
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

  async function deleteMedia(media: any) {
    if (!(await appConfirm(`Remove ${media.file_name}?`))) return;
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

  async function requestBook(book: any) {
    setBusy(`book-${book.id}`);
    setError("");
    try {
      const json = await post({
        action: "create_loan_draft",
        book_id: book.id,
      });
      setLoanEditor({ ...json.loan, book });
      setLoanDirty(false);
      setLoanSave("saved");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not start a book request.",
      );
    } finally {
      setBusy("");
    }
  }

  async function submitLoan() {
    if (!loanEditor) return;
    setBusy("loan-submit");
    try {
      await post({
        action: "save_loan",
        id: loanEditor.id,
        requested_days: loanEditor.requested_days,
        request_note: loanEditor.request_note,
        submit: true,
      });
      setLoanEditor(null);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not submit the loan request.",
      );
    } finally {
      setBusy("");
    }
  }

  async function cancelLoan(loan: any, close = false) {
    setBusy(`loan-${loan.id}`);
    try {
      await post({ action: "cancel_loan", id: loan.id });
      if (close) setLoanEditor(null);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not cancel the loan request.",
      );
    } finally {
      setBusy("");
    }
  }

  async function createOvernight() {
    setBusy("new-overnight");
    try {
      const json = await post({ action: "create_overnight_draft" });
      setOvernightEditor({ ...json.request, terms_accepted: false });
      setOvernightDirty(false);
      setOvernightSave("saved");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not start an overnight request.",
      );
    } finally {
      setBusy("");
    }
  }

  async function submitOvernight() {
    if (!overnightEditor) return;
    setBusy("overnight-submit");
    try {
      await post({
        action: "save_overnight",
        id: overnightEditor.id,
        requested_date: overnightEditor.requested_date,
        planned_start: overnightEditor.planned_start,
        planned_end: overnightEditor.planned_end,
        purpose: overnightEditor.purpose,
        emergency_contact: overnightEditor.emergency_contact,
        signature_name: overnightEditor.signature_name,
        terms_accepted: overnightEditor.terms_accepted,
        submit: true,
      });
      setOvernightEditor(null);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not submit the overnight request.",
      );
    } finally {
      setBusy("");
    }
  }

  async function cancelOvernight(request: any, close = false) {
    setBusy(`overnight-${request.id}`);
    try {
      await post({ action: "cancel_overnight", id: request.id });
      if (close) setOvernightEditor(null);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not cancel the request.",
      );
    } finally {
      setBusy("");
    }
  }

  const myCurrentLoan = (bookId: string) =>
    data.loans.find(
      (loan: any) =>
        loan.book_id === bookId &&
        ["draft", "requested", "borrowed", "overdue"].includes(loan.status),
    );

  if (loading)
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]" />
      </div>
    );

  return (
    <div className="min-h-full px-3 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1450px]">
        <div className="rounded-3xl bg-[#0A4FE8] p-6 text-white shadow-[0_16px_45px_rgba(10,79,232,0.18)] sm:p-8">
          <p className="text-xs font-medium text-white/75">Team workspace</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
            Team compliance
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/80">
            Find the standards assigned to you, borrow from the office library,
            and submit accountable workplace requests.
          </p>
        </div>
        <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm md:flex-row md:items-center">
          <div className="flex gap-2 overflow-x-auto">
            {(
              [
                ["sops", "SOPs", FileText],
                ["library", "Library", BookOpen],
                ["approvals", "Extra approvals", BedDouble],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                type="button"
                key={id}
                onClick={() => setTab(id)}
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-medium transition ${tab === id ? "bg-[#0A4FE8] text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
          {tab === "sops" && (
            <select
              value={sopDepartmentFilter}
              onChange={(event) => setSopDepartmentFilter(event.target.value)}
              aria-label="Filter SOPs by department"
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#0A4FE8] md:max-w-56"
            >
              <option value="all">All assigned SOPs</option>
              <option value="general">Generalist SOPs</option>
              <option value="task">Dashboard task SOPs</option>
              {sopDepartmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
              {data.sops.some((sop: any) => sop.is_invited) && (
                <option value="invited">Invited SOPs</option>
              )}
            </select>
          )}
          {tab !== "approvals" && (
            <label className="relative ml-auto w-full md:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={tab === "sops" ? "Search SOPs" : "Search books"}
                className="min-h-11 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-[#0A4FE8]"
              />
            </label>
          )}
        </div>
        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
            <button
              type="button"
              onClick={() => setError("")}
              className="ml-auto"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {tab === "sops" && (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {filteredSops.map((sop: any) => {
              const canEdit =
                sop.can_edit && (sop.status === "draft" || sop.can_publish);
              return (
                <article
                  key={sop.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-700">
                          {sop.sop_number || "Number pending"}
                        </span>
                        <Status value={sop.status} />
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-[#0A4FE8]">
                          {titleCase(sop.scope_type)}
                        </span>
                        {sop.is_invited && (
                          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700">
                            {sop.can_edit
                              ? "Invited author"
                              : "Invited participant"}
                          </span>
                        )}
                      </div>
                      <h2 className="mt-3 text-lg font-semibold text-[#0D1B39]">
                        {sop.title || "Untitled SOP draft"}
                      </h2>
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">
                        {sop.summary ||
                          sop.content ||
                          "This procedure is waiting to be written."}
                      </p>
                    </div>
                    <ShieldCheck className="ml-auto h-5 w-5 shrink-0 text-[#0A4FE8]" />
                  </div>
                  <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                    {sop.status === "published" && (
                      <button
                        type="button"
                        onClick={() => setViewSop(sop)}
                        className="min-h-10 rounded-xl bg-[#0A4FE8] px-4 text-sm font-semibold text-white hover:bg-[#083FC0]"
                      >
                        Read SOP
                      </button>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          setSopEditor(sopForm(sop));
                          setSopDirty(false);
                          setSopSave("idle");
                        }}
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-blue-200 px-4 text-sm font-semibold text-[#0A4FE8] hover:bg-blue-50"
                      >
                        <Pencil className="h-4 w-4" />
                        Edit draft
                      </button>
                    )}
                    {sop.acknowledged && (
                      <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" />
                        Acknowledged
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
            {!filteredSops.length && (
              <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
                <FileText className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm text-slate-500">
                  No assigned SOPs match this search.
                </p>
              </div>
            )}
          </div>
        )}

        {tab === "library" && (
          <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <div className="grid gap-4 sm:grid-cols-2">
              {filteredBooks.map((book: any) => {
                const loan = myCurrentLoan(book.id);
                return (
                  <article
                    key={book.id}
                    className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-[#0A4FE8]">
                        {book.inventory_number}
                      </span>
                      <Status value={book.status} />
                    </div>
                    <h2 className="mt-4 font-semibold text-[#0D1B39]">
                      {book.title}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">{book.author}</p>
                    {book.description && (
                      <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
                        {book.description}
                      </p>
                    )}
                    {book.acquisition_type === "donated" && (
                      <p className="mt-3 text-xs text-slate-400">
                        Gifted by {book.donor_name || "a team member"}
                      </p>
                    )}
                    <div className="mt-auto pt-5">
                      {loan ? (
                        <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                          <span className="text-xs text-slate-500">
                            Your request
                          </span>
                          <Status value={loan.status} />
                          {loan.status === "draft" && (
                            <button
                              type="button"
                              onClick={() => void requestBook(book)}
                              className="text-xs font-semibold text-[#0A4FE8]"
                            >
                              Continue
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={
                            book.status !== "available" ||
                            busy === `book-${book.id}`
                          }
                          onClick={() => void requestBook(book)}
                          className="min-h-10 w-full rounded-xl bg-[#0A4FE8] px-4 text-sm font-semibold text-white hover:bg-[#083FC0] disabled:bg-slate-200 disabled:text-slate-500"
                        >
                          {book.status === "available"
                            ? "Request this book"
                            : "Currently unavailable"}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
              {!filteredBooks.length && (
                <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
                  No library books match this search.
                </div>
              )}
            </div>
            <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-[#0D1B39]">My book activity</h2>
              <p className="mt-1 text-xs text-slate-500">
                Loans are limited to 21 days.
              </p>
              <div className="mt-4 space-y-3">
                {data.loans
                  .filter((loan: any) => loan.status !== "draft")
                  .map((loan: any) => (
                    <div
                      key={loan.id}
                      className="rounded-xl border border-slate-100 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-slate-700">
                          {loan.book_title}
                        </p>
                        <Status value={loan.status} />
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        {loan.requested_days} days
                        {loan.due_at
                          ? ` · Due ${readableDate(loan.due_at)}`
                          : ""}
                      </p>
                      {loan.status === "requested" && (
                        <button
                          type="button"
                          onClick={() => void cancelLoan(loan)}
                          className="mt-2 text-xs font-semibold text-rose-600"
                        >
                          Cancel request
                        </button>
                      )}
                    </div>
                  ))}
                {!data.loans.some((loan: any) => loan.status !== "draft") && (
                  <p className="py-8 text-center text-sm text-slate-400">
                    No loan history yet.
                  </p>
                )}
              </div>
            </aside>
          </div>
        )}

        {tab === "approvals" && (
          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.4fr]">
            <section className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#0A4FE8]">
                <BedDouble className="h-5 w-5" />
              </span>
              <h2 className="mt-5 text-xl font-semibold text-[#0D1B39]">
                Request an overnight stay
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                For voluntary overnight work or learning. You must accept the
                office safety and security terms before submission.
              </p>
              <button
                type="button"
                onClick={() => void createOvernight()}
                disabled={busy === "new-overnight"}
                className="mt-5 min-h-11 w-full rounded-xl bg-[#0A4FE8] px-4 text-sm font-semibold text-white hover:bg-[#083FC0] disabled:opacity-60"
              >
                Start or continue request
              </button>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-[#0D1B39]">My requests</h2>
              <div className="mt-4 space-y-3">
                {data.overnightRequests
                  .filter((request: any) => request.status !== "draft")
                  .map((request: any) => (
                    <article
                      key={request.id}
                      className="rounded-xl border border-slate-100 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-800">
                            {readableDate(request.requested_date)}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {String(request.planned_start || "").slice(0, 5)} to{" "}
                            {String(request.planned_end || "").slice(0, 5)} ·
                            Signed {readableDate(request.signed_at, true)}
                          </p>
                        </div>
                        <Status value={request.status} />
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-600">
                        {request.purpose}
                      </p>
                      {request.reviewer_note && (
                        <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-500">
                          Reviewer: {request.reviewer_note}
                        </p>
                      )}
                      {request.status === "pending" && (
                        <button
                          type="button"
                          onClick={() => void cancelOvernight(request)}
                          className="mt-3 text-xs font-semibold text-rose-600"
                        >
                          Cancel request
                        </button>
                      )}
                    </article>
                  ))}
                {!data.overnightRequests.some(
                  (request: any) => request.status !== "draft",
                ) && (
                  <p className="py-10 text-center text-sm text-slate-400">
                    No submitted requests yet.
                  </p>
                )}
              </div>
            </section>
          </div>
        )}
      </div>

      {viewSop && (
        <Modal
          title={viewSop.title}
          subtitle={`${viewSop.sop_number || "SOP"} · ${titleCase(viewSop.scope_type)} · Version ${viewSop.version}`}
          onClose={() => setViewSop(null)}
          wide
        >
          <article>
            <p className="text-sm leading-6 text-slate-500">
              {viewSop.summary}
            </p>
            <div className="mt-6 whitespace-pre-wrap rounded-2xl bg-slate-50 p-5 text-sm leading-7 text-slate-700">
              {viewSop.content}
            </div>
            {viewSop.media?.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-slate-800">
                  Procedure media
                </h3>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  {viewSop.media.map((media: any) =>
                    media.media_type === "video" ? (
                      <div
                        key={media.id}
                        className="overflow-hidden rounded-xl border border-slate-200"
                      >
                        <video
                          controls
                          preload="metadata"
                          className="aspect-video w-full bg-black"
                        >
                          <source src={media.url} type={media.mime_type} />
                        </video>
                        <p className="truncate p-3 text-xs text-slate-500">
                          {media.file_name}
                        </p>
                      </div>
                    ) : (
                      <a
                        key={media.id}
                        href={media.url}
                        target="_blank"
                        rel="noreferrer"
                        className="overflow-hidden rounded-xl border border-slate-200"
                      >
                        <img
                          src={media.url}
                          alt={media.file_name}
                          className="aspect-video w-full object-cover"
                        />
                        <p className="truncate p-3 text-xs text-slate-500">
                          {media.file_name}
                        </p>
                      </a>
                    ),
                  )}
                </div>
              </div>
            )}
            <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center">
              <p className="text-xs leading-5 text-slate-500">
                Acknowledging confirms you have read and understood this version
                of the SOP.
              </p>
              <button
                type="button"
                disabled={viewSop.acknowledged || busy === `ack-${viewSop.id}`}
                onClick={() => void acknowledge(viewSop)}
                className="ml-auto min-h-11 shrink-0 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white disabled:bg-emerald-100 disabled:text-emerald-700"
              >
                {viewSop.acknowledged ? "Acknowledged" : "Acknowledge SOP"}
              </button>
            </div>
          </article>
        </Modal>
      )}

      {sopEditor && (
        <Modal
          title={sopEditor.title || "SOP draft"}
          subtitle={`${sopEditor.sop_number || "SOP"} · You were invited to edit${sopEditor.can_publish ? " and publish" : ""} this procedure. Changes autosave.`}
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
                    list="team-compliance-departments"
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
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-6 outline-none focus:border-[#0A4FE8]"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Procedure
              <textarea
                value={sopEditor.content || ""}
                onChange={(event) => {
                  setSopEditor({ ...sopEditor, content: event.target.value });
                  setSopDirty(true);
                }}
                rows={12}
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
                    Upload supporting steps directly to the protected SOP.
                  </p>
                </div>
                <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-blue-200 px-3 text-xs font-semibold text-[#0A4FE8]">
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
                {sopEditor.media.map((media: any) => (
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
                      className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700"
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
                  Invite relevant readers
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
                      {data.departments.map((department: string) => (
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
                  </>
                )}
              </div>
              {!sopEditor.all_team && (
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Individual members
                  </p>
                  <div className="mt-2 max-h-52 space-y-2 overflow-y-auto">
                    {data.members.map((member: any) => (
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
                              ? [...sopEditor.assignment_member_ids, member.id]
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
                        {member.full_name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </section>
            <datalist id="team-compliance-departments">
              {data.departments.map((department: string) => (
                <option key={department} value={department} />
              ))}
            </datalist>
            <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center">
              <Saving state={sopSave} />
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => void saveSop("draft")}
                  className="min-h-11 rounded-xl border border-blue-200 px-4 text-sm font-semibold text-[#0A4FE8]"
                >
                  Save draft
                </button>
                {sopEditor.can_publish && (
                  <button
                    type="button"
                    onClick={() => void saveSop("published")}
                    disabled={busy === "sop-save"}
                    className="min-h-11 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Publish SOP
                  </button>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {loanEditor && (
        <Modal
          title={`Request ${loanEditor.book?.title || "book"}`}
          subtitle="Choose a study period of no more than 21 days."
          onClose={() => {
            setLoanEditor(null);
            void load();
          }}
        >
          <div className="space-y-5">
            <div className="rounded-xl bg-blue-50 p-4">
              <p className="font-mono text-xs font-semibold text-[#0A4FE8]">
                {loanEditor.book?.inventory_number}
              </p>
              <p className="mt-2 font-semibold text-slate-800">
                {loanEditor.book?.title}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {loanEditor.book?.author}
              </p>
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Requested duration
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={21}
                  value={loanEditor.requested_days || 21}
                  onChange={(event) => {
                    setLoanEditor({
                      ...loanEditor,
                      requested_days: Number(event.target.value),
                    });
                    setLoanDirty(true);
                  }}
                  className="w-full accent-[#0A4FE8]"
                />
                <span className="w-20 rounded-xl border border-slate-200 px-3 py-2 text-center text-sm">
                  {loanEditor.requested_days || 21} days
                </span>
              </div>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Study note (optional)
              <textarea
                value={loanEditor.request_note || ""}
                onChange={(event) => {
                  setLoanEditor({
                    ...loanEditor,
                    request_note: event.target.value,
                  });
                  setLoanDirty(true);
                }}
                rows={4}
                placeholder="What do you plan to learn or apply?"
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-6 outline-none focus:border-[#0A4FE8]"
              />
            </label>
            <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center">
              <Saving state={loanSave} />
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => void cancelLoan(loanEditor, true)}
                  className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-rose-600"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => void submitLoan()}
                  disabled={busy === "loan-submit"}
                  className="min-h-11 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Submit request
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {overnightEditor && (
        <Modal
          title="Overnight office request"
          subtitle="This request autosaves until you sign and submit it."
          onClose={() => {
            setOvernightEditor(null);
            void load();
          }}
          wide
        >
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="text-sm font-medium text-slate-700">
                Date
                <input
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={overnightEditor.requested_date?.slice(0, 10) || ""}
                  onChange={(event) => {
                    setOvernightEditor({
                      ...overnightEditor,
                      requested_date: event.target.value,
                    });
                    setOvernightDirty(true);
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-[#0A4FE8]"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Start time
                <input
                  type="time"
                  value={String(overnightEditor.planned_start || "").slice(
                    0,
                    5,
                  )}
                  onChange={(event) => {
                    setOvernightEditor({
                      ...overnightEditor,
                      planned_start: event.target.value,
                    });
                    setOvernightDirty(true);
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-[#0A4FE8]"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                End time
                <input
                  type="time"
                  value={String(overnightEditor.planned_end || "").slice(0, 5)}
                  onChange={(event) => {
                    setOvernightEditor({
                      ...overnightEditor,
                      planned_end: event.target.value,
                    });
                    setOvernightDirty(true);
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-[#0A4FE8]"
                />
              </label>
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Purpose
              <textarea
                value={overnightEditor.purpose || ""}
                onChange={(event) => {
                  setOvernightEditor({
                    ...overnightEditor,
                    purpose: event.target.value,
                  });
                  setOvernightDirty(true);
                }}
                rows={4}
                placeholder="Explain the work or learning you plan to complete."
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal leading-6 outline-none focus:border-[#0A4FE8]"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Emergency contact
              <input
                value={overnightEditor.emergency_contact || ""}
                onChange={(event) => {
                  setOvernightEditor({
                    ...overnightEditor,
                    emergency_contact: event.target.value,
                  });
                  setOvernightDirty(true);
                }}
                placeholder="Name and phone number"
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-[#0A4FE8]"
              />
            </label>
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <h3 className="font-semibold text-amber-900">
                Terms and conditions
              </h3>
              <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-amber-900/80">
                {data.terms}
              </div>
              <label className="mt-4 flex items-start gap-3 border-t border-amber-200 pt-4 text-sm leading-6 text-amber-900">
                <input
                  type="checkbox"
                  checked={!!overnightEditor.terms_accepted}
                  onChange={(event) =>
                    setOvernightEditor({
                      ...overnightEditor,
                      terms_accepted: event.target.checked,
                    })
                  }
                  className="mt-1 h-4 w-4 accent-[#0A4FE8]"
                />
                <span>
                  I have read, understood, and voluntarily accept every term
                  above.
                </span>
              </label>
            </section>
            <label className="block text-sm font-medium text-slate-700">
              Type your full name to sign
              <input
                value={overnightEditor.signature_name || ""}
                onChange={(event) => {
                  setOvernightEditor({
                    ...overnightEditor,
                    signature_name: event.target.value,
                  });
                  setOvernightDirty(true);
                }}
                placeholder={data.member.full_name}
                autoComplete="name"
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-[#0A4FE8]"
              />
              <span className="mt-1 block text-xs font-normal text-slate-400">
                Your signature must match “{data.member.full_name}”.
              </span>
            </label>
            <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center">
              <Saving state={overnightSave} />
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => void cancelOvernight(overnightEditor, true)}
                  className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-rose-600"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => void submitOvernight()}
                  disabled={busy === "overnight-submit"}
                  className="min-h-11 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Sign and submit
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
