"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Download, File, FileText, Folder, FolderOpen, Loader2, Plus, Upload, X } from "lucide-react";

type Drive = { id:string; name:string; description:string|null; access_level:"view"|"edit"; updated_at:string; file_count:number; folder_count:number };
type LegacyDocument = { id:string; title:string; description:string|null; resources:Array<{id:string;label:string;url:string}> };
type DriveDetail = { drive:Drive; folders:Array<{id:string;name:string}>; files:Array<{id:string;file_name:string;file_size:string;url:string|null}> };

export default function ClientCDrivePage() {
  const [drives, setDrives] = useState<Drive[]>([]);
  const [documents, setDocuments] = useState<LegacyDocument[]>([]);
  const [selected, setSelected] = useState<DriveDetail|null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const fileRef = useRef<HTMLInputElement|null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [driveResponse, documentResponse] = await Promise.all([
      fetch("/api/client/cdrive", { cache: "no-store" }),
      fetch("/api/client/documents", { cache: "no-store" }),
    ]);
    const drivePayload = await driveResponse.json().catch(() => ({}));
    const documentPayload = await documentResponse.json().catch(() => ({}));
    if (driveResponse.ok) setDrives(drivePayload.drives || []);
    else setError(drivePayload.error || "cDrive is temporarily unavailable.");
    if (documentResponse.ok) setDocuments(documentPayload.documents || []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function openDrive(id:string) {
    setBusy(true);
    const response = await fetch(`/api/client/cdrive/${id}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) setSelected(payload);
    else setError(payload.error || "Could not open this drive.");
    setBusy(false);
  }

  async function createDrive(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const response = await fetch("/api/client/cdrive", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ name:form.get("name"), description:form.get("description") }) });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(payload.error || "Could not create the drive.");
    setShowCreate(false); await load(); if (payload.id) await openDrive(payload.id);
  }

  async function updateDrive(form:FormData) {
    if (!selected) return;
    setBusy(true);
    const response = await fetch(`/api/client/cdrive/${selected.drive.id}`, { method:"POST", body:form });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error || "The cDrive update failed.");
    else await openDrive(selected.drive.id);
    setBusy(false);
  }

  function upload(file:File) { const form=new FormData(); form.set("action","upload"); form.set("file",file); void updateDrive(form); }
  async function newFolder() { const name=window.prompt("Folder name"); if(!name?.trim()) return; const form=new FormData(); form.set("action","folder"); form.set("name",name.trim()); await updateDrive(form); }

  return <div className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8">
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-[28px] font-semibold text-[#07133B] lg:text-[34px]">cDrive</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Create project drives, share work with CDS Space, and keep finished deliveries together.</p></div><button type="button" onClick={()=>setShowCreate(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-sm font-semibold text-white hover:bg-[#083FC0]"><Plus className="h-4 w-4"/>Create project drive</button></div>
    {error && <div className="mb-5 flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700"><span>{error}</span><button onClick={()=>setError("")}><X className="h-4 w-4"/></button></div>}
    {loading ? <div className="grid min-h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]"/></div> : <>
      <section><h2 className="mb-3 text-base font-semibold text-[#07133B]">Project drives</h2>{drives.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{drives.map(drive=><button key={drive.id} type="button" onClick={()=>void openDrive(drive.id)} className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md"><div className="flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8]"><Folder className="h-5 w-5"/></span><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${drive.access_level==="edit"?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-600"}`}>{drive.access_level==="edit"?"Can edit":"View only"}</span></div><h3 className="mt-4 truncate text-sm font-semibold text-[#07133B]">{drive.name}</h3><p className="mt-1 line-clamp-2 min-h-9 text-xs leading-5 text-slate-500">{drive.description||"Shared project workspace"}</p><div className="mt-4 flex gap-4 border-t border-slate-100 pt-3 text-[11px] text-slate-400"><span>{drive.folder_count} folders</span><span>{drive.file_count} files</span></div></button>)}</div> : <Empty text="No project drives yet. Create one to share files and folders with CDS Space."/>}</section>
      <section className="mt-9"><h2 className="mb-3 text-base font-semibold text-[#07133B]">Finished deliveries and shared documents</h2>{documents.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{documents.map(document=><article key={document.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-50 text-[#0A4FE8]"><FileText className="h-5 w-5"/></span><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-[#07133B]">{document.title}</h3><p className="mt-1 line-clamp-2 text-xs text-slate-500">{document.description||"Shared by CDS Space"}</p></div></div><div className="mt-3 space-y-2">{document.resources.map(resource=><a key={resource.id} href={resource.url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-[#0A4FE8] hover:bg-blue-50"><span className="truncate">{resource.label}</span><Download className="h-3.5 w-3.5"/></a>)}</div></article>)}</div> : <Empty text="No finished deliveries have been shared yet."/>}</section>
    </>}
    {showCreate && <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/35 p-4"><form onSubmit={createDrive} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-[#07133B]">Create project drive</h2><button type="button" onClick={()=>setShowCreate(false)}><X className="h-5 w-5 text-slate-400"/></button></div><p className="mt-1 text-xs leading-5 text-slate-500">CDS Space admins can see this drive. You retain edit access.</p><label className="mt-5 block text-xs font-medium text-slate-600">Drive name<input name="name" required maxLength={120} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#0A4FE8]"/></label><label className="mt-4 block text-xs font-medium text-slate-600">Description<textarea name="description" rows={3} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-[#0A4FE8]"/></label><button disabled={busy} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] text-sm font-semibold text-white disabled:opacity-60">{busy&&<Loader2 className="h-4 w-4 animate-spin"/>}Create drive</button></form></div>}
    {selected && <div className="fixed inset-0 z-[100] bg-slate-950/35 p-3 sm:grid sm:place-items-center"><section className="flex h-full w-full flex-col overflow-hidden bg-white sm:h-[82vh] sm:max-w-4xl sm:rounded-2xl sm:shadow-xl"><header className="flex items-start justify-between border-b border-slate-100 p-5"><div><h2 className="text-lg font-semibold text-[#07133B]">{selected.drive.name}</h2><p className="mt-1 text-xs text-slate-500">{selected.drive.description||"Shared project workspace"}</p></div><button onClick={()=>setSelected(null)}><X className="h-5 w-5 text-slate-400"/></button></header><div className="flex items-center gap-2 border-b border-slate-100 p-4"><input ref={fileRef} type="file" className="hidden" onChange={event=>{const file=event.target.files?.[0];if(file)upload(file);event.currentTarget.value="";}}/>{selected.drive.access_level==="edit"&&<><button onClick={()=>fileRef.current?.click()} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-xs font-semibold text-white"><Upload className="h-4 w-4"/>Upload file</button><button onClick={()=>void newFolder()} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-700"><FolderOpen className="h-4 w-4"/>New folder</button></>}</div><div className="flex-1 overflow-y-auto p-5">{busy&&<div className="mb-3 flex items-center gap-2 text-xs text-[#0A4FE8]"><Loader2 className="h-4 w-4 animate-spin"/>Updating cDrive…</div>}<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{selected.folders.map(folder=><div key={folder.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"><Folder className="h-5 w-5 text-[#0A4FE8]"/><span className="truncate text-sm font-medium text-[#07133B]">{folder.name}</span></div>)}{selected.files.map(file=><a key={file.id} href={file.url||undefined} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 hover:border-blue-200"><File className="h-5 w-5 shrink-0 text-slate-400"/><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-[#07133B]">{file.file_name}</span><span className="text-[10px] text-slate-400">{Math.max(1,Math.round(Number(file.file_size)/1024))} KB</span></span><Download className="h-4 w-4 text-[#0A4FE8]"/></a>)}</div>{!selected.files.length&&!selected.folders.length&&<Empty text={selected.drive.access_level==="edit"?"This drive is empty. Upload the first file or create a folder.":"This drive is empty."}/>}</div></section></div>}
  </div>;
}

function Empty({text}:{text:string}) { return <div className="grid min-h-40 place-items-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 text-center"><div><FolderOpen className="mx-auto mb-2 h-8 w-8 text-slate-300"/><p className="max-w-md text-sm text-slate-500">{text}</p></div></div>; }
