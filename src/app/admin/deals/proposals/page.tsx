/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Download, ExternalLink, Eye, FileImage, FileText, Loader2, Mail, PenLine, Plus, Send, Trash2,
} from "lucide-react";
import ProposalDeckView from "@/components/proposal/ProposalDeck";
import {
  normalizeDeck, PROPOSAL_STAGES, type ProposalDeck, type ProposalStage,
} from "@/lib/proposal-deck";

type Proposal = {
  id: string; public_token: string; brand_name: string; title: string; focus_area: string;
  recipient_email: string | null; status: string; stage: ProposalStage | "archived";
  deck: ProposalDeck; content: any; sources: Array<{ title?: string; url: string; kind?: string }>;
  cover_preview_url?: string | null; deal_value: string | null; expected_close_on: string | null;
  client_note: string | null; view_count: number; send_count: number; last_viewed_at: string | null;
  last_sent_at: string | null; created_at: string; updated_at: string;
};
type ProposalEvent = { id: string; proposal_id: string; event_type: string; actor: string | null; detail: string | null; created_at: string };
type Editor = {
  title: string; recipient_email: string; focus_area: string; deal_value: string;
  expected_close_on: string; client_note: string; deck: ProposalDeck;
};

const EMPTY_FORM = { brand_name: "", target_url: "", social_url: "", recipient_email: "", focus_area: "", title: "" };
const OPEN_STAGES: Array<ProposalStage> = ["draft", "ready", "sent", "viewed", "negotiation", "won", "lost"];
const STAGE_TONE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600", ready: "bg-blue-50 text-[#0A4FE8]", sent: "bg-indigo-50 text-indigo-700",
  viewed: "bg-amber-50 text-amber-700", negotiation: "bg-violet-50 text-violet-700",
  won: "bg-emerald-50 text-emerald-700", lost: "bg-rose-50 text-rose-700", archived: "bg-slate-100 text-slate-500",
};

function money(value: string | null) {
  const amount = Number(value || 0);
  return amount ? amount.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "";
}
function when(value: string | null) {
  return value ? new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
}

export default function DealProposalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [events, setEvents] = useState<ProposalEvent[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [stageFilter, setStageFilter] = useState<"all" | ProposalStage>("all");
  const [tab, setTab] = useState<"edit" | "preview" | "activity">("edit");
  const [form, setForm] = useState(EMPTY_FORM);
  const [cover, setCover] = useState<File | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [sendMessage, setSendMessage] = useState("");
  const [note, setNote] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const lastSaved = useRef("");

  const selected = useMemo(() => proposals.find((item) => item.id === selectedId) || null, [proposals, selectedId]);
  const visible = useMemo(
    () => proposals.filter((item) => (stageFilter === "all" ? item.stage !== "archived" : item.stage === stageFilter)),
    [proposals, stageFilter],
  );
  const funnel = useMemo(() => {
    const counts: Record<string, { total: number; value: number }> = {};
    OPEN_STAGES.forEach((stage) => { counts[stage] = { total: 0, value: 0 }; });
    proposals.forEach((item) => {
      const bucket = counts[item.stage];
      if (bucket) { bucket.total += 1; bucket.value += Number(item.deal_value || 0); }
    });
    return counts;
  }, [proposals]);
  const selectedEvents = useMemo(
    () => events.filter((event) => event.proposal_id === selectedId),
    [events, selectedId],
  );

  const load = async () => {
    const response = await fetch("/api/admin/deals?resource=proposals", { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || "Could not load proposals.");
    setProposals(json.proposals || []);
    setEvents(json.events || []);
    // ?proposal=<id> lets other surfaces (a kickoff booking on the consultation
    // list, for one) link straight to the proposal they are talking about.
    const requested = new URLSearchParams(window.location.search).get("proposal") || "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requestedExists = (json.proposals || []).some((item: any) => item.id === requested);
    setSelectedId((current) => (requestedExists ? requested : current || json.proposals?.[0]?.id || ""));
  };
  useEffect(() => {
    load().catch((error) => setNotice({ tone: "error", text: error.message })).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected) { setEditor(null); return; }
    const next: Editor = {
      title: selected.title || "",
      recipient_email: selected.recipient_email || "",
      focus_area: selected.focus_area || "",
      deal_value: selected.deal_value ? String(Number(selected.deal_value)) : "",
      expected_close_on: selected.expected_close_on ? String(selected.expected_close_on).slice(0, 10) : "",
      client_note: selected.client_note || "",
      deck: normalizeDeck(selected.deck, { brandName: selected.brand_name, focusArea: selected.focus_area, title: selected.title }),
    };
    setEditor(next);
    lastSaved.current = JSON.stringify(next);
    setSaveState("saved");
    setSendMessage("");
    setNote("");
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected || !editor) return;
    const signature = JSON.stringify(editor);
    if (signature === lastSaved.current) return;
    setSaveState("saving");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/admin/deals", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "save_proposal", id: selected.id, ...editor, content: selected.content }),
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.error || "Autosave failed.");
        lastSaved.current = signature;
        setSaveState("saved");
        setProposals((items) => items.map((item) => (item.id === selected.id ? { ...item, ...json.proposal, cover_preview_url: item.cover_preview_url } : item)));
      } catch {
        setSaveState("error");
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [editor, selected]);

  const patchDeck = (patch: Partial<ProposalDeck>) => {
    setEditor((current) => (current ? { ...current, deck: { ...current.deck, ...patch } } : current));
  };

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
      const response = await fetch("/api/admin/deals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_proposal", ...form, cover_storage_path: coverData.storage_path || "" }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Proposal generation failed.");
      const proposal = { ...json.proposal, cover_preview_url: coverData.preview_url || null } as Proposal;
      setProposals((items) => [proposal, ...items]);
      setSelectedId(proposal.id); setForm(EMPTY_FORM); setCover(null); setShowCreate(false); setTab("edit");
      setNotice({ tone: "success", text: "Proposal generated. Review every slide before sending." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Proposal generation failed." });
    } finally { setBusy(""); }
  };

  const post = async (payload: Record<string, unknown>, label: string) => {
    setBusy(label); setNotice(null);
    try {
      const response = await fetch("/api/admin/deals", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Request failed.");
      return json;
    } finally { setBusy(""); }
  };

  const sendProposal = async () => {
    if (!selected || !editor) return;
    try {
      await post({ action: "send_proposal", id: selected.id, recipient_email: editor.recipient_email, message: sendMessage }, "send");
      await load();
      setNotice({ tone: "success", text: `Proposal sent to ${editor.recipient_email}.` });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Proposal could not be sent." });
    }
  };

  // Drafts the email opening line from the deck the client is about to read.
  const draftSendMessage = async () => {
    if (!selected) return;
    try {
      const json = await post({ action: "draft_proposal_message", id: selected.id }, "draft-message");
      if (json.message) setSendMessage(String(json.message));
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Opening line could not be drafted." });
    }
  };

  const setStage = async (stage: string) => {
    if (!selected) return;
    try {
      const json = await post({ action: "set_proposal_stage", id: selected.id, stage }, "stage");
      setProposals((items) => items.map((item) => (item.id === selected.id ? { ...item, ...json.proposal, cover_preview_url: item.cover_preview_url } : item)));
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Stage could not be updated." });
    }
  };

  const addNote = async () => {
    if (!selected || !note.trim()) return;
    try {
      await post({ action: "add_proposal_note", id: selected.id, note }, "note");
      setNote("");
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Note could not be saved." });
    }
  };

  const removeProposal = async () => {
    if (!selected || !window.confirm(`Delete the ${selected.brand_name} proposal permanently?`)) return;
    try {
      await post({ action: "delete_proposal", id: selected.id }, "delete");
      setProposals((items) => items.filter((item) => item.id !== selected.id));
      setSelectedId("");
      setNotice({ tone: "success", text: "Proposal deleted." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Proposal could not be deleted." });
    }
  };

  return (
    <main className="mx-auto max-w-[1600px] p-4 sm:p-7">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#0A4FE8]">Deals</p>
          <h1 className="mt-1 text-3xl font-bold text-[#07133B]">Proposals</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">Nine landscape slides, editable end to end, sent straight to the client and tracked through the funnel.</p>
        </div>
        <button onClick={() => setShowCreate((value) => !value)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white">
          <Plus className="h-4 w-4" /> New proposal
        </button>
      </header>

      {notice && <div className={`mb-5 rounded-2xl border p-4 text-sm ${notice.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{notice.text}</div>}

      <section className="mb-6 grid gap-2 sm:grid-cols-4 xl:grid-cols-7">
        <StageCard label="All open" total={proposals.filter((item) => item.stage !== "archived").length} value={0} active={stageFilter === "all"} onClick={() => setStageFilter("all")} />
        {OPEN_STAGES.slice(1).map((stage) => (
          <StageCard
            key={stage}
            label={PROPOSAL_STAGES.find((entry) => entry.key === stage)?.label || stage}
            total={funnel[stage]?.total || 0}
            value={funnel[stage]?.value || 0}
            active={stageFilter === stage}
            onClick={() => setStageFilter(stage)}
          />
        ))}
      </section>

      {showCreate && (
        <form onSubmit={generate} className="mb-6 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8]"><Plus className="h-5 w-5" /></div>
            <div><h2 className="font-bold text-[#07133B]">Create a proposal</h2><p className="text-xs text-slate-400">Public website or social link is required.</p></div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Brand name" required value={form.brand_name} onChange={(value) => setForm({ ...form, brand_name: value })} />
            <Field label="Website" type="url" placeholder="https://example.com" value={form.target_url} onChange={(value) => setForm({ ...form, target_url: value })} />
            <Field label="Social media link" type="url" placeholder="https://…" value={form.social_url} onChange={(value) => setForm({ ...form, social_url: value })} />
            <Field label="Recipient email" type="email" value={form.recipient_email} onChange={(value) => setForm({ ...form, recipient_email: value })} />
            <Field label="Proposal title" placeholder="Optional" value={form.title} onChange={(value) => setForm({ ...form, title: value })} />
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Custom cover image (16:9)</span>
              <span className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm text-slate-500">
                <FileImage className="h-4 w-4" />
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setCover(event.target.files?.[0] || null)} className="min-w-0 text-xs" />
              </span>
            </label>
            <label className="md:col-span-2 xl:col-span-3">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Aspect of the business we want to work on</span>
              <textarea required value={form.focus_area} onChange={(event) => setForm({ ...form, focus_area: event.target.value })} rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#0A4FE8]" placeholder="Describe the brand, communication, website, campaign, or identity opportunity." />
            </label>
          </div>
          <button disabled={busy === "generate"} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white disabled:opacity-60">
            {busy === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Generate proposal
          </button>
        </form>
      )}

      <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="h-fit rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm xl:sticky xl:top-5">
          <div className="px-3 pb-3 text-sm font-bold text-[#07133B]">{stageFilter === "all" ? "All proposals" : `${PROPOSAL_STAGES.find((entry) => entry.key === stageFilter)?.label} proposals`}</div>
          {loading ? (
            <div className="grid place-items-center py-12"><Loader2 className="h-5 w-5 animate-spin text-[#0A4FE8]" /></div>
          ) : visible.length === 0 ? (
            <p className="p-4 text-sm text-slate-400">Nothing in this stage yet.</p>
          ) : (
            <div className="max-h-[70vh] space-y-1.5 overflow-y-auto">
              {visible.map((proposal) => (
                <button key={proposal.id} onClick={() => setSelectedId(proposal.id)} className={`w-full rounded-2xl p-3 text-left ${proposal.id === selectedId ? "bg-[#0A4FE8] text-white" : "hover:bg-slate-50"}`}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{proposal.brand_name}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${proposal.id === selectedId ? "bg-white/20 text-white" : STAGE_TONE[proposal.stage]}`}>{proposal.stage}</span>
                  </span>
                  <span className={`mt-1 block truncate text-xs ${proposal.id === selectedId ? "text-blue-100" : "text-slate-400"}`}>{proposal.title}</span>
                  <span className={`mt-1 flex gap-3 text-[11px] ${proposal.id === selectedId ? "text-blue-100" : "text-slate-400"}`}>
                    <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />{proposal.view_count || 0}</span>
                    <span className="inline-flex items-center gap-1"><Send className="h-3 w-3" />{proposal.send_count || 0}</span>
                    {proposal.deal_value ? <span>{money(proposal.deal_value)}</span> : null}
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>

        {selected && editor ? (
          <section className="min-w-0 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6 flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#0A4FE8]">{selected.brand_name}</p>
                <h2 className="mt-1 truncate text-xl font-bold text-[#07133B]">{editor.title}</h2>
                <p className={`mt-1 text-xs ${saveState === "error" ? "text-rose-600" : "text-slate-400"}`}>
                  {saveState === "saving" ? "Saving…" : saveState === "error" ? "Autosave failed. Edit again to retry." : "All changes saved"}
                  {selected.last_viewed_at ? ` · last opened ${when(selected.last_viewed_at)}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select value={selected.stage} onChange={(event) => setStage(event.target.value)} disabled={busy === "stage"} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-[#07133B]">
                  {PROPOSAL_STAGES.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}
                  <option value="archived">Archived</option>
                </select>
                <Link href={`/proposal/${selected.public_token}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600"><ExternalLink className="h-4 w-4" /> Link</Link>
                <a href={`/api/admin/deals/proposals/${selected.id}/pdf`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600"><Download className="h-4 w-4" /> PDF</a>
                <button type="button" onClick={removeProposal} className="inline-flex h-10 items-center gap-2 rounded-xl border border-rose-200 px-3 text-sm font-semibold text-rose-600"><Trash2 className="h-4 w-4" /> Delete</button>
              </div>
            </div>

            <div className="mb-5 flex gap-2">
              {(["edit", "preview", "activity"] as const).map((key) => (
                <button key={key} onClick={() => setTab(key)} className={`h-9 rounded-xl px-4 text-sm font-semibold capitalize ${tab === key ? "bg-[#0A4FE8] text-white" : "bg-slate-100 text-slate-600"}`}>{key}</button>
              ))}
            </div>

            {tab === "edit" && (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Field label="Proposal title" value={editor.title} onChange={(value) => setEditor({ ...editor, title: value })} />
                  <Field label="Recipient email" type="email" value={editor.recipient_email} onChange={(value) => setEditor({ ...editor, recipient_email: value })} />
                  <Field label="Deal value" type="number" value={editor.deal_value} onChange={(value) => setEditor({ ...editor, deal_value: value })} />
                  <Field label="Expected close" type="date" value={editor.expected_close_on} onChange={(value) => setEditor({ ...editor, expected_close_on: value })} />
                </div>

                <Panel title="1 · Title slide">
                  <Field label="Deck title" value={editor.deck.cover.title} onChange={(value) => patchDeck({ cover: { ...editor.deck.cover, title: value } })} />
                  <Field label="Subtitle" value={editor.deck.cover.subtitle} onChange={(value) => patchDeck({ cover: { ...editor.deck.cover, subtitle: value } })} />
                  <Field label="Prepared for" value={editor.deck.cover.prepared_for} onChange={(value) => patchDeck({ cover: { ...editor.deck.cover, prepared_for: value } })} />
                </Panel>

                <Panel title="2 · Who we are">
                  <Field label="Heading" value={editor.deck.who_we_are.heading} onChange={(value) => patchDeck({ who_we_are: { ...editor.deck.who_we_are, heading: value } })} />
                  <Area label="Paragraphs (one per line)" rows={5} value={editor.deck.who_we_are.body.join("\n")} onChange={(value) => patchDeck({ who_we_are: { ...editor.deck.who_we_are, body: value.split("\n").map((item) => item.trim()).filter(Boolean) } })} />
                </Panel>

                <Panel title="3 · The big picture">
                  <Field label="Heading" value={editor.deck.big_picture.heading} onChange={(value) => patchDeck({ big_picture: { ...editor.deck.big_picture, heading: value } })} />
                  <Area label="Intro" value={editor.deck.big_picture.intro} onChange={(value) => patchDeck({ big_picture: { ...editor.deck.big_picture, intro: value } })} />
                  <Points label="Desired outcomes" items={editor.deck.big_picture.outcomes} max={4} onChange={(outcomes) => patchDeck({ big_picture: { ...editor.deck.big_picture, outcomes } })} />
                </Panel>

                <Panel title="4 · Rewind">
                  <Field label="Heading" value={editor.deck.rewind.heading} onChange={(value) => patchDeck({ rewind: { ...editor.deck.rewind, heading: value } })} />
                  <Area label="Intro" value={editor.deck.rewind.intro} onChange={(value) => patchDeck({ rewind: { ...editor.deck.rewind, intro: value } })} />
                  <Area label="Problems (one per line)" rows={5} value={editor.deck.rewind.problems.join("\n")} onChange={(value) => patchDeck({ rewind: { ...editor.deck.rewind, problems: value.split("\n").map((item) => item.trim()).filter(Boolean) } })} />
                </Panel>

                <Panel title="5 · The opportunities">
                  <Field label="Heading" value={editor.deck.opportunities.heading} onChange={(value) => patchDeck({ opportunities: { ...editor.deck.opportunities, heading: value } })} />
                  <Area label="Intro" value={editor.deck.opportunities.intro} onChange={(value) => patchDeck({ opportunities: { ...editor.deck.opportunities, intro: value } })} />
                  <Points
                    label="Opportunities"
                    items={editor.deck.opportunities.items}
                    max={4}
                    withValue
                    onChange={(items) => patchDeck({ opportunities: { ...editor.deck.opportunities, items: items as any } })}
                  />
                </Panel>

                <Panel title="6 · Our process">
                  <p className="text-xs text-slate-400">The five stages, the problem column, and the payoff column are fixed CDS Space material and render exactly as approved. Only the framing below is editable.</p>
                  <Field label="Heading" value={editor.deck.process.heading} onChange={(value) => patchDeck({ process: { ...editor.deck.process, heading: value } })} />
                  <Field label="Intro" value={editor.deck.process.intro} onChange={(value) => patchDeck({ process: { ...editor.deck.process, intro: value } })} />
                  <Area label="Duration note" value={editor.deck.process.duration_note} onChange={(value) => patchDeck({ process: { ...editor.deck.process, duration_note: value } })} />
                </Panel>

                <Panel title="7 · The payoff">
                  <Field label="Heading" value={editor.deck.payoff.heading} onChange={(value) => patchDeck({ payoff: { ...editor.deck.payoff, heading: value } })} />
                  <Area label="Intro" value={editor.deck.payoff.intro} onChange={(value) => patchDeck({ payoff: { ...editor.deck.payoff, intro: value } })} />
                  <Area label="Payoff items (one per line, up to eight)" rows={8} value={editor.deck.payoff.items.join("\n")} onChange={(value) => patchDeck({ payoff: { ...editor.deck.payoff, items: value.split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 8) } })} />
                </Panel>

                <Panel title="8 · Kickoff">
                  <Field label="Heading" value={editor.deck.kickoff.heading} onChange={(value) => patchDeck({ kickoff: { ...editor.deck.kickoff, heading: value } })} />
                  <Area label="Intro" value={editor.deck.kickoff.intro} onChange={(value) => patchDeck({ kickoff: { ...editor.deck.kickoff, intro: value } })} />
                  <Points label="Five steps" items={editor.deck.kickoff.steps} max={5} onChange={(steps) => patchDeck({ kickoff: { ...editor.deck.kickoff, steps } })} />
                </Panel>

                <Panel title="9 · Call to action">
                  <Field label="Heading" value={editor.deck.cta.heading} onChange={(value) => patchDeck({ cta: { ...editor.deck.cta, heading: value } })} />
                  <Area label="Body" value={editor.deck.cta.body} onChange={(value) => patchDeck({ cta: { ...editor.deck.cta, body: value } })} />
                  <Field label="Button label" value={editor.deck.cta.primary_label} onChange={(value) => patchDeck({ cta: { ...editor.deck.cta, primary_label: value } })} />
                  <p className="text-xs text-slate-400">Every proposal points at {editor.deck.cta.primary_url} and {editor.deck.cta.email}.</p>
                </Panel>

                <Panel title="Internal note">
                  <Area label="Only your team sees this" value={editor.client_note} onChange={(value) => setEditor({ ...editor, client_note: value })} />
                </Panel>

                <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-[#07133B]"><Mail className="h-4 w-4 text-[#0A4FE8]" /> Send to the client</h3>
                  <p className="mt-1 text-xs text-slate-500">The email carries the branded link and the PDF download. Sending moves the proposal to Sent.</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <input type="email" value={editor.recipient_email} onChange={(event) => setEditor({ ...editor, recipient_email: event.target.value })} placeholder="client@company.com" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#0A4FE8]" />
                    <button type="button" onClick={sendProposal} disabled={busy === "send" || !editor.recipient_email} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white disabled:opacity-60">
                      {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send proposal
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-500">Opening line for the email</span>
                    <button
                      type="button"
                      onClick={draftSendMessage}
                      disabled={busy === "draft-message"}
                      title="Draft an opening line from this proposal"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#0A4FE8] hover:bg-blue-50 disabled:opacity-60"
                    >
                      {busy === "draft-message" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />}
                      {sendMessage ? "Rewrite with AI" : "Write with AI"}
                    </button>
                  </div>
                  <textarea value={sendMessage} onChange={(event) => setSendMessage(event.target.value)} rows={3} placeholder="Optional opening line for the email. Leave empty to use the big picture intro." className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#0A4FE8]" />
                </div>
              </div>
            )}

            {tab === "preview" && (
              <div className="rounded-2xl bg-[#EEF3FC] p-3 sm:p-5">
                <ProposalDeckView deck={editor.deck} brandName={selected.brand_name} createdAt={selected.created_at} coverUrl={selected.cover_preview_url || null} />
              </div>
            )}

            {tab === "activity" && (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-4">
                  <Metric label="Sends" value={selected.send_count || 0} />
                  <Metric label="Views" value={selected.view_count || 0} />
                  <Metric label="Last sent" value={when(selected.last_sent_at) || "Not sent"} small />
                  <Metric label="Last opened" value={when(selected.last_viewed_at) || "Not opened"} small />
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <h3 className="text-sm font-bold text-[#07133B]">Add a note</h3>
                  <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#0A4FE8]" placeholder="Call summary, objection, next step…" />
                  <button type="button" onClick={addNote} disabled={busy === "note" || !note.trim()} className="mt-2 inline-flex h-10 items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-sm font-semibold text-white disabled:opacity-60">Save note</button>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <h3 className="text-sm font-bold text-[#07133B]">Timeline</h3>
                  {selectedEvents.length === 0 ? <p className="mt-3 text-sm text-slate-400">No activity recorded yet.</p> : (
                    <ol className="mt-3 space-y-3">
                      {selectedEvents.map((event) => (
                        <li key={event.id} className="flex gap-3 text-sm">
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#0A4FE8]" />
                          <span className="min-w-0">
                            <strong className="capitalize text-[#07133B]">{event.event_type.replace("_", " ")}</strong>
                            {event.detail ? <span className="text-slate-600"> · {event.detail}</span> : null}
                            <span className="block text-xs text-slate-400">{when(event.created_at)}{event.actor ? ` · ${event.actor}` : ""}</span>
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
                {selected.sources?.length > 0 && (
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <h3 className="text-sm font-bold text-[#07133B]">Evidence sources</h3>
                    <div className="mt-3 space-y-2">
                      {selected.sources.map((source, index) => (
                        <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 truncate text-xs font-medium text-[#0A4FE8] hover:underline">
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />{source.title || source.url}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        ) : (
          <section className="grid min-h-80 place-items-center rounded-[24px] border border-dashed border-slate-200 bg-white text-sm text-slate-400">Select or create a proposal.</section>
        )}
      </div>
    </main>
  );
}

function StageCard({ label, total, value, active, onClick }: { label: string; total: number; value: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`rounded-2xl border p-3 text-left transition ${active ? "border-[#0A4FE8] bg-blue-50" : "border-slate-200 bg-white hover:border-blue-200"}`}>
      <span className="block text-xs font-semibold text-slate-500">{label}</span>
      <span className="mt-1 block text-2xl font-bold text-[#07133B]">{total}</span>
      {value ? <span className="block text-[11px] text-slate-400">{money(String(value))}</span> : null}
    </button>
  );
}

function Metric({ label, value, small }: { label: string; value: string | number; small?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <span className="block text-xs font-semibold text-slate-500">{label}</span>
      <span className={`mt-1 block font-bold text-[#07133B] ${small ? "text-sm" : "text-2xl"}`}>{value}</span>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open className="rounded-2xl border border-slate-200 p-4">
      <summary className="cursor-pointer text-sm font-bold text-[#07133B]">{title}</summary>
      <div className="mt-4 space-y-3">{children}</div>
    </details>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, required }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      <input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#0A4FE8]" />
    </label>
  );
}

function Area({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      <textarea rows={rows} value={value || ""} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-6 outline-none focus:border-[#0A4FE8]" />
    </label>
  );
}

type PointItem = { title: string; detail: string; value?: string };
function Points({ label, items, onChange, max, withValue }: { label: string; items: PointItem[]; onChange: (items: PointItem[]) => void; max: number; withValue?: boolean }) {
  const update = (index: number, patch: Partial<PointItem>) => onChange(items.map((item, position) => (position === index ? { ...item, ...patch } : item)));
  return (
    <div>
      <span className="mb-2 block text-xs font-semibold text-slate-600">{label}</span>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-2">
              <input value={item.title} onChange={(event) => update(index, { title: event.target.value })} placeholder="Title" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-[#0A4FE8]" />
              <button type="button" onClick={() => onChange(items.filter((_, position) => position !== index))} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
            </div>
            <textarea rows={2} value={item.detail} onChange={(event) => update(index, { detail: event.target.value })} placeholder="Detail" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0A4FE8]" />
            {withValue && <input value={item.value || ""} onChange={(event) => update(index, { value: event.target.value })} placeholder="Outcome label, for example: shorter sales cycle" className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0A4FE8]" />}
          </div>
        ))}
      </div>
      {items.length < max && (
        <button type="button" onClick={() => onChange([...items, { title: "", detail: "", ...(withValue ? { value: "" } : {}) }])} className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600">
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      )}
    </div>
  );
}
