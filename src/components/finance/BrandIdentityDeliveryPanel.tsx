"use client";

import { useEffect, useState } from "react";
import {
  Archive,
  CheckCircle2,
  Copy,
  ExternalLink,
  EyeOff,
  FileText,
  Image as ImageIcon,
  Loader2,
  Palette,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { glassCard } from "@/components/finance/FinanceShell";
import { appConfirm, appToast } from "@/lib/app-notify";
import type { BrandIdentityDelivery, BrandIdentityFile } from "@/lib/brand-identity";

interface DeliveryProject {
  id: string;
  name: string;
  client: string;
  client_email: string | null;
  user_id: string | null;
  status: string;
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function fileIcon(file: BrandIdentityFile) {
  if (file.file_kind === "image") return ImageIcon;
  if (file.file_kind === "archive") return Archive;
  return FileText;
}

export function BrandIdentityDeliveryPanel({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<DeliveryProject | null>(null);
  const [delivery, setDelivery] = useState<BrandIdentityDelivery | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/finance/projects/${projectId}/brand-identity`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not load the delivery workspace.");
      setProject(payload.project || null);
      setDelivery(payload.delivery || null);
      setTitle(payload.delivery?.title || `${payload.project?.name || "Project"} Brand Identity`);
      setDescription(payload.delivery?.description || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load the delivery workspace.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const upload = async () => {
    if (!files.length) {
      setError("Choose at least one completed brand file.");
      return;
    }
    setWorking(true);
    setError("");
    try {
      const form = new FormData();
      form.set("title", title);
      form.set("description", description);
      files.forEach((file) => form.append("files", file));
      const response = await fetch(`/api/admin/finance/projects/${projectId}/brand-identity`, { method: "POST", body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not upload the completed files.");
      setProject(payload.project);
      setDelivery(payload.delivery);
      setFiles([]);
      appToast({ message: "Completed brand files uploaded as a delivery draft.", kind: "success" });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload the completed files.");
    } finally {
      setWorking(false);
    }
  };

  const updateDelivery = async (isPublic?: boolean) => {
    if (!delivery) return;
    setWorking(true);
    setError("");
    try {
      const body: Record<string, unknown> = { title, description };
      if (typeof isPublic === "boolean") {
        body.is_public = isPublic;
        if (isPublic && project?.status !== "completed") body.mark_project_completed = true;
      }
      const response = await fetch(`/api/admin/finance/projects/${projectId}/brand-identity`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not update the brand identity delivery.");
      setProject(payload.project);
      setDelivery(payload.delivery);
      appToast({
        message: typeof isPublic === "boolean"
          ? isPublic ? "Brand identity published to the client." : "Public access disabled."
          : "Delivery details saved.",
        kind: "success",
      });
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update the brand identity delivery.");
    } finally {
      setWorking(false);
    }
  };

  const removeFile = async (file: BrandIdentityFile) => {
    if (!(await appConfirm(`Remove ${file.file_name} from this delivery?`))) return;
    const response = await fetch(`/api/admin/finance/projects/${projectId}/brand-identity/files/${file.id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error || "Could not remove the file.");
      return;
    }
    setDelivery((current) => current ? { ...current, files: current.files.filter((item) => item.id !== file.id) } : current);
  };

  const copyShareLink = async () => {
    if (!delivery?.public_url) return;
    await navigator.clipboard.writeText(delivery.public_url);
    appToast({ message: "Public Brand Identity link copied.", kind: "success" });
  };

  return (
    <section className={`${glassCard} p-6`} data-admin-brand-identity-delivery>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-violet-50 text-violet-700">
            <Palette className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[17px] font-bold text-[#0D1B39]">Final Brand Identity delivery</h2>
              {delivery?.is_public ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">Published</span>
              ) : (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">Draft</span>
              )}
            </div>
            <p className="mt-1 max-w-2xl text-[12px] leading-5 text-gray-500">
              Upload the completed guideline, logo pack, source files and supporting assets. Publishing marks the project completed and adds Brand Identity to the client dashboard.
            </p>
          </div>
        </div>
        {project && (
          <div className="rounded-[8px] border border-gray-200 bg-gray-50 px-3 py-2 text-right">
            <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Client account</p>
            <p className="mt-0.5 text-[11px] font-semibold text-[#0D1B39]">{project.client}</p>
            <p className={`text-[10px] ${project.user_id ? "text-emerald-600" : "text-rose-600"}`}>{project.user_id ? "Account linked" : "Not linked"}</p>
          </div>
        )}
      </div>

      {error && <div className="mt-4 rounded-[8px] border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] text-rose-700">{error}</div>}

      {loading ? (
        <div className="grid min-h-40 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-blue-600" /></div>
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(330px,0.62fr)]">
          <div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Delivery title
                <input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 h-11 w-full rounded-[8px] border border-gray-200 bg-white px-3 text-[13px] font-medium normal-case tracking-normal text-[#0D1B39] outline-none focus:border-blue-400" />
              </label>
              <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Client note
                <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What is included in this handover?" className="mt-2 h-11 w-full rounded-[8px] border border-gray-200 bg-white px-3 text-[13px] font-medium normal-case tracking-normal text-[#0D1B39] outline-none focus:border-blue-400" />
              </label>
            </div>

            <label className="mt-4 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-[12px] border border-dashed border-blue-300 bg-blue-50/40 px-5 py-5 text-center transition hover:bg-blue-50">
              <UploadCloud className="h-6 w-6 text-blue-600" />
              <span className="mt-2 text-[12px] font-bold text-[#0D1B39]">Choose completed brand files</span>
              <span className="mt-1 text-[10px] text-gray-500">Images, PDF, Office or ZIP · 50MB each · up to 10 at a time</span>
              <input type="file" multiple className="sr-only" accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.doc,.docx,.ppt,.pptx,.zip" onChange={(event) => setFiles(Array.from(event.target.files || []))} />
            </label>
            {files.length > 0 && <p className="mt-2 text-[11px] font-medium text-blue-700">{files.length} file{files.length === 1 ? "" : "s"} ready to upload</p>}

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={upload} disabled={working || !files.length || !project?.user_id} className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#0A4FE8] px-4 text-[12px] font-bold text-white transition hover:bg-[#083EC0] disabled:cursor-not-allowed disabled:opacity-50">
                {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />} Upload delivery draft
              </button>
              {delivery && (
                <button type="button" onClick={() => updateDelivery()} disabled={working} className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-gray-200 bg-white px-4 text-[12px] font-bold text-[#0D1B39] hover:bg-gray-50 disabled:opacity-50">
                  Save details
                </button>
              )}
              {delivery && !delivery.is_public && (
                <button type="button" onClick={() => updateDelivery(true)} disabled={working || delivery.files.length === 0} className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-emerald-600 px-4 text-[12px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                  <CheckCircle2 className="h-4 w-4" /> {project?.status === "completed" ? "Publish to client" : "Complete project & publish"}
                </button>
              )}
              {delivery?.is_public && (
                <button type="button" onClick={() => updateDelivery(false)} disabled={working} className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-amber-200 bg-amber-50 px-4 text-[12px] font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50">
                  <EyeOff className="h-4 w-4" /> Disable public access
                </button>
              )}
            </div>
          </div>

          <div className="rounded-[12px] border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[13px] font-bold text-[#0D1B39]">Delivery files</h3>
                <p className="text-[10px] text-gray-400">{delivery?.files.length || 0} uploaded</p>
              </div>
              {delivery?.is_public && delivery.public_url && (
                <div className="flex gap-1">
                  <button type="button" onClick={copyShareLink} aria-label="Copy public Brand Identity link" className="grid h-8 w-8 place-items-center rounded-[8px] text-gray-500 hover:bg-blue-50 hover:text-blue-600"><Copy className="h-4 w-4" /></button>
                  <a href={delivery.public_url} target="_blank" rel="noreferrer" aria-label="Open public Brand Identity page" className="grid h-8 w-8 place-items-center rounded-[8px] text-gray-500 hover:bg-blue-50 hover:text-blue-600"><ExternalLink className="h-4 w-4" /></a>
                </div>
              )}
            </div>

            <div className="mt-3 space-y-2">
              {!delivery?.files.length ? (
                <div className="rounded-[8px] border border-dashed border-gray-200 px-4 py-8 text-center">
                  <FileText className="mx-auto h-5 w-5 text-gray-300" />
                  <p className="mt-2 text-[11px] text-gray-400">No completed files uploaded yet.</p>
                </div>
              ) : delivery.files.map((file) => {
                const Icon = fileIcon(file);
                return (
                  <div key={file.id} className="flex items-center gap-3 rounded-[8px] border border-gray-100 bg-gray-50/60 p-3">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-white text-blue-600"><Icon className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold text-[#0D1B39]">{file.file_name}</p>
                      <p className="text-[9px] text-gray-400">{formatBytes(file.file_size)}</p>
                    </div>
                    {file.download_url && <a href={file.download_url} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-blue-600" aria-label={`Open ${file.file_name}`}><ExternalLink className="h-3.5 w-3.5" /></a>}
                    <button type="button" onClick={() => removeFile(file)} className="text-gray-400 hover:text-rose-600" aria-label={`Remove ${file.file_name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-[8px] bg-violet-50 p-3 text-[10px] leading-4 text-violet-800">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Files stay private until this delivery is published. The public link is unguessable and can be disabled at any time.
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
