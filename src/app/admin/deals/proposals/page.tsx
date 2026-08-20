/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, FileImage, FileText, Loader2, Plus, Send } from "lucide-react";

type ProposalContent = {
  executive_summary: string;
  current_state: string;
  opportunity: string;
  proposed_approach: string;
  deliverables: string[];
  market_metrics: Array<{ label: string; value: string; context: string; source_url: string }>;
  expected_impact: string[];
  timeline: string;
  next_step: string;
};
type Proposal = {
  id: string; public_token: string; brand_name: string; title: string; focus_area: string; target_url: string | null;
  recipient_email: string | null; status: string; content: ProposalContent; sources: Array<{ title?: string; url: string; kind?: string }>;
  cover_preview_url?: string | null; updated_at: string;
};
type Editor = { title: string; recipient_email: string; focus_area: string; content: ProposalContent };

const EMPTY_FORM = { brand_name: "", target_url: "", social_url: "", recipient_email: "", focus_area: "", title: "" };

export default function DealProposalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [cover, setCover] = useState<File | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const lastSaved = useRef("");
  const selected = useMemo(() => proposals.find((item) => item.id === selectedId) || null, [proposals, selectedId]);

  const load = async () => {
    const response = await fetch("/api/admin/deals?resource=proposals", { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || "Could not load proposals.");
    setProposals(json.proposals || []);
    setSelectedId((current) => current || json.proposals?.[0]?.id || "");
  };
  useEffect(() => { load().catch((error) => setNotice({ tone: "error", text: error.message })).finally(() => setLoading(false)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected) { setEditor(null); return; }
    const next = { title: selected.title || "", recipient_email: selected.recipient_email || "", focus_area: selected.focus_area || "", content: selected.content };
    setEditor(next);
    lastSaved.current = JSON.stringify(next);
    setSaveState("saved");
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected || !editor) return;
    const signature = JSON.stringify(editor);
    if (signature === lastSaved.current) return;
    setSaveState("saving");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/admin/deals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save_proposal", id: selected.id, ...editor }) });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.error || "Autosave failed.");
        lastSaved.current = signature;
        setSaveState("saved");
        setProposals((items) => items.map((item) => item.id === selected.id ? { ...item, ...json.proposal, cover_preview_url: item.cover_preview_url } : item));
      } catch {
        setSaveState("error");
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [editor, selected]);

  const generate = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("generate"); setNotice(null);
    try {
      let coverData: { storage_path?: string; preview_url?: string } = {};
      if (cover) {
        const data = new FormData(); data.append("file", cover);
        const upload = await fetch("/api/admin/deals/upload", { method: "POST", body: data });
        coverData = await upload.json().catch(() => ({}));
        if (!upload.ok) throw new Error((coverData as any).error || "Cover upload failed.");
      }
      const response = await fetch("/api/admin/deals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate_proposal", ...form, cover_storage_path: coverData.storage_path || "" }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Proposal generation failed.");
      const proposal = { ...json.proposal, cover_preview_url: coverData.preview_url || null } as Proposal;
      setProposals((items) => [proposal, ...items]); setSelectedId(proposal.id); setForm(EMPTY_FORM); setCover(null);
      setNotice({ tone: "success", text: "Proposal generated. Review and edit it before sending." });
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Proposal generation failed." }); }
    finally { setBusy(""); }
  };

  const sendProposal = async () => {
    if (!selected || !editor) return;
    setBusy("send"); setNotice(null);
    try {
      const response = await fetch("/api/admin/deals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send_proposal", id: selected.id, recipient_email: editor.recipient_email }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Proposal could not be sent.");
      setProposals((items) => items.map((item) => item.id === selected.id ? { ...item, status: "sent", recipient_email: editor.recipient_email } : item));
      setNotice({ tone: "success", text: `Proposal sent to ${editor.recipient_email}.` });
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Proposal could not be sent." }); }
    finally { setBusy(""); }
  };

  return (
    <main className="mx-auto max-w-[1600px] p-4 sm:p-7">
      <header className="mb-6"><p className="text-sm font-semibold text-[#0A4FE8]">Deals</p><h1 className="mt-1 text-3xl font-bold text-[#07133B]">Proposals</h1><p className="mt-2 text-sm text-slate-500">Generate from public evidence, refine every section, then share a branded link or portrait PDF.</p></header>
      {notice && <div className={`mb-5 rounded-2xl border p-4 text-sm ${notice.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{notice.text}</div>}

      <form onSubmit={generate} className="mb-6 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-5 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8]"><Plus className="h-5 w-5" /></div><div><h2 className="font-bold text-[#07133B]">Create a proposal</h2><p className="text-xs text-slate-400">Public website or social link is required.</p></div></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Brand name" required value={form.brand_name} onChange={(value) => setForm({ ...form, brand_name: value })} />
          <Field label="Website" type="url" placeholder="https://example.com" value={form.target_url} onChange={(value) => setForm({ ...form, target_url: value })} />
          <Field label="Social media link" type="url" placeholder="https://…" value={form.social_url} onChange={(value) => setForm({ ...form, social_url: value })} />
          <Field label="Recipient email" type="email" value={form.recipient_email} onChange={(value) => setForm({ ...form, recipient_email: value })} />
          <Field label="Proposal title" placeholder="Optional" value={form.title} onChange={(value) => setForm({ ...form, title: value })} />
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">A4 portrait cover</span><span className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm text-slate-500"><FileImage className="h-4 w-4" /><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setCover(event.target.files?.[0] || null)} className="min-w-0 text-xs" /></span></label>
          <label className="md:col-span-2 xl:col-span-3"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Aspect of the business we want to work on</span><textarea required value={form.focus_area} onChange={(event) => setForm({ ...form, focus_area: event.target.value })} rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#0A4FE8]" placeholder="Describe the brand, communication, website, campaign, or identity opportunity." /></label>
        </div>
        <button disabled={busy === "generate"} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white disabled:opacity-60">{busy === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Generate proposal</button>
      </form>

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="h-fit rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm xl:sticky xl:top-5">
          <div className="px-3 pb-3 text-sm font-bold text-[#07133B]">Saved proposals</div>
          {loading ? <div className="grid place-items-center py-12"><Loader2 className="h-5 w-5 animate-spin text-[#0A4FE8]" /></div> : proposals.length === 0 ? <p className="p-4 text-sm text-slate-400">No proposals yet.</p> : <div className="space-y-1.5">{proposals.map((proposal) => <button key={proposal.id} onClick={() => setSelectedId(proposal.id)} className={`w-full rounded-2xl p-3 text-left ${proposal.id === selectedId ? "bg-[#0A4FE8] text-white" : "hover:bg-slate-50"}`}><span className="block truncate text-sm font-semibold">{proposal.brand_name}</span><span className={`mt-1 block truncate text-xs ${proposal.id === selectedId ? "text-blue-100" : "text-slate-400"}`}>{proposal.title}</span></button>)}</div>}
        </aside>

        {selected && editor ? (
          <section className="min-w-0 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6 flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><p className="text-xs font-semibold text-[#0A4FE8]">{selected.brand_name} · {selected.status}</p><h2 className="mt-1 truncate text-xl font-bold text-[#07133B]">{editor.title}</h2><p className={`mt-1 text-xs ${saveState === "error" ? "text-rose-600" : "text-slate-400"}`}>{saveState === "saving" ? "Saving…" : saveState === "error" ? "Autosave failed. Keep this page open and edit again to retry." : "All changes saved"}</p></div>
              <div className="flex flex-wrap gap-2">
                <a href={`/proposal/${selected.public_token}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600"><ExternalLink className="h-4 w-4" /> Preview</a>
                <a href={`/api/admin/deals/proposals/${selected.id}/pdf`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600"><Download className="h-4 w-4" /> PDF</a>
                <button type="button" onClick={sendProposal} disabled={busy === "send"} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-sm font-semibold text-white disabled:opacity-60">{busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send</button>
              </div>
            </div>
            {selected.cover_preview_url && <div className="mb-6 w-32 overflow-hidden rounded-xl border border-slate-200">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={selected.cover_preview_url} alt="Proposal cover" className="aspect-[210/297] w-full object-cover" /></div>}
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Proposal title" value={editor.title} onChange={(value) => setEditor({ ...editor, title: value })} /><Field label="Recipient email" type="email" value={editor.recipient_email} onChange={(value) => setEditor({ ...editor, recipient_email: value })} /></div>
            <div className="mt-4 space-y-4">
              <EditorArea label="Work focus" value={editor.focus_area} onChange={(value) => setEditor({ ...editor, focus_area: value })} />
              {(["executive_summary", "current_state", "opportunity", "proposed_approach", "timeline", "next_step"] as const).map((key) => <EditorArea key={key} label={key.replaceAll("_", " ")} value={editor.content[key]} onChange={(value) => setEditor({ ...editor, content: { ...editor.content, [key]: value } })} />)}
              <EditorArea label="Deliverables (one per line)" value={editor.content.deliverables.join("\n")} onChange={(value) => setEditor({ ...editor, content: { ...editor.content, deliverables: value.split("\n").map((item) => item.trim()).filter(Boolean) } })} />
              <EditorArea label="Expected impact (one per line)" value={editor.content.expected_impact.join("\n")} onChange={(value) => setEditor({ ...editor, content: { ...editor.content, expected_impact: value.split("\n").map((item) => item.trim()).filter(Boolean) } })} />
            </div>
            {selected.sources?.length > 0 && <div className="mt-6 rounded-2xl bg-slate-50 p-4"><h3 className="text-sm font-bold text-[#07133B]">Evidence sources</h3><div className="mt-3 space-y-2">{selected.sources.map((source, index) => <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 truncate text-xs font-medium text-[#0A4FE8] hover:underline"><ExternalLink className="h-3.5 w-3.5 shrink-0" />{source.title || source.url}</a>)}</div></div>}
          </section>
        ) : <section className="grid min-h-80 place-items-center rounded-[24px] border border-dashed border-slate-200 bg-white text-sm text-slate-400">Select or create a proposal.</section>}
      </div>
    </main>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, required }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; required?: boolean }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span><input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#0A4FE8]" /></label>;
}
function EditorArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold capitalize text-slate-600">{label}</span><textarea rows={4} value={value || ""} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-6 outline-none focus:border-[#0A4FE8]" /></label>;
}
