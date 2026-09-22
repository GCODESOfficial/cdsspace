"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, FolderUp, Loader2, Save, Send, ShieldCheck, Trash2 } from "lucide-react";
import { DELIVERY_FILE_ACCEPT, deliveryFileRelativePath } from "@/lib/client-deliveries";
import { appAlert, appConfirm } from "@/lib/app-notify";

interface DeliveryFile { id: string; file_name: string; relative_path: string; file_size: number; file_kind: string; }
interface DeliveryDraft {
  id: string; title: string; description: string | null; status: string; external_url: string | null;
  updated_at: string; work_code: string; category: string | null; file_count: number; files: DeliveryFile[];
}

function readableSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TeamDeliveriesPage() {
  const [items, setItems] = useState<DeliveryDraft[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const selected = useMemo(() => items.find((item) => item.id === selectedId) || null, [items, selectedId]);
  const editable = selected && ["assigned", "draft", "revision_requested"].includes(selected.status);

  const load = async (keepSelection = true) => {
    try {
      const response = await fetch("/api/team/deliveries", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not load delivery drafts.");
      setItems(data.deliveries || []);
      setSelectedId((current) => keepSelection && current && (data.deliveries || []).some((item: DeliveryDraft) => item.id === current) ? current : data.deliveries?.[0]?.id || null);
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Could not load delivery drafts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(false); }, []);
  useEffect(() => {
    if (!selected) return;
    setTitle(selected.title || "");
    setDescription(selected.description || "");
    setExternalUrl(selected.external_url || "");
    setSaveState("idle");
  }, [selectedId, selected?.updated_at]);

  useEffect(() => {
    if (!editable || saveState === "idle") return;
    setSaveState("saving");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/team/deliveries", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delivery_id: selected.id, action: "save", title, description, external_url: externalUrl }),
        });
        if (!response.ok) throw new Error("Save failed");
        setSaveState("saved");
      } catch { setSaveState("error"); }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [title, description, externalUrl, editable, selected?.id]);

  const updateField = (setter: (value: string) => void, value: string) => { setter(value); setSaveState("saving"); };

  const upload = async (files: FileList | null) => {
    if (!selected || !files?.length) return;
    setUploading(true);
    let uploaded = false;
    try {
      // Keep every request below the hosting upload limit while still allowing
      // a team member to choose a complete folder or several finished files.
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set("delivery_id", selected.id);
        form.append("files", file);
        form.append("relative_paths", deliveryFileRelativePath(file));
        const response = await fetch("/api/team/deliveries", { method: "POST", body: form });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Could not upload ${file.name}.`);
        uploaded = true;
      }
    } catch (error) { await appAlert(error instanceof Error ? error.message : "Upload failed."); }
    finally {
      if (uploaded) await load();
      setUploading(false);
    }
  };

  const removeFile = async (file: DeliveryFile) => {
    if (!selected || !(await appConfirm(`Remove ${file.relative_path || file.file_name} from this draft?`))) return;
    const response = await fetch("/api/team/deliveries", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ delivery_id: selected.id, action: "remove_files", file_ids: [file.id] }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return void appAlert(data.error || "Could not remove this file.");
    await load();
  };

  const submit = async () => {
    if (!selected || !(await appConfirm("Submit this delivery for internal admin review? You cannot edit it while it is under review."))) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/team/deliveries", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ delivery_id: selected.id, action: "submit", title, description, external_url: externalUrl, work_code: selected.work_code }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not submit the delivery.");
      await load();
    } catch (error) { await appAlert(error instanceof Error ? error.message : "Could not submit the delivery."); }
    finally { setSubmitting(false); }
  };

  return (
    <main className="min-h-full bg-[#F4F6FB] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><p className="text-sm font-semibold text-[#0A4FE8]">Production</p><h1 className="mt-1 text-3xl font-bold text-[#0D1B39]">Delivery drafts</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Upload finished work, keep it as a private draft, and submit it for internal review. Client identity and contact details are not available in this workspace.</p></div>
          <span className="inline-flex items-center gap-2 self-start rounded-full border border-blue-100 bg-white px-3 py-2 text-xs font-semibold text-[#0A4FE8]"><ShieldCheck className="h-4 w-4" /> Client details protected</span>
        </div>

        {loading ? <div className="grid min-h-80 place-items-center rounded-3xl bg-white"><Loader2 className="h-7 w-7 animate-spin text-[#0A4FE8]" /></div> : items.length === 0 ? <div className="grid min-h-80 place-items-center rounded-3xl border border-slate-200 bg-white px-6 text-center"><div><FolderUp className="mx-auto h-10 w-10 text-blue-200" /><h2 className="mt-3 font-semibold text-[#0D1B39]">No delivery work assigned</h2><p className="mt-1 text-sm text-slate-500">New design work will appear here after an admin routes the order.</p></div></div> : (
          <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
              {items.map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === item.id ? "border-[#0A4FE8] bg-blue-50" : "border-slate-100 hover:border-blue-200"}`}><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-[#0A4FE8]">{item.work_code}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{item.status.replaceAll("_", " ")}</span></div><p className="mt-2 line-clamp-2 text-sm font-semibold text-[#0D1B39]">{item.title}</p><p className="mt-1 text-xs text-slate-400">{item.file_count} file{item.file_count === 1 ? "" : "s"}</p></button>)}
            </aside>

            {selected && <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold text-[#0A4FE8]">{selected.work_code} · {selected.category?.replaceAll("_", " ") || "Design"}</p><h2 className="mt-1 text-xl font-bold text-[#0D1B39]">Prepare internal delivery</h2></div><span className="inline-flex items-center gap-1.5 text-xs text-slate-400">{saveState === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{saveState === "saving" ? "Saving" : saveState === "error" ? "Save needs attention" : "Draft saved"}</span></div>
              {selected.status === "submitted" ? <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-medium text-[#0A4FE8]">Submitted for internal review. An admin can now approve, request changes, and package it for the client.</div> : <div className="mt-5 space-y-4">
                {selected.status === "revision_requested" && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">Changes were requested. Update the files or notes, then submit again.</div>}
                <label className="block text-sm font-semibold text-[#0D1B39]">Delivery title<input disabled={!editable} value={title} onChange={(event) => updateField(setTitle, event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-[#0A4FE8] disabled:bg-slate-50" /></label>
                <label className="block text-sm font-semibold text-[#0D1B39]">Internal handover notes<textarea disabled={!editable} value={description} onChange={(event) => updateField(setDescription, event.target.value)} rows={5} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-sm font-normal leading-6 outline-none focus:border-[#0A4FE8] disabled:bg-slate-50" /></label>
                <label className="block text-sm font-semibold text-[#0D1B39]">Google Drive or Docs link <span className="font-normal text-slate-400">(optional)</span><input disabled={!editable} value={externalUrl} onChange={(event) => updateField(setExternalUrl, event.target.value)} placeholder="https://drive.google.com/..." className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-[#0A4FE8] disabled:bg-slate-50" /></label>
                <div><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-[#0D1B39]">Files and documents</h3><label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-xs font-semibold text-white"><FolderUp className="h-4 w-4" />{uploading ? "Uploading" : "Upload files"}<input type="file" multiple accept={DELIVERY_FILE_ACCEPT} disabled={!editable || uploading} onChange={(event) => { void upload(event.target.files); event.currentTarget.value = ""; }} className="sr-only" /></label></div><div className="mt-3 space-y-2">{selected.files.length === 0 ? <p className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-400">No files uploaded yet.</p> : selected.files.map((file) => <div key={file.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3"><FileText className="h-4 w-4 text-[#0A4FE8]" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-[#0D1B39]">{file.relative_path || file.file_name}</p><p className="text-xs text-slate-400">{readableSize(Number(file.file_size || 0))}</p></div>{editable && <button type="button" onClick={() => void removeFile(file)} className="grid h-8 w-8 place-items-center rounded-lg text-rose-500 hover:bg-rose-50" aria-label={`Remove ${file.file_name}`}><Trash2 className="h-4 w-4" /></button>}</div>)}</div></div>
                <button type="button" onClick={() => void submit()} disabled={submitting || (!selected.file_count && !externalUrl.trim())} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit for internal review</button>
              </div>}
            </section>}
          </div>
        )}
      </div>
    </main>
  );
}
