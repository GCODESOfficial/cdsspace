"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, FileUp, FolderKanban, Loader2, Plus, Users } from "lucide-react";
import { ClientRecipientPicker, type ClientRecipientOption } from "@/components/deliveries/ClientRecipientPicker";

type Client = { id:string; name:string; email:string|null };
type Drive = { id:string; name:string; description:string|null; file_count:number; updated_at:string; clients:Array<{id:string;name:string;email:string|null;accessLevel:"view"|"edit"}> };

export function ProjectDriveManager() {
  const [clients,setClients]=useState<Client[]>([]);
  const [drives,setDrives]=useState<Drive[]>([]);
  const [selectedClients,setSelectedClients]=useState<string[]>([]);
  const [access,setAccess]=useState<"view"|"edit">("view");
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [expanded,setExpanded]=useState<string|null>(null);
  const sectionRef=useRef<HTMLElement|null>(null);
  const chatContextApplied=useRef(false);

  const load=useCallback(async()=>{const response=await fetch("/api/admin/clients/drives",{cache:"no-store"});const payload=await response.json().catch(()=>({}));if(response.ok){setClients(payload.clients||[]);setDrives(payload.drives||[]);}else setNotice(payload.error||"Could not load project drives.");},[]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{
    if(!clients.length||chatContextApplied.current)return;
    const params=new URLSearchParams(window.location.search);
    if(params.get("action")!=="drive")return;
    chatContextApplied.current=true;
    const platformId=params.get("client")||"";
    const email=(params.get("email")||"").trim().toLowerCase();
    const client=clients.find(item=>(platformId&&item.id===platformId)||(email&&item.email?.trim().toLowerCase()===email));
    setOpen(true);
    if(client){setSelectedClients([client.id]);setNotice(`${client.name} is selected. Name the project folder and choose their access.`);}
    else setNotice("The client from chat could not be matched. Choose the client below.");
    window.setTimeout(()=>sectionRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),80);
  },[clients]);
  const options=useMemo<ClientRecipientOption[]>(()=>clients.map(client=>({value:client.id,name:client.name,email:client.email,hasPlatformAccount:true})),[clients]);

  async function create(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget);setBusy(true);setNotice("");const response=await fetch("/api/admin/clients/drives",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:form.get("name"),description:form.get("description"),clientIds:selectedClients,accessLevel:access})});const payload=await response.json().catch(()=>({}));setBusy(false);if(!response.ok)return setNotice(payload.error||"Could not create project drive.");event.currentTarget.reset();setSelectedClients([]);setOpen(false);setNotice("Project drive created and shared.");await load();}
  async function upload(driveId:string,file:File){setBusy(true);const form=new FormData();form.set("action","upload");form.set("file",file);const response=await fetch(`/api/admin/clients/drives/${driveId}`,{method:"POST",body:form});const payload=await response.json().catch(()=>({}));setBusy(false);if(!response.ok)setNotice(payload.error||"Upload failed.");else {setNotice(`${file.name} uploaded.`);await load();}}
  async function changeAccess(driveId:string,clientId:string,accessLevel:"view"|"edit"){setBusy(true);const response=await fetch(`/api/admin/clients/drives/${driveId}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({members:[{clientId,accessLevel}]})});const payload=await response.json().catch(()=>({}));setBusy(false);if(!response.ok)setNotice(payload.error||"Could not update client access.");else {setNotice("Client cDrive access updated.");await load();}}

  return <section ref={sectionRef} className="mb-7 overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
    <button type="button" onClick={()=>setOpen(value=>!value)} className="flex w-full items-center gap-3 p-5 text-left sm:p-6"><span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8]"><FolderKanban className="h-5 w-5"/></span><span className="min-w-0 flex-1"><span className="block text-base font-semibold text-[#07133B]">Project cDrive</span><span className="mt-0.5 block text-xs font-normal text-slate-500">Create a live project folder, select multiple clients, and choose whether they can upload and edit.</span></span><ChevronDown className={`h-5 w-5 text-slate-400 transition ${open?"rotate-180":""}`}/></button>
    {open&&<div className="border-t border-slate-100 p-5 sm:p-6"><form onSubmit={create} className="grid gap-4 lg:grid-cols-2"><label className="text-xs font-medium text-slate-600">Drive name<input required name="name" minLength={2} maxLength={120} placeholder="e.g. Website redesign project" className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#0A4FE8]"/></label><label className="text-xs font-medium text-slate-600">Client access<select value={access} onChange={event=>setAccess(event.target.value as "view"|"edit")} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0A4FE8]"><option value="view">View and download</option><option value="edit">Edit, upload files and create folders</option></select></label><label className="text-xs font-medium text-slate-600 lg:col-span-2">Description<textarea name="description" rows={2} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-[#0A4FE8]"/></label><div className="lg:col-span-2"><div className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-600"><span>Clients</span><span className="font-normal text-slate-400">Search and tick one or more</span></div><ClientRecipientPicker options={options} values={selectedClients} onChange={setSelectedClients}/></div><div className="lg:col-span-2"><button disabled={busy||!selectedClients.length} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Plus className="h-4 w-4"/>}Create and share drive</button></div></form></div>}
    {notice&&<p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-600">{notice}</p>}
    {drives.length>0&&<div className="border-t border-slate-100 p-4 sm:p-5"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{drives.slice(0,9).map(drive=><article key={drive.id} className="rounded-xl border border-slate-200 p-4"><button type="button" onClick={()=>setExpanded(expanded===drive.id?null:drive.id)} className="w-full text-left"><div className="flex items-start justify-between gap-3"><span className="truncate text-sm font-semibold text-[#07133B]">{drive.name}</span><span className="text-[10px] text-slate-400">{drive.file_count} files</span></div><p className="mt-1 truncate text-[11px] text-slate-500">{drive.clients.map(client=>client.name).join(", ")}</p></button>{expanded===drive.id&&<div className="mt-3 border-t border-slate-100 pt-3"><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-[#0A4FE8]"><FileUp className="h-4 w-4"/>Upload file<input type="file" className="hidden" onChange={event=>{const file=event.target.files?.[0];if(file)void upload(drive.id,file);event.currentTarget.value="";}}/></label><div className="mt-3 space-y-2">{drive.clients.map(client=><div key={client.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[10px] text-slate-600"><span className="inline-flex min-w-0 items-center gap-1"><Users className="h-3 w-3 shrink-0"/><span className="truncate">{client.name}</span></span><button type="button" disabled={busy} onClick={()=>void changeAccess(drive.id,client.id,client.accessLevel==="edit"?"view":"edit")} className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 font-semibold text-[#0A4FE8]">{client.accessLevel==="edit"?"Make view only":"Allow editing"}</button></div>)}</div></div>}</article>)}</div></div>}
  </section>;
}
