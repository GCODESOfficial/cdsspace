"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Trash2, Loader2, Plus, Pencil, Save, Building2, Search, Mail, Phone,
  Filter, Cake, MessageCircle, UserRound, MapPin, BellRing, CheckCircle2,
  BadgeCheck, CircleAlert, Copy, HardDrive, Link2, Send, UserPlus, X,
} from "lucide-react";
import { BirthdayModal, type BirthdayClient } from "@/components/admin/BirthdayCelebrate";
import {
  birthdayWishedForNextOccurrence,
  daysUntilBirthday,
  defaultBirthdayMessage,
  nextBirthdayYear,
} from "@/lib/birthday-card";
import BulkActionBar from "@/components/admin/BulkActionBar";
import { INDUSTRY_CATEGORIES } from "@/lib/industry-categories";
import { appConfirm } from "@/lib/app-notify";

interface Client {
  id: string;
  manual_client_id: string | null;
  platform_user_id: string | null;
  has_platform_account: boolean;
  source: "manual" | "platform";
  name: string;
  brand_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  industry: string | null;
  industries: string[];
  contact_person: string | null;
  address: string | null;
  notes: string | null;
  status: string;
  birthday: string | null;
  birthday_reminder_enabled: boolean;
  birthday_reminder_days: number;
  preferred_contact_method: "email" | "whatsapp" | "phone" | null;
  last_birthday_wish_at: string | null;
  birthday_wished_for_year: number | null;
  created_at: string;
  account_linked_at: string | null;
  duplicate_profiles: PlatformProfile[];
}

interface PlatformProfile {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  phone_number: string | null;
  billing_currency: string | null;
}

interface DuplicatePayload {
  manual: Array<{ id: string; name: string; brand_name: string | null; email: string | null }>;
  profiles: PlatformProfile[];
}

interface StorageRequest {
  id: string;
  client_user_id: string;
  requested_at: string;
  full_name: string | null;
  company_name: string | null;
  email: string;
  storage_limit_bytes: string;
}

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "lead", label: "Lead" },
  { key: "inactive", label: "Inactive" },
  { key: "archived", label: "Archived" },
];

const CONTACT_METHODS = [
  { value: "", label: "Choose automatically" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone call" },
] as const;

const KNOWN_INDUSTRIES = new Set<string>(INDUSTRY_CATEGORIES);

function birthdayDateLabel(birthday: string | null) {
  if (!birthday) return "Not captured";
  const date = new Date(`${birthday.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? "Not captured"
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function birthdayTimingLabel(days: number | null) {
  if (days === null) return "Add birthday";
  if (days === 0) return "Today 🎂";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

export default function ClientsListPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [platformProfiles, setPlatformProfiles] = useState<PlatformProfile[]>([]);
  const [linkedPlatformId, setLinkedPlatformId] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicatePayload | null>(null);
  const [mergeClient, setMergeClient] = useState<Client | null>(null);
  const [mergeProfileId, setMergeProfileId] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [storageRequests, setStorageRequests] = useState<StorageRequest[]>([]);
  const [storageRequestBusy, setStorageRequestBusy] = useState<string | null>(null);
  const { toast } = useToast();

  // Form fields
  const [name, setName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [industries, setIndustries] = useState<string[]>([]);
  const [contactPerson, setContactPerson] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("active");
  const [birthday, setBirthday] = useState("");
  const [birthdayReminderEnabled, setBirthdayReminderEnabled] = useState(true);
  const [birthdayReminderDays, setBirthdayReminderDays] = useState("30");
  const [preferredContactMethod, setPreferredContactMethod] = useState("");
  const [celebrate, setCelebrate] = useState<BirthdayClient | null>(null);

  useEffect(() => { fetchClients(); }, []);

  async function fetchClients() {
    setIsFetching(true);
    const [response, storageResponse] = await Promise.all([
      fetch("/api/admin/clients/directory", { cache: "no-store" }),
      fetch("/api/admin/clients/storage-requests", { cache: "no-store" }),
    ]);
    const [data, storageData] = await Promise.all([
      response.json().catch(() => ({})),
      storageResponse.json().catch(() => ({})),
    ]);
    if (!response.ok) {
      toast({ title: "Could not load clients", description: data.error || "Please try again.", variant: "destructive" });
    } else {
      setClients(data.clients || []);
      setPlatformProfiles(data.platformProfiles || []);
    }
    if (storageResponse.ok) setStorageRequests(storageData.requests || []);
    setIsFetching(false);
  }

  async function reviewStorageRequest(requestId: string, decision: "approve" | "decline") {
    if (decision === "decline" && !(await appConfirm({ title: "Decline storage request?", message: "The client will be notified that the request was reviewed.", confirmLabel: "Decline request", destructive: true }))) return;
    setStorageRequestBusy(requestId);
    const response = await fetch("/api/admin/clients/storage-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, decision, grantBytes: 1024 ** 3 }),
    });
    const payload = await response.json().catch(() => ({}));
    setStorageRequestBusy(null);
    if (!response.ok) {
      toast({ title: "Request not updated", description: payload.error || "Please try again.", variant: "destructive" });
      return;
    }
    setStorageRequests((current) => current.filter((item) => item.id !== requestId));
    toast({ title: decision === "approve" ? "Storage increased" : "Request declined", description: decision === "approve" ? "The client can continue uploading and creating work." : "The client was notified." });
  }

  function resetForm() {
    setName(""); setBrandName(""); setEmail(""); setPhone(""); setWhatsapp("");
    setIndustries([]); setContactPerson(""); setNotes(""); setStatus("active");
    setAddress(""); setBirthday(""); setBirthdayReminderEnabled(true);
    setBirthdayReminderDays("30"); setPreferredContactMethod("");
    setLinkedPlatformId(null); setDuplicateWarning(null);
    setEditId(null);
  }

  function closeForm() {
    resetForm();
    setShowForm(false);
  }

  // Close the modal on Escape and lock background scroll while it's open.
  useEffect(() => {
    if (!showForm) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") closeForm(); };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm]);

  function startEdit(c: Client) {
    setEditId(c.manual_client_id);
    setLinkedPlatformId(c.platform_user_id);
    setName(c.name);
    setBrandName(c.brand_name || "");
    setEmail(c.email || "");
    setPhone(c.phone || "");
    setWhatsapp(c.whatsapp || "");
    setIndustries(c.industries?.length ? c.industries : c.industry ? [c.industry] : []);
    setContactPerson(c.contact_person || "");
    setAddress(c.address || "");
    setNotes(c.notes || "");
    setStatus(c.status);
    setBirthday(c.birthday ? c.birthday.slice(0, 10) : "");
    setBirthdayReminderEnabled(c.birthday_reminder_enabled !== false);
    setBirthdayReminderDays(String(c.birthday_reminder_days || 30));
    setPreferredContactMethod(c.preferred_contact_method || "");
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: "Missing name", description: "Client name is required", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    setDuplicateWarning(null);

    const payload = {
      name: name.trim(),
      brand_name: brandName.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      whatsapp: whatsapp.trim() || null,
      industry: industries[0] || null,
      industries,
      contact_person: contactPerson.trim() || null,
      address: address.trim() || null,
      notes: notes.trim() || null,
      status,
      birthday: birthday || null,
      birthday_reminder_enabled: birthday ? birthdayReminderEnabled : false,
      birthday_reminder_days: Number(birthdayReminderDays) || 30,
      preferred_contact_method: preferredContactMethod || null,
      platform_user_id: linkedPlatformId,
    };

    const response = await fetch("/api/admin/clients/directory", {
      method: editId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editId ? { action: "update", manual_client_id: editId, ...payload } : payload),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (result.duplicates) setDuplicateWarning(result.duplicates);
      toast({ title: "Client not saved", description: result.error || "Please review the client details.", variant: "destructive" });
    } else {
      toast({ title: editId ? "Updated" : "Added", description: editId ? "Client updated" : "Client added" });
      resetForm();
      setShowForm(false);
      fetchClients();
    }
    setIsLoading(false);
  }

  async function handleDelete(id: string) {
    if (!(await appConfirm("Delete this client?"))) return;
    await fetch("/api/admin/clients/directory", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id] }),
    });
    fetchClients();
  }

  async function handleBulkDelete() {
    if (!(await appConfirm(`Delete ${selected.size} clients?`))) return;
    await fetch("/api/admin/clients/directory", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: Array.from(selected) }),
    });
    setSelected(new Set());
    fetchClients();
  }

  async function inviteClient(client: Client) {
    if (!client.manual_client_id) return;
    setIsLoading(true);
    setInviteLink(null);
    const response = await fetch("/api/admin/clients/directory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "invite", manual_client_id: client.manual_client_id }),
    });
    const result = await response.json().catch(() => ({}));
    setIsLoading(false);
    if (!response.ok) {
      setInviteLink(result.invite_url || null);
      if (result.invite_url) await navigator.clipboard.writeText(result.invite_url).catch(() => undefined);
      toast({
        title: "Invite not sent",
        description: result.error || "Please try again.",
        variant: "destructive",
      });
      return;
    }
    setInviteLink(result.invite_url || null);
    if (result.invite_url) await navigator.clipboard.writeText(result.invite_url).catch(() => undefined);
    toast({
      title: result.emailed ? "Invitation sent" : "Invitation link created",
      description: result.emailed
        ? `The account invitation was emailed to ${client.email}. The link was also copied.`
        : "Email delivery was unavailable, so the secure invitation link was copied for you to share.",
    });
  }

  function openMerge(client: Client) {
    setMergeClient(client);
    setMergeProfileId(client.duplicate_profiles[0]?.id || "");
  }

  async function mergeAccount() {
    if (!mergeClient?.manual_client_id || !mergeProfileId) return;
    setIsLoading(true);
    const response = await fetch("/api/admin/clients/directory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "merge",
        manual_client_id: mergeClient.manual_client_id,
        platform_user_id: mergeProfileId,
      }),
    });
    const result = await response.json().catch(() => ({}));
    setIsLoading(false);
    if (!response.ok) {
      toast({ title: "Accounts not merged", description: result.error || "Please try again.", variant: "destructive" });
      return;
    }
    toast({ title: "Client merged", description: "The CRM history and platform account are now one client record." });
    setMergeClient(null);
    setMergeProfileId("");
    await fetchClients();
  }

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    const matchesSearch = !q
      || c.name.toLowerCase().includes(q)
      || c.brand_name?.toLowerCase().includes(q)
      || c.contact_person?.toLowerCase().includes(q)
      || c.email?.toLowerCase().includes(q)
      || c.phone?.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const toggleSelect = (id: string) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n); };
  const selectable = filtered.filter((client) => client.manual_client_id);
  const toggleAll = () => selected.size === selectable.length ? setSelected(new Set()) : setSelected(new Set(selectable.map((client) => client.manual_client_id as string)));

  function toggleIndustry(industry: string) {
    setIndustries((current) => current.includes(industry)
      ? current.filter((entry) => entry !== industry)
      : [...current, industry]);
  }

  const industryOptions = [
    ...INDUSTRY_CATEGORIES,
    ...industries.filter((industry) => !KNOWN_INDUSTRIES.has(industry)),
  ];

  const statusColors: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-600",
    lead: "bg-blue-50 text-[#0A4FE8]",
    inactive: "bg-gray-100 text-gray-500",
    archived: "bg-amber-50 text-amber-600",
  };

  const birthdaySoon = useMemo(() => (
    clients
      .map((c) => ({ ...c, days_until: daysUntilBirthday(c.birthday) }))
      .filter((c) => (
        c.days_until !== null
        && c.birthday_reminder_enabled !== false
        && (c.days_until as number) <= (c.birthday_reminder_days || 30)
        && !birthdayWishedForNextOccurrence(c.birthday, c.birthday_wished_for_year)
      ))
      .sort((a, b) => (a.days_until as number) - (b.days_until as number))
  ), [clients]);

  const missingBirthdays = useMemo(() => clients.filter((client) => !client.birthday).length, [clients]);

  function openBirthdayPlanner(c: Client) {
    setCelebrate({
      id: c.id,
      name: c.name,
      brand_name: c.brand_name,
      email: c.email,
      phone: c.phone,
      whatsapp: c.whatsapp,
      birthday: c.birthday,
      preferred_contact_method: c.preferred_contact_method,
      message: defaultBirthdayMessage(c.name),
    });
  }

  function handleWished(clientId: string, wishedForYear: number, wishedAt: string) {
    setClients((current) => current.map((client) => (
      client.id === clientId
        ? { ...client, birthday_wished_for_year: wishedForYear, last_birthday_wish_at: wishedAt }
        : client
    )));
  }

  return (
    <div className="max-w-[1680px] p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-[#0A4FE8] text-sm font-semibold">Management</p>
          <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">Unified Client Directory</h1>
          <p className="text-gray-400 text-[13px] mt-1">Manual customers and signed-up CDS Space accounts in one duplicate-safe list</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition">
          <Plus className="w-4 h-4" /> Add Client
        </button>
      </div>

      {storageRequests.length > 0 && (
        <section id="storage-requests" className="mb-6 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8]"><HardDrive className="h-5 w-5" /></span>
            <div><h2 className="text-sm font-semibold text-[#0D1B39]">Storage requests</h2><p className="mt-1 text-xs text-slate-500">Review clients who need more workspace space.</p></div>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {storageRequests.map((request) => (
              <article key={request.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#0D1B39]">{request.full_name || request.company_name || request.email}</p><p className="mt-1 truncate text-xs text-slate-400">{request.email}</p></div>
                <div className="flex gap-2"><button type="button" disabled={storageRequestBusy === request.id} onClick={() => void reviewStorageRequest(request.id, "decline")} className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 disabled:opacity-50">Decline</button><button type="button" disabled={storageRequestBusy === request.id} onClick={() => void reviewStorageRequest(request.id, "approve")} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#0A4FE8] px-3 text-xs font-semibold text-white disabled:opacity-50">{storageRequestBusy === request.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Approve more space</button></div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Edit / Add client modal */}
      {showForm && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeForm}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0D1B39]/50 p-4 backdrop-blur-sm sm:p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative my-6 w-full max-w-3xl overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold text-[#0D1B39]">
                <Building2 className="w-4 h-4 text-[#0A4FE8]" />
                {editId ? "Edit CRM Client" : linkedPlatformId ? "Add Platform Account to CRM" : "New CRM Client"}
              </h2>
              <button type="button" onClick={closeForm} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[calc(100vh-9rem)] overflow-y-auto p-6">
              {linkedPlatformId && !editId && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs font-medium text-blue-700">
                  <BadgeCheck className="h-4 w-4" /> This CRM record will be linked to the selected signed-up account.
                </div>
              )}
              <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Client Name *" value={name} onChange={setName} placeholder="John Doe / Acme Inc." />
            <Field label="Brand Name" value={brandName} onChange={setBrandName} placeholder="(Optional)" />
            <Field label="Contact Person" value={contactPerson} onChange={setContactPerson} placeholder="Primary contact" />
            <div role="group" aria-labelledby="client-industries-label" className="md:col-span-2">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p id="client-industries-label" className="text-xs font-medium text-gray-500">Industries</p>
                <span className="text-[11px] text-gray-400">Select all that apply</span>
              </div>
              <div className="flex min-h-12 flex-wrap gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2.5">
                {industryOptions.map((industry) => {
                  const isSelected = industries.includes(industry);
                  return (
                    <button
                      key={industry}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => toggleIndustry(industry)}
                      className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition ${isSelected
                        ? "border-[#0A4FE8] bg-[#0A4FE8] text-white"
                        : "border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:text-[#0A4FE8]"
                      }`}
                    >
                      {isSelected && <CheckCircle2 className="h-3.5 w-3.5" />}
                      {industry}
                    </button>
                  );
                })}
              </div>
            </div>
            <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="email@..." />
            <Field label="Phone" value={phone} onChange={setPhone} placeholder="+1 555..." />
            <Field label="WhatsApp" value={whatsapp} onChange={setWhatsapp} placeholder="+1 555..." />
            <Field label="Company / Contact Address" value={address} onChange={setAddress} placeholder="Street, city, country" />
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer">
                <option value="active">Active</option>
                <option value="lead">Lead</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Preferred contact method</label>
              <select value={preferredContactMethod} onChange={(e) => setPreferredContactMethod(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer">
                {CONTACT_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
              </select>
            </div>
            <div className="rounded-2xl border border-pink-100 bg-pink-50/40 p-4 md:col-span-2">
              <div className="mb-3 flex items-start justify-between gap-4">
                <div>
                  <p className="flex items-center gap-2 text-[13px] font-bold text-[#0D1B39]"><Cake className="h-4 w-4 text-pink-500" /> Birthday reminders</p>
                  <p className="mt-1 text-[11px] text-gray-500">Capture the date and choose how early the team should be reminded.</p>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-[12px] font-semibold text-gray-600">
                  <input type="checkbox" checked={birthdayReminderEnabled} onChange={(event) => setBirthdayReminderEnabled(event.target.checked)}
                    disabled={!birthday} className="h-4 w-4 rounded border-gray-300 text-[#0A4FE8] disabled:opacity-40" />
                  Remind us
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Birthday" type="date" value={birthday} onChange={(value) => { setBirthday(value); if (value) setBirthdayReminderEnabled(true); }} />
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Reminder lead time</label>
                  <select value={birthdayReminderDays} onChange={(event) => setBirthdayReminderDays(event.target.value)} disabled={!birthday || !birthdayReminderEnabled}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-100 disabled:cursor-not-allowed disabled:opacity-50">
                    <option value="7">7 days before</option>
                    <option value="14">14 days before</option>
                    <option value="30">30 days before</option>
                    <option value="60">60 days before</option>
                    <option value="90">90 days before</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300" />
            </div>
            <div className="flex gap-2 md:col-span-2">
              <button type="submit" disabled={isLoading}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#0A4FE8] text-white text-sm font-medium rounded-xl hover:bg-[#083EC0] transition disabled:opacity-50">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editId ? "Save Changes" : "Add Client"}
              </button>
              <button type="button" onClick={closeForm}
                className="px-4 py-2.5 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition">
                Cancel
              </button>
            </div>
            {duplicateWarning && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 md:col-span-2">
                <p className="flex items-center gap-2 font-bold"><CircleAlert className="h-4 w-4" /> Possible duplicate blocked</p>
                <p className="mt-1">Use the existing client or merge the manual CRM record with its platform account.</p>
                <div className="mt-2 space-y-1 text-[11px]">
                  {duplicateWarning.manual.map((item) => <p key={`manual-${item.id}`}>CRM: {item.brand_name || item.name}{item.email ? ` (${item.email})` : ""}</p>)}
                  {duplicateWarning.profiles.map((item) => <p key={`profile-${item.id}`}>Platform: {item.company_name || item.full_name || item.email} ({item.email})</p>)}
                </div>
              </div>
            )}
              </form>
            </div>
          </div>
        </div>
      )}

      {inviteLink && (
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[#0D1B39]">Secure client invitation ready</p>
            <p className="truncate text-xs text-gray-500">{inviteLink}</p>
          </div>
          <button type="button" onClick={() => navigator.clipboard.writeText(inviteLink)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-[#0A4FE8] shadow-sm">
            <Copy className="h-4 w-4" /> Copy link
          </button>
        </div>
      )}

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <BulkActionBar selectedCount={selected.size} onClear={() => setSelected(new Set())}
          actions={[{ label: "Delete", icon: <Trash2 className="w-3.5 h-3.5" />, onClick: handleBulkDelete, variant: "danger" as const }]} />
      )}

      {/* Birthday planner */}
      <div className="mb-6 rounded-2xl border border-pink-100 bg-gradient-to-br from-pink-50/70 to-white p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-pink-100 text-pink-600"><BellRing className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-bold text-[#0D1B39]">Birthday planner</h3>
            <p className="text-[11px] text-gray-500">Prepare a design and message before the celebration date.</p>
          </div>
          <span className="rounded-full bg-pink-100 px-2.5 py-1 text-[11px] font-bold text-pink-600">{birthdaySoon.length} due soon</span>
          {missingBirthdays > 0 && (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-600">{missingBirthdays} dates missing</span>
          )}
        </div>
        {birthdaySoon.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {birthdaySoon.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border border-pink-100/70 bg-white px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-[#0D1B39]">{c.name}</p>
                  <p className="text-[11px] font-medium text-pink-600">{birthdayTimingLabel(c.days_until)}</p>
                </div>
                <button onClick={() => openBirthdayPlanner(c)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-bold text-white ${c.days_until === 0 ? "bg-[#0A4FE8] hover:bg-[#083EC0]" : "bg-pink-500 hover:bg-pink-600"}`}>
                  {c.days_until === 0 ? "Send wishes" : "Prepare"}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-pink-200 bg-white/70 px-4 py-3 text-[12px] text-gray-500">
            No unwished birthdays are inside the configured reminder windows.
          </div>
        )}
      </div>

      {celebrate && <BirthdayModal client={celebrate} onClose={() => setCelebrate(null)} onWished={handleWished} />}

      {/* List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input placeholder="Search name, brand, contact, email, or phone..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 w-full rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300" />
          </div>
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            {STATUS_FILTERS.map(f => (
              <button key={f.key} onClick={() => setStatusFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition ${
                  statusFilter === f.key ? "bg-[#0A4FE8] text-white" : "bg-gray-50 text-gray-500 border border-gray-200 hover:border-blue-200"
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {isFetching ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Building2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No clients found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[1540px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="py-2.5 px-6 w-10">
                  <input type="checkbox" checked={selected.size === selectable.length && selectable.length > 0} onChange={toggleAll}
                    className="w-4 h-4 rounded border-gray-300 text-[#0A4FE8] cursor-pointer" />
                </th>
                <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">CDS Space account</th>
                <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Name / Brand</th>
                <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Contact person</th>
                <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Industries</th>
                <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Email</th>
                <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Phone / WhatsApp</th>
                <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Birthday</th>
                <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="text-right py-2.5 px-6 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const days = daysUntilBirthday(c.birthday);
                const occurrenceYear = nextBirthdayYear(c.birthday);
                const wished = birthdayWishedForNextOccurrence(c.birthday, c.birthday_wished_for_year);
                return (
                <tr key={c.id} className={`border-b border-gray-50 hover:bg-blue-50/30 transition ${c.manual_client_id && selected.has(c.manual_client_id) ? "bg-blue-50/40" : ""}`}>
                  <td className="py-3 px-6">
                    <input type="checkbox" disabled={!c.manual_client_id} checked={Boolean(c.manual_client_id && selected.has(c.manual_client_id))} onChange={() => c.manual_client_id && toggleSelect(c.manual_client_id)}
                      className="w-4 h-4 rounded border-gray-300 text-[#0A4FE8] cursor-pointer disabled:cursor-not-allowed disabled:opacity-30" />
                  </td>
                  <td className="py-3 px-3">
                    {c.has_platform_account ? (
                      <div>
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700"><BadgeCheck className="h-3.5 w-3.5" /> Connected</span>
                        <p className="mt-1 text-[10px] text-gray-400">{c.source === "platform" ? "Signed up on the website" : "CRM and platform linked"}</p>
                      </div>
                    ) : c.duplicate_profiles.length > 0 ? (
                      <button type="button" onClick={() => openMerge(c)} className="text-left">
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700"><CircleAlert className="h-3.5 w-3.5" /> Possible match</span>
                        <p className="mt-1 text-[10px] font-semibold text-[#0A4FE8]">Review and merge</p>
                      </button>
                    ) : (
                      <div><span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-600">No account</span><p className="mt-1 text-[10px] text-gray-400">Invite to cdsspace.pro</p></div>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <button type="button" onClick={() => startEdit(c)} title={c.manual_client_id ? "Edit CRM client" : "Add platform account to CRM"} className="group flex w-full items-center gap-3 text-left">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-[#0A4FE8] text-sm font-bold flex-shrink-0">
                        {(c.brand_name || c.name).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-[#0D1B39] group-hover:text-[#0A4FE8]">{c.brand_name || c.name}</p>
                        {c.brand_name && <p className="text-[11px] text-gray-400">{c.name}</p>}
                        {c.address && <p className="mt-0.5 flex max-w-[190px] items-center gap-1 truncate text-[10px] text-gray-400"><MapPin className="h-3 w-3 shrink-0" />{c.address}</p>}
                      </div>
                    </button>
                  </td>
                  <td className="py-3 px-3">
                    {c.contact_person ? (
                      <p className="flex items-center gap-1.5 text-[12px] font-medium text-gray-600"><UserRound className="h-3.5 w-3.5 text-gray-300" />{c.contact_person}</p>
                    ) : <span className="text-gray-300 text-[12px]">Not added</span>}
                  </td>
                  <td className="py-3 px-3">
                    {(c.industries?.length || c.industry) ? (
                      <div className="flex max-w-[220px] flex-wrap gap-1">
                        {(c.industries?.length ? c.industries : [c.industry as string]).map((industry) => (
                          <span key={industry} className="inline-block rounded-md bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600">{industry}</span>
                        ))}
                      </div>
                    ) : <span className="text-gray-300 text-[12px]">-</span>}
                  </td>
                  <td className="py-3 px-3">
                    {c.email ? (
                      <p className={`flex max-w-[210px] items-center gap-1 truncate text-[12px] ${c.preferred_contact_method === "email" ? "font-semibold text-[#0A4FE8]" : "text-gray-600"}`}>
                        <Mail className="h-3 w-3 shrink-0 text-gray-300" />{c.email}
                      </p>
                    ) : <span className="text-gray-300 text-[12px]">Not added</span>}
                  </td>
                  <td className="py-3 px-3">
                    {c.phone && <p className={`flex items-center gap-1 text-[12px] ${c.preferred_contact_method === "phone" ? "font-semibold text-[#0A4FE8]" : "text-gray-600"}`}><Phone className="h-3 w-3 text-gray-300" />{c.phone}</p>}
                    {c.whatsapp && <p className={`mt-0.5 flex items-center gap-1 text-[11px] ${c.preferred_contact_method === "whatsapp" ? "font-semibold text-emerald-600" : "text-gray-400"}`}><MessageCircle className="h-3 w-3" />{c.whatsapp}</p>}
                    {!c.phone && !c.whatsapp && <span className="text-gray-300 text-[12px]">Not added</span>}
                  </td>
                  <td className="py-3 px-3">
                    {c.birthday ? (
                      <button type="button" onClick={() => openBirthdayPlanner(c)} className="group text-left">
                        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[#0D1B39] group-hover:text-[#0A4FE8]"><Cake className="h-3.5 w-3.5 text-pink-500" />{birthdayDateLabel(c.birthday)}</p>
                        {wished ? (
                          <p className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-emerald-600"><CheckCircle2 className="h-3 w-3" />Wished for {occurrenceYear}</p>
                        ) : c.birthday_reminder_enabled === false ? (
                          <p className="mt-0.5 text-[10px] text-gray-400">Reminder off</p>
                        ) : (
                          <p className={`mt-0.5 text-[10px] font-bold ${(days ?? 999) <= (c.birthday_reminder_days || 30) ? "text-pink-600" : "text-gray-400"}`}>{birthdayTimingLabel(days)} · {c.birthday_reminder_days || 30}d alert</p>
                        )}
                      </button>
                    ) : (
                      <button type="button" onClick={() => startEdit(c)} className="text-[11px] font-semibold text-amber-600 hover:text-amber-700">+ Add birthday</button>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-medium capitalize ${statusColors[c.status] || "bg-gray-100 text-gray-500"}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="py-3 px-6">
                    <div className="flex items-center justify-end gap-1">
                      {c.manual_client_id && !c.has_platform_account && c.email && (
                        <button title="Invite client to create an account" disabled={isLoading} onClick={() => void inviteClient(c)} className="p-1.5 rounded-md text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50 transition disabled:opacity-40">
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {c.manual_client_id && !c.has_platform_account && (
                        <button title="Link or merge a platform account" onClick={() => openMerge(c)} className="p-1.5 rounded-md text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition">
                          <Link2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {c.birthday && c.manual_client_id && (
                        <button title="Prepare birthday greeting" onClick={() => openBirthdayPlanner(c)} className="p-1.5 rounded-md text-pink-400 hover:text-pink-600 hover:bg-pink-50 transition">
                          <Cake className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button title={c.manual_client_id ? "Edit CRM client" : "Add platform account to CRM"} onClick={() => startEdit(c)} className="p-1.5 rounded-md text-gray-400 hover:text-[#0A4FE8] hover:bg-blue-50 transition">
                        {c.manual_client_id ? <Pencil className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                      </button>
                      {c.manual_client_id && <button onClick={() => handleDelete(c.manual_client_id as string)} className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
          </div>
        )}
      </div>
      {mergeClient && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-[#07133B]/45 p-4" role="dialog" aria-modal="true" aria-labelledby="merge-client-title">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8]"><Link2 className="h-5 w-5" /></span>
              <div>
                <h2 id="merge-client-title" className="text-lg font-bold text-[#0D1B39]">Merge with a platform account</h2>
                <p className="mt-1 text-xs leading-relaxed text-gray-500">Link {mergeClient.brand_name || mergeClient.name} to the signed-up account. CRM notes, birthdays, delivery history, and client files are preserved.</p>
              </div>
            </div>
            {mergeClient.duplicate_profiles.length > 0 && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                <strong>Duplicate detector:</strong> {mergeClient.duplicate_profiles.length} likely platform match{mergeClient.duplicate_profiles.length === 1 ? "" : "es"} found.
              </div>
            )}
            <label className="mt-4 block text-xs font-semibold text-gray-600">
              Signed-up CDS Space account
              <select value={mergeProfileId} onChange={(event) => setMergeProfileId(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-400">
                <option value="">Choose account</option>
                {platformProfiles
                  .filter((profile) => !clients.some((client) => client.manual_client_id !== mergeClient.manual_client_id && client.platform_user_id === profile.id))
                  .map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.company_name || profile.full_name || profile.email} ({profile.email}){mergeClient.duplicate_profiles.some((match) => match.id === profile.id) ? " - detected match" : ""}
                    </option>
                  ))}
              </select>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => { setMergeClient(null); setMergeProfileId(""); }} className="rounded-xl border border-gray-200 px-4 py-2.5 text-xs font-bold text-gray-600">Cancel</button>
              <button type="button" disabled={isLoading || !mergeProfileId} onClick={() => void mergeAccount()} className="inline-flex items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Merge client
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition" />
    </div>
  );
}
