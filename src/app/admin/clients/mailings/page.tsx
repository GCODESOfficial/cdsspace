"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  CalendarClock,
  Clock3,
  Image as ImageIcon,
  Loader2,
  Mail,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { appAlert, appConfirm } from "@/lib/app-notify";

type ClientOption = {
  id: string;
  name: string;
  brand_name: string | null;
  email: string;
  status: string;
  source: "manual" | "platform";
  has_platform_account: boolean;
  platform_user_id?: string | null;
};

type CampaignHistory = {
  id: string;
  subject: string;
  status: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  created_by: string;
  scheduled_for: string | null;
  sent_at: string | null;
  updated_at: string;
};

type DraftPayload = {
  id: string;
  subject: string;
  body_text: string;
  recipient_selection?: {
    all_clients?: boolean;
    selected_client_ids?: string[];
    custom_emails?: string[];
    pending_client?: {
      name?: string;
      brand_name?: string;
      email?: string;
    };
  };
  cover_storage_path: string | null;
  cover_file_name: string | null;
  cover_mime_type: string | null;
  scheduled_for: string | null;
  status: string;
  preview_url?: string | null;
};

function emailTokens(value: string) {
  return Array.from(new Set(value.split(/[\s,;]+/).map((item) => item.trim().toLowerCase()).filter(Boolean)));
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function formatDate(value: string | null) {
  if (!value) return "Not sent";
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Lagos",
  });
}

function localDateTimeValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + 60 * 60_000).toISOString().slice(0, 16);
}

function localDateTimeIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour - 1, minute));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function earliestScheduleValue() {
  return localDateTimeValue(new Date(Date.now() + 2 * 60_000).toISOString());
}

export default function ClientMailingsPage() {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignHistory[]>([]);
  const [scheduledCampaigns, setScheduledCampaigns] = useState<CampaignHistory[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [editingScheduled, setEditingScheduled] = useState(false);
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [allClients, setAllClients] = useState(false);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [customEmailText, setCustomEmailText] = useState("");
  const [search, setSearch] = useState("");
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [coverName, setCoverName] = useState<string | null>(null);
  const [coverMime, setCoverMime] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [scheduleAt, setScheduleAt] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [uploading, setUploading] = useState(false);
  const [aiBusy, setAiBusy] = useState<"rewrite" | "improve" | null>(null);
  const [sending, setSending] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showAddClient, setShowAddClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientBrand, setNewClientBrand] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [addingClient, setAddingClient] = useState(false);
  const loadedRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatContextApplied = useRef(false);

  const applyCampaignToComposer = useCallback((draft: DraftPayload) => {
    setDraftId(draft.id);
    setEditingScheduled(draft.status === "scheduled");
    setSubject(draft.subject || "");
    setBodyText(draft.body_text || "");
    setAllClients(Boolean(draft.recipient_selection?.all_clients));
    setSelectedClientIds(draft.recipient_selection?.selected_client_ids || []);
    setCustomEmailText((draft.recipient_selection?.custom_emails || []).join("\n"));
    setNewClientName(draft.recipient_selection?.pending_client?.name || "");
    setNewClientBrand(draft.recipient_selection?.pending_client?.brand_name || "");
    setNewClientEmail(draft.recipient_selection?.pending_client?.email || "");
    setShowAddClient(Boolean(
      draft.recipient_selection?.pending_client?.name
      || draft.recipient_selection?.pending_client?.brand_name
      || draft.recipient_selection?.pending_client?.email
    ));
    setCoverPath(draft.cover_storage_path || null);
    setCoverName(draft.cover_file_name || null);
    setCoverMime(draft.cover_mime_type || null);
    setCoverPreview(draft.preview_url || null);
    setScheduleAt(localDateTimeValue(draft.scheduled_for));
    setSaveStatus("saved");
  }, []);

  const resetComposer = useCallback(() => {
    loadedRef.current = false;
    setDraftId(null);
    setEditingScheduled(false);
    setSubject("");
    setBodyText("");
    setAllClients(false);
    setSelectedClientIds([]);
    setCustomEmailText("");
    setCoverPath(null);
    setCoverName(null);
    setCoverMime(null);
    setCoverPreview(null);
    setScheduleAt("");
    setNewClientName("");
    setNewClientBrand("");
    setNewClientEmail("");
    setShowAddClient(false);
    setSaveStatus("idle");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/clients/mailings", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load client mailings.");
      setClients(payload.clients || []);
      setCampaigns(payload.campaigns || []);
      setScheduledCampaigns(payload.scheduled_campaigns || []);
      const draft = payload.draft as DraftPayload | null;
      if (draft) applyCampaignToComposer(draft);
      loadedRef.current = true;
    } catch (error) {
      await appAlert({ title: "Client mailings", message: error instanceof Error ? error.message : "Could not load mailings.", kind: "error" });
    } finally {
      setLoading(false);
    }
  }, [applyCampaignToComposer]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!clients.length || chatContextApplied.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("action") !== "compose") return;
    chatContextApplied.current = true;
    const platformId = params.get("client") || "";
    const email = (params.get("email") || "").trim().toLowerCase();
    const client = clients.find((candidate) =>
      (platformId && candidate.platform_user_id === platformId)
      || (email && candidate.email.trim().toLowerCase() === email),
    );
    if (!client) return;
    setAllClients(false);
    setSelectedClientIds((current) => Array.from(new Set([...current, client.id])));
    setSearch(client.name);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [clients]);

  const customTokens = useMemo(() => emailTokens(customEmailText), [customEmailText]);
  const validCustomEmails = useMemo(() => customTokens.filter(isEmail), [customTokens]);
  const invalidCustomEmails = useMemo(() => customTokens.filter((email) => !isEmail(email)), [customTokens]);
  const selectedSet = useMemo(() => new Set(selectedClientIds), [selectedClientIds]);
  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return clients;
    return clients.filter((client) => [client.name, client.brand_name, client.email].some((value) => String(value || "").toLowerCase().includes(query)));
  }, [clients, search]);
  const recipientCount = useMemo(() => {
    const emails = new Set<string>();
    for (const client of clients) {
      if (allClients || selectedSet.has(client.id)) emails.add(client.email.toLowerCase());
    }
    validCustomEmails.forEach((email) => emails.add(email));
    return emails.size;
  }, [allClients, clients, selectedSet, validCustomEmails]);

  const saveDraft = useCallback(async () => {
    setSaveStatus("saving");
    try {
      const response = await fetch("/api/admin/clients/mailings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cds-silent": "1",
        },
        body: JSON.stringify({
          action: "save_draft",
          campaign_id: draftId,
          subject,
          body_text: bodyText,
          recipient_selection: {
            all_clients: allClients,
            selected_client_ids: selectedClientIds,
            custom_emails: validCustomEmails,
            pending_client: {
              name: newClientName,
              brand_name: newClientBrand,
              email: newClientEmail,
            },
          },
          cover_storage_path: coverPath,
          cover_file_name: coverName,
          cover_mime_type: coverMime,
          scheduled_for: editingScheduled ? undefined : localDateTimeIso(scheduleAt),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Draft could not be saved.");
      setDraftId(payload.campaign.id);
      setSaveStatus("saved");
      return payload.campaign.id as string;
    } catch (error) {
      setSaveStatus("error");
      throw error;
    }
  }, [allClients, bodyText, coverMime, coverName, coverPath, draftId, editingScheduled, newClientBrand, newClientEmail, newClientName, scheduleAt, selectedClientIds, subject, validCustomEmails]);

  useEffect(() => {
    if (!loadedRef.current || loading || sending || scheduling || uploading || aiBusy) return;
    if (!subject.trim() && !bodyText.trim() && !recipientCount && !coverPath && !newClientName.trim() && !newClientBrand.trim() && !newClientEmail.trim()) return;
    const timer = window.setTimeout(() => { void saveDraft().catch(() => undefined); }, 900);
    return () => window.clearTimeout(timer);
  }, [aiBusy, bodyText, coverPath, loading, newClientBrand, newClientEmail, newClientName, recipientCount, saveDraft, scheduling, sending, subject, uploading]);

  function toggleClient(id: string) {
    setSelectedClientIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function uploadCover(file: File | null) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      await appAlert({ title: "Image", message: "Cover and advert images must be 8MB or smaller.", kind: "error" });
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/admin/clients/mailings/upload", { method: "POST", body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Image upload failed.");
      setCoverPath(payload.storage_path);
      setCoverName(payload.file_name);
      setCoverMime(payload.mime_type);
      setCoverPreview(payload.preview_url);
    } catch (error) {
      await appAlert({ title: "Image", message: error instanceof Error ? error.message : "Image upload failed.", kind: "error" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function rewrite(mode: "rewrite" | "improve") {
    if (!bodyText.trim()) return appAlert({ title: "Email", message: "Write the email before using rewrite.", kind: "error" });
    setAiBusy(mode);
    try {
      const response = await fetch("/api/admin/clients/mailings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rewrite", mode, subject, body_text: bodyText }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Rewrite failed.");
      setBodyText(payload.result);
    } catch (error) {
      await appAlert({ title: "Email rewrite", message: error instanceof Error ? error.message : "Rewrite failed.", kind: "error" });
    } finally {
      setAiBusy(null);
    }
  }

  function validateCampaign() {
    if (newClientName.trim() || newClientBrand.trim() || newClientEmail.trim()) return "Finish adding the new client, or clear the unfinished client form, before continuing.";
    if (invalidCustomEmails.length) return `Correct these email addresses: ${invalidCustomEmails.slice(0, 4).join(", ")}.`;
    if (!recipientCount) return "Choose at least one client or enter a new email address.";
    if (subject.trim().length < 3) return "Add an email subject.";
    if (bodyText.trim().length < 10) return "Write the email message.";
    return null;
  }

  async function addClientWithoutAccount() {
    const email = newClientEmail.trim().toLowerCase();
    if (!newClientName.trim()) return appAlert({ title: "Client", message: "Add the client's name.", kind: "error" });
    if (!isEmail(email)) return appAlert({ title: "Client", message: "Enter a valid client email address.", kind: "error" });
    setAddingClient(true);
    try {
      const response = await fetch("/api/admin/clients/mailings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_client",
          name: newClientName.trim(),
          brand_name: newClientBrand.trim() || null,
          email,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Client could not be added.");

      const listResponse = await fetch("/api/admin/clients/mailings", { cache: "no-store" });
      const listPayload = await listResponse.json().catch(() => ({}));
      if (listResponse.ok && listPayload.ok) {
        setClients(listPayload.clients || []);
        setCampaigns(listPayload.campaigns || []);
        setScheduledCampaigns(listPayload.scheduled_campaigns || []);
      } else {
        setClients((current) => [...current, {
          id: payload.id,
          name: newClientName.trim(),
          brand_name: newClientBrand.trim() || null,
          email,
          status: "lead",
          source: "manual",
          has_platform_account: false,
        }]);
      }
      setSelectedClientIds((current) => Array.from(new Set([...current, payload.id])));
      setNewClientName("");
      setNewClientBrand("");
      setNewClientEmail("");
      setShowAddClient(false);
      await appAlert({ title: "Client added", message: "The client was added as a lead and selected for this mailing.", kind: "success" });
    } catch (error) {
      await appAlert({ title: "Client", message: error instanceof Error ? error.message : "Client could not be added.", kind: "error" });
    } finally {
      setAddingClient(false);
    }
  }

  async function scheduleCampaign() {
    const validationError = validateCampaign();
    if (validationError) return appAlert({ title: "Schedule mailing", message: validationError, kind: "error" });
    const scheduledIso = localDateTimeIso(scheduleAt);
    if (!scheduledIso || new Date(scheduledIso).getTime() < Date.now() + 60_000) {
      return appAlert({ title: "Schedule mailing", message: "Choose a date and time at least one minute in the future.", kind: "error" });
    }
    const confirmed = await appConfirm({
      title: editingScheduled ? "Update this scheduled mailing?" : `Schedule ${recipientCount} individual email${recipientCount === 1 ? "" : "s"}?`,
      message: `Delivery is set for ${formatDate(scheduledIso)}. Each recipient will receive a private, individually addressed email.`,
      confirmLabel: editingScheduled ? "Update schedule" : "Schedule mailing",
    });
    if (!confirmed) return;
    setScheduling(true);
    try {
      const id = await saveDraft();
      const response = await fetch("/api/admin/clients/mailings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "schedule", campaign_id: id, scheduled_for: scheduledIso }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Mailing could not be scheduled.");
      await appAlert({
        title: editingScheduled ? "Schedule updated" : "Mailing scheduled",
        message: `${payload.recipient_count} individual email${payload.recipient_count === 1 ? "" : "s"} will be delivered ${formatDate(scheduledIso)}.`,
        kind: "success",
      });
      resetComposer();
      await load();
    } catch (error) {
      await appAlert({ title: "Schedule mailing", message: error instanceof Error ? error.message : "Mailing could not be scheduled.", kind: "error" });
    } finally {
      setScheduling(false);
    }
  }

  async function editScheduledCampaign(campaignId: string) {
    setEditingId(campaignId);
    try {
      if (draftId && !editingScheduled && (subject.trim() || bodyText.trim() || recipientCount || coverPath)) {
        await saveDraft();
      }
      const response = await fetch(`/api/admin/clients/mailings?campaign_id=${encodeURIComponent(campaignId)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok || !payload.campaign) throw new Error(payload.error || "Scheduled mailing could not be opened.");
      loadedRef.current = false;
      applyCampaignToComposer(payload.campaign as DraftPayload);
      loadedRef.current = true;
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      await appAlert({ title: "Edit scheduled mailing", message: error instanceof Error ? error.message : "Scheduled mailing could not be opened.", kind: "error" });
    } finally {
      setEditingId(null);
    }
  }

  async function deleteScheduledCampaign(campaign: CampaignHistory) {
    const confirmed = await appConfirm({
      title: "Delete this scheduled mailing?",
      message: `“${campaign.subject}” will not be sent. This action cannot be undone.`,
      confirmLabel: "Delete mailing",
      destructive: true,
    });
    if (!confirmed) return;
    setDeletingId(campaign.id);
    try {
      const response = await fetch("/api/admin/clients/mailings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: campaign.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Scheduled mailing could not be deleted.");
      const deletedOpenCampaign = draftId === campaign.id;
      if (deletedOpenCampaign) resetComposer();
      setScheduledCampaigns((current) => current.filter((item) => item.id !== campaign.id));
      await appAlert({ title: "Scheduled mailing deleted", message: "The mailing was removed and will not be sent.", kind: "success" });
      if (deletedOpenCampaign) await load();
    } catch (error) {
      await appAlert({ title: "Delete scheduled mailing", message: error instanceof Error ? error.message : "Scheduled mailing could not be deleted.", kind: "error" });
    } finally {
      setDeletingId(null);
    }
  }

  async function sendCampaign() {
    const validationError = validateCampaign();
    if (validationError) return appAlert({ title: "Mailing", message: validationError, kind: "error" });
    const confirmed = await appConfirm({
      title: `Send ${recipientCount} individual email${recipientCount === 1 ? "" : "s"}?`,
      message: "Each recipient receives a private, individually addressed CDS Space email. Recipient addresses will not be exposed to one another.",
      confirmLabel: "Send mailing",
    });
    if (!confirmed) return;
    setSending(true);
    try {
      const id = await saveDraft();
      const response = await fetch("/api/admin/clients/mailings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", campaign_id: id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Mailing could not be sent.");
      await appAlert({
        title: payload.failed_count ? "Mailing partially delivered" : "Mailing sent",
        message: `${payload.sent_count} of ${payload.recipient_count} emails were delivered.${payload.failed_count ? ` ${payload.failed_count} delivery attempt(s) need attention.` : ""}`,
        kind: payload.failed_count ? "warning" : "success",
      });
      resetComposer();
      await load();
    } catch (error) {
      await appAlert({ title: "Mailing", message: error instanceof Error ? error.message : "Mailing could not be sent.", kind: "error" });
    } finally {
      setSending(false);
    }
  }

  if (loading) return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[#0A4FE8]" /></div>;

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="rounded-[24px] bg-[#0A4FE8] p-6 text-white shadow-[0_20px_60px_rgba(10,79,232,.18)] lg:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[12px] font-semibold text-blue-100">Sales Hub · Client mailings</p>
            <h1 className="mt-2 text-[28px] font-bold tracking-tight lg:text-[36px]">Create a branded client email</h1>
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-blue-50">Select specific clients or everyone, add new verified addresses, refine the message, include a campaign image, and deliver every email privately.</p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-white/25 bg-white/10 px-4 py-3">
            <Users className="h-5 w-5" />
            <div><p className="text-[11px] text-blue-100">Recipients</p><p className="text-[20px] font-bold">{recipientCount}</p></div>
          </div>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)_380px]">
        <section className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="text-[16px] font-bold text-[#0D1B39]">Choose recipients</h2><p className="mt-1 text-[11px] text-slate-500">Account holders and manual client leads with email are shown.</p></div>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-[#0A4FE8]">{clients.length}</span>
          </div>
          <button type="button" onClick={() => setShowAddClient((current) => !current)} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-blue-100 bg-white px-3 text-[11px] font-semibold text-[#0A4FE8] transition hover:bg-blue-50">
            {showAddClient ? <X className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {showAddClient ? "Close new client form" : "Add client without an account"}
          </button>
          {showAddClient && <div className="mt-3 space-y-2 rounded-2xl border border-blue-100 bg-blue-50/40 p-3">
            <div className="flex items-start gap-2"><Building2 className="mt-0.5 h-4 w-4 text-[#0A4FE8]" /><p className="text-[10px] leading-4 text-slate-600">This creates a reusable lead in the client directory. A CDS Space account is not required.</p></div>
            <input value={newClientName} onChange={(event) => setNewClientName(event.target.value)} maxLength={180} placeholder="Contact name" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[11px] outline-none focus:border-[#0A4FE8]" />
            <input value={newClientBrand} onChange={(event) => setNewClientBrand(event.target.value)} maxLength={180} placeholder="Company or brand (optional)" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[11px] outline-none focus:border-[#0A4FE8]" />
            <input type="email" value={newClientEmail} onChange={(event) => setNewClientEmail(event.target.value)} maxLength={254} placeholder="Email address" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[11px] outline-none focus:border-[#0A4FE8]" />
            <div className="grid grid-cols-[auto_1fr] gap-2"><button type="button" disabled={addingClient} onClick={() => { setNewClientName(""); setNewClientBrand(""); setNewClientEmail(""); }} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-semibold text-slate-600 disabled:opacity-50">Clear</button><button type="button" disabled={addingClient} onClick={() => void addClientWithoutAccount()} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-3 text-[11px] font-semibold text-white disabled:opacity-50">{addingClient ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{addingClient ? "Adding client…" : "Add and select client"}</button></div>
          </div>}
          <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
            <input type="checkbox" checked={allClients} onChange={(event) => setAllClients(event.target.checked)} className="h-4 w-4 accent-[#0A4FE8]" />
            <span><span className="block text-[13px] font-semibold text-[#0D1B39]">All clients</span><span className="block text-[10px] text-slate-500">Includes every current client email</span></span>
          </label>
          <div className="relative mt-3"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search clients" className="h-11 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-[12px] outline-none focus:border-[#0A4FE8]" /></div>
          <div className="mt-3 max-h-[390px] space-y-2 overflow-y-auto pr-1">
            {filteredClients.map((client) => {
              const checked = allClients || selectedSet.has(client.id);
              return <label key={client.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${checked ? "border-blue-200 bg-blue-50/50" : "border-slate-100 hover:border-slate-200"}`}>
                <input type="checkbox" disabled={allClients} checked={checked} onChange={() => toggleClient(client.id)} className="mt-0.5 h-4 w-4 accent-[#0A4FE8]" />
                <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><span className="block min-w-0 truncate text-[12px] font-semibold text-[#0D1B39]">{client.brand_name || client.name}</span>{!client.has_platform_account && <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] font-medium text-slate-500">No account</span>}</span><span className="block truncate text-[10px] text-slate-500">{client.email}</span></span>
              </label>;
            })}
          </div>
          <label className="mt-4 block text-[11px] font-semibold text-[#0D1B39]">Add new email addresses</label>
          <textarea value={customEmailText} onChange={(event) => setCustomEmailText(event.target.value)} rows={4} placeholder="name@company.com&#10;another@company.com" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[12px] leading-5 outline-none focus:border-[#0A4FE8]" />
          <p className={`mt-1 text-[10px] ${invalidCustomEmails.length ? "text-red-600" : "text-slate-400"}`}>{invalidCustomEmails.length ? `${invalidCustomEmails.length} address${invalidCustomEmails.length === 1 ? " is" : "es are"} incomplete or invalid.` : "Separate multiple addresses with commas or new lines."}</p>
        </section>

        <section className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="flex items-center gap-2 text-[16px] font-bold text-[#0D1B39]"><PenLine className="h-4 w-4 text-[#0A4FE8]" />{editingScheduled ? "Edit scheduled email" : "Write the email"}</h2><p className="mt-1 text-[11px] text-slate-500">{editingScheduled ? "Content and recipient changes are saved automatically." : "The draft is saved automatically."}</p></div>
            <span className={`text-[11px] ${saveStatus === "error" ? "text-red-600" : "text-slate-500"}`}>{saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? editingScheduled ? "Changes saved" : "Draft saved" : saveStatus === "error" ? "Changes could not be saved" : ""}</span>
          </div>
          {editingScheduled && <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-2"><CalendarClock className="mt-0.5 h-4 w-4 text-[#0A4FE8]" /><div><p className="text-[11px] font-semibold text-[#0D1B39]">This mailing is currently scheduled</p><p className="mt-0.5 text-[10px] text-slate-500">Use Update schedule after changing its delivery time.</p></div></div><button type="button" onClick={() => { resetComposer(); void load(); }} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-semibold text-slate-600">Return to my draft</button></div>}
          <label className="mt-5 block text-[11px] font-semibold text-[#0D1B39]">Subject</label>
          <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={200} placeholder="A clear reason to open this email" className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 px-4 text-[13px] outline-none focus:border-[#0A4FE8]" />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <label className="text-[11px] font-semibold text-[#0D1B39]">Message</label>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={Boolean(aiBusy)} onClick={() => void rewrite("improve")} className="inline-flex h-9 items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 text-[11px] font-semibold text-[#0A4FE8] disabled:opacity-50">{aiBusy === "improve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />}Improve</button>
              <button type="button" disabled={Boolean(aiBusy)} onClick={() => void rewrite("rewrite")} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-[11px] font-semibold text-[#0D1B39] disabled:opacity-50">{aiBusy === "rewrite" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Rewrite</button>
            </div>
          </div>
          <textarea value={bodyText} onChange={(event) => setBodyText(event.target.value)} maxLength={20000} rows={16} placeholder="Write the client email here…" className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-3 text-[13px] leading-6 outline-none focus:border-[#0A4FE8]" />

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="flex items-center gap-2 text-[12px] font-semibold text-[#0D1B39]"><ImageIcon className="h-4 w-4 text-[#0A4FE8]" />Cover or advert image</p><p className="mt-1 text-[10px] text-slate-500">PNG, JPEG, WebP or GIF, up to 8MB. The image is secured and embedded directly in each email.</p></div>
              <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 text-[11px] font-semibold text-[#0A4FE8]">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{uploading ? "Uploading…" : coverPath ? "Replace image" : "Upload image"}</button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => void uploadCover(event.target.files?.[0] || null)} className="sr-only" />
            </div>
            {coverPreview && <div className="relative mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white"><img src={coverPreview} alt="Email campaign preview" className="max-h-52 w-full object-contain" /><button type="button" onClick={() => { setCoverPath(null); setCoverName(null); setCoverMime(null); setCoverPreview(null); }} aria-label="Remove image" className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white text-slate-600 shadow"><X className="h-4 w-4" /></button></div>}
          </div>

          <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
            <div className="flex items-start gap-2"><Clock3 className="mt-0.5 h-4 w-4 text-[#0A4FE8]" /><div><p className="text-[12px] font-semibold text-[#0D1B39]">Schedule delivery</p><p className="mt-0.5 text-[10px] leading-4 text-slate-500">Choose the date and time in West Africa Time (WAT). Delivery runs automatically and each address remains private.</p></div></div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input type="datetime-local" value={scheduleAt} min={earliestScheduleValue()} onChange={(event) => setScheduleAt(event.target.value)} className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-[12px] text-[#0D1B39] outline-none focus:border-[#0A4FE8]" />
              <button type="button" disabled={sending || scheduling || uploading || Boolean(aiBusy)} onClick={() => void scheduleCampaign()} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 text-[11px] font-semibold text-[#0A4FE8] disabled:opacity-50">{scheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}{scheduling ? "Scheduling…" : editingScheduled ? "Update schedule" : "Schedule email"}</button>
            </div>
          </div>

          <button type="button" disabled={sending || scheduling || uploading || Boolean(aiBusy)} onClick={() => void sendCampaign()} className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-[13px] font-bold text-white shadow-[0_10px_24px_rgba(10,79,232,.22)] transition hover:bg-[#083FC2] disabled:opacity-50">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{sending ? "Sending individual emails…" : `Send now to ${recipientCount} recipient${recipientCount === 1 ? "" : "s"}`}</button>
        </section>

        <aside className="space-y-5">
          <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4"><h2 className="flex items-center gap-2 text-[15px] font-bold text-[#0D1B39]"><Mail className="h-4 w-4 text-[#0A4FE8]" />Email preview</h2></div>
            <div className="bg-slate-100 p-4">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="px-5 py-5 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[#0A4FE8] text-[15px] font-bold text-white">CDS</div><p className="mt-2 text-[14px] font-bold text-[#0D1B39]">CDS Space</p></div>
                <div className="px-5 pb-6">{coverPreview && <img src={coverPreview} alt="" className="mb-4 max-h-44 w-full rounded-xl object-cover" />}<p className="text-[12px] text-slate-600">Hello Client,</p><div className="mt-3 whitespace-pre-wrap text-[11px] leading-5 text-slate-600">{bodyText || "Your email message will appear here."}</div></div>
                <div className="bg-[#0D1B39] px-5 py-4 text-[9px] leading-4 text-blue-100">CDS Space · cdsspace.pro · support@cdsspace.pro</div>
              </div>
            </div>
          </section>

          <section className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-[15px] font-bold text-[#0D1B39]"><CalendarClock className="h-4 w-4 text-[#0A4FE8]" />Scheduled mailings</h2><span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-[#0A4FE8]">{scheduledCampaigns.length}</span></div>
            <div className="mt-3 space-y-2">
              {scheduledCampaigns.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-center text-[11px] text-slate-400">Scheduled emails will appear here.</p> : scheduledCampaigns.map((campaign) => <div key={campaign.id} className={`rounded-xl border p-3 ${draftId === campaign.id ? "border-blue-200 bg-blue-50/50" : "border-slate-100"}`}>
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="line-clamp-2 text-[11px] font-semibold text-[#0D1B39]">{campaign.subject}</p><p className="mt-1 flex items-center gap-1 text-[9px] text-slate-500"><Clock3 className="h-3 w-3" />{formatDate(campaign.scheduled_for)}</p></div><span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-semibold text-[#0A4FE8]">Scheduled</span></div>
                <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2"><span className="text-[9px] text-slate-400">{campaign.recipient_count} recipient{campaign.recipient_count === 1 ? "" : "s"}</span><div className="flex gap-1"><button type="button" disabled={Boolean(editingId || deletingId)} onClick={() => void editScheduledCampaign(campaign.id)} aria-label={`Edit ${campaign.subject}`} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-blue-200 hover:text-[#0A4FE8] disabled:opacity-50">{editingId === campaign.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />}</button><button type="button" disabled={Boolean(editingId || deletingId)} onClick={() => void deleteScheduledCampaign(campaign)} aria-label={`Delete ${campaign.subject}`} className="grid h-8 w-8 place-items-center rounded-lg border border-red-100 text-red-600 transition hover:bg-red-50 disabled:opacity-50">{deletingId === campaign.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}</button></div></div>
              </div>)}
            </div>
          </section>

          <section className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-[15px] font-bold text-[#0D1B39]">Recent mailings</h2>
            <div className="mt-3 space-y-2">
              {campaigns.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-center text-[11px] text-slate-400">Sent campaigns will appear here.</p> : campaigns.slice(0, 8).map((campaign) => <div key={campaign.id} className="rounded-xl border border-slate-100 p-3"><div className="flex items-start justify-between gap-3"><p className="line-clamp-2 text-[11px] font-semibold text-[#0D1B39]">{campaign.subject}</p><span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${campaign.failed_count ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{campaign.failed_count ? "Needs attention" : "Sent"}</span></div><div className="mt-2 flex items-center justify-between text-[9px] text-slate-400"><span>{campaign.sent_count}/{campaign.recipient_count} delivered</span><span>{formatDate(campaign.sent_at)}</span></div></div>)}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
