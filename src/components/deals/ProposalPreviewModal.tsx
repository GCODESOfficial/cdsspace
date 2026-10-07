"use client";

/**
 * The step before a proposal is written: everything it will be built from is
 * shown here first, and any of it can be corrected. Nothing is generated until
 * "Generate proposal" is pressed.
 */

import { useEffect, useState } from "react";
import { FileText, Loader2, X } from "lucide-react";

type Seed = {
  brand_name: string;
  target_url: string;
  social_url: string;
  recipient_email: string;
  focus_area: string;
  focus_max: number;
};

export function ProposalPreviewModal({ source, label, onClose, onGenerated }: {
  /** Where the proposal is raised from, e.g. { company_id } or { from_prospect_id }. */
  source: Record<string, string>;
  label: string;
  onClose: () => void;
  onGenerated: (proposalId: string) => void;
}) {
  const [seed, setSeed] = useState<Seed | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/admin/deals", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "preview_proposal", ...source }),
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.ok) throw new Error(json.error || "The proposal details could not be prepared.");
        if (!cancelled) setSeed(json.seed);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "The proposal details could not be prepared.");
      }
    })();
    return () => { cancelled = true; };
  }, [source]);

  const generate = async () => {
    if (!seed) return;
    if (!seed.brand_name.trim() || !seed.focus_area.trim() || (!seed.target_url.trim() && !seed.social_url.trim())) {
      setError("A brand name, a focus, and a website or social link are needed.");
      return;
    }
    setGenerating(true); setError("");
    try {
      const response = await fetch("/api/admin/deals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate_proposal",
          ...source,
          brand_name: seed.brand_name,
          target_url: seed.target_url,
          social_url: seed.social_url,
          recipient_email: seed.recipient_email,
          focus_area: seed.focus_area,
          ...(title.trim() ? { title: title.trim() } : {}),
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "The proposal could not be generated.");
      const id = typeof json.proposal?.id === "string" ? json.proposal.id : "";
      if (!id) throw new Error("The proposal finished without an ID.");
      onGenerated(id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The proposal could not be generated.");
      setGenerating(false);
    }
  };

  const set = (key: keyof Seed, value: string) => setSeed((current) => current ? { ...current, [key]: value } : current);
  const input = "h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#0A4FE8] disabled:bg-slate-50";

  return (
    <div className="layer-modal-top fixed inset-0 flex items-end justify-center bg-[#07133B]/60 p-3 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(event) => { if (event.currentTarget === event.target && !generating) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="proposal-preview-title" className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(7,19,59,0.28)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-7">
          <div>
            <h2 id="proposal-preview-title" className="text-lg font-bold text-[#07133B]">Proposal for {label}</h2>
            <p className="mt-1 text-xs text-slate-500">Check what the proposal will be written from and correct anything before it is generated.</p>
          </div>
          <button type="button" onClick={onClose} disabled={generating} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"><X className="h-5 w-5" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          {!seed && !error && <p className="inline-flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Gathering the details</p>}
          {seed && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">Brand name</span><input value={seed.brand_name} onChange={(event) => set("brand_name", event.target.value)} disabled={generating} className={input} /></label>
              <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">Proposal title <span className="font-normal text-slate-400">(optional)</span></span><input value={title} onChange={(event) => setTitle(event.target.value)} disabled={generating} placeholder="Written for you if left blank" className={input} /></label>
              <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">Website</span><input type="url" value={seed.target_url} onChange={(event) => set("target_url", event.target.value)} disabled={generating} placeholder="https://" className={input} /></label>
              <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">Social link</span><input type="url" value={seed.social_url} onChange={(event) => set("social_url", event.target.value)} disabled={generating} placeholder="https://" className={input} /></label>
              <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Send to</span><input type="email" value={seed.recipient_email} onChange={(event) => set("recipient_email", event.target.value)} disabled={generating} placeholder="Recipient email (optional)" className={input} /></label>
              <label className="sm:col-span-2">
                <span className="mb-1.5 flex items-baseline justify-between gap-2 text-xs font-semibold text-slate-600">
                  What the proposal argues
                  <span className={`font-normal ${seed.focus_area.length > seed.focus_max ? "text-rose-600" : "text-slate-400"}`}>{seed.focus_area.length.toLocaleString()} / {seed.focus_max.toLocaleString()}</span>
                </span>
                <span className="mb-1.5 block text-xs text-slate-400">Drawn from the research and your notes. Remove anything misleading and add what you know.</span>
                <textarea rows={12} value={seed.focus_area} onChange={(event) => set("focus_area", event.target.value)} disabled={generating} maxLength={seed.focus_max} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-6 outline-none focus:border-[#0A4FE8] disabled:bg-slate-50" />
              </label>
              <p className="text-xs text-slate-400 sm:col-span-2">When you generate, the public website is also read again and market sources are searched, so the proposal reflects the site as it is today.</p>
            </div>
          )}
          {error && <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-7">
          <button type="button" onClick={onClose} disabled={generating} className="min-h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-600 hover:border-slate-300 disabled:opacity-40">Cancel</button>
          <button type="button" onClick={generate} disabled={!seed || generating} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white disabled:opacity-60">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {generating ? "Writing the proposal..." : "Generate proposal"}
          </button>
        </div>
      </div>
    </div>
  );
}
