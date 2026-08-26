"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  Building2,
  CheckCircle2,
  ClipboardPenLine,
  Download,
  FileArchive,
  FileText,
  Image as ImageIcon,
  ListChecks,
  Loader2,
  Palette,
  Save,
  Target,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useClientAccount } from "@/components/dashboard/ClientAccountProvider";
import {
  ASSET_OPTIONS,
  EMPTY_BRAND_BRIEF_DRAFT,
  TIMELINE_OPTIONS,
  briefToDraft,
  budgetRangesForCurrency,
  type BrandBrief,
  type BrandBriefDraft,
} from "@/lib/brand-brief";
import { CLIENT_BILLING_CURRENCY_OPTIONS } from "@/lib/client-billing";

type ClientBrandBrief = BrandBrief;

interface BrandAsset {
  id: string;
  file_name: string;
  file_size: number;
  file_kind: "image" | "pdf" | "office" | "archive" | "document";
  created_at: string;
  download_url: string | null;
}

const inputClass = "mt-2 w-full rounded-[8px] border border-[#DDE4F2] bg-white px-3.5 py-3 text-[13px] text-brand-navy outline-none transition placeholder:text-[#A6B0C8] focus:border-brand-blue/45 focus:ring-4 focus:ring-brand-blue/[0.06]";
const labelClass = "text-[11px] font-semibold uppercase tracking-[0.08em] text-[#69738D]";

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function assetIcon(kind: BrandAsset["file_kind"]) {
  if (kind === "image") return ImageIcon;
  if (kind === "archive") return FileArchive;
  return FileText;
}

export function ClientBrandBriefWorkspace() {
  const { account } = useClientAccount();
  const [draft, setDraft] = useState<BrandBriefDraft>(() => ({
    ...EMPTY_BRAND_BRIEF_DRAFT,
    contact_name: account.fullName,
    contact_email: account.email,
    contact_phone: account.phoneNumber,
    budget_currency: account.billingCurrency || "",
  }));
  const [brief, setBrief] = useState<ClientBrandBrief | null>(null);
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/client/brand-brief", { credentials: "include" }),
      fetch("/api/client/brand-assets", { credentials: "include" }),
    ]).then(async ([briefResponse, assetsResponse]) => {
      const briefPayload = await briefResponse.json().catch(() => ({}));
      const assetPayload = await assetsResponse.json().catch(() => ({}));
      if (!active) return;
      if (briefResponse.ok && briefPayload.brief) {
        const loaded = briefPayload.brief as ClientBrandBrief;
        setBrief(loaded);
        const loadedDraft = briefToDraft(loaded);
        setDraft({
          ...loadedDraft,
          budget_currency: loadedDraft.budget_currency || account.billingCurrency || "",
        });
      } else if (briefResponse.ok) {
        setDraft({
          ...EMPTY_BRAND_BRIEF_DRAFT,
          contact_name: account.fullName,
          contact_email: account.email,
          contact_phone: account.phoneNumber,
          budget_currency: account.billingCurrency || "",
        });
      }
      if (assetsResponse.ok) setAssets(assetPayload.assets || []);
    }).catch(() => undefined).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [account.email, account.fullName, account.phoneNumber, account.billingCurrency]);

  const completedFields = useMemo(
    () => Object.values(draft).filter((value) => Array.isArray(value) ? value.length > 0 : value.trim().length > 0).length,
    [draft],
  );
  const completion = Math.round((completedFields / Object.keys(EMPTY_BRAND_BRIEF_DRAFT).length) * 100);
  // The brief carries its own budget currency. It starts from the currency the
  // client chose during onboarding, but they can quote this project in another
  // one, and the ranges follow whatever is selected here.
  const budgetCurrency = draft.budget_currency || "";
  const budgetRanges = useMemo(() => budgetRangesForCurrency(budgetCurrency), [budgetCurrency]);

  const updateField = <K extends keyof BrandBriefDraft>(field: K, value: BrandBriefDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setNotice("");
  };

  const toggleAsset = (asset: string) => {
    updateField(
      "assets_needed",
      draft.assets_needed.includes(asset)
        ? draft.assets_needed.filter((item) => item !== asset)
        : [...draft.assets_needed, asset],
    );
  };

  const saveBrief = async (submit: boolean) => {
    setError("");
    setNotice("");
    if (!draft.brand_name.trim()) {
      setError("Add your brand name before saving the brief.");
      return;
    }
    if (!draft.contact_email.trim()) {
      setError("Add a contact email before saving the brief.");
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch("/api/client/brand-brief", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, submit }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not save your brand brief.");
      setBrief(payload.brief);
      setNotice(submit ? "Brand brief submitted to CDS Space." : "Draft saved to your account.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save your brand brief.");
    } finally {
      setIsSaving(false);
    }
  };

  const uploadFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    setError("");
    setNotice("");
    setIsUploading(true);
    try {
      const form = new FormData();
      files.forEach((file) => form.append("files", file));
      const response = await fetch("/api/client/brand-assets", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not upload the selected files.");
      setAssets((current) => [...(payload.assets || []), ...current]);
      setNotice(`${files.length} brand ${files.length === 1 ? "file" : "files"} added to your account.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload the selected files.");
    } finally {
      setIsUploading(false);
    }
  };

  const removeAsset = async (asset: BrandAsset) => {
    setError("");
    const response = await fetch(`/api/client/brand-assets?id=${encodeURIComponent(asset.id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error || "Could not remove that brand asset.");
      return;
    }
    setAssets((current) => current.filter((item) => item.id !== asset.id));
    setNotice("Brand asset removed.");
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] p-5 sm:p-6 lg:p-8 2xl:p-10" data-client-brand-workspace>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.03em] text-brand-navy sm:text-[34px]">Your Brand Brief</h1>
          <p className="mt-1 max-w-[720px] text-[13px] leading-6 text-[#69738D]">
            Complete the same discovery questionnaire CDS Space uses for every brand, and attach any useful reference files.
          </p>
        </div>
        <div className="rounded-[8px] border border-[#E1E7F2] bg-white px-4 py-3 shadow-[0_8px_24px_rgba(15,40,90,0.04)]">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#9AA4BA]">Account owner</p>
          <p className="mt-1 text-[12px] font-semibold text-brand-navy">{account.fullName || account.email}</p>
          <p className="mt-0.5 max-w-[290px] truncate font-mono text-[9px] text-[#8E99B7]">{account.publicUserId}</p>
        </div>
      </div>

      <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard label="Brief status" value={brief?.status === "submitted" ? "Submitted" : brief ? "Draft" : "Not started"} icon={brief?.status === "submitted" ? CheckCircle2 : FileText} tone="blue" />
        <SummaryCard label="Brief completion" value={`${completion}%`} icon={Target} tone="purple" />
        <SummaryCard label="Reference files" value={`${assets.length}`} icon={Palette} tone="green" />
      </div>

      {(error || notice) && (
        <div className={`mt-5 rounded-[8px] border px-4 py-3 text-[12px] ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`} role="status">
          {error || notice}
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.7fr)]">
        <section className="rounded-[16px] border border-[#E1E7F2] bg-white shadow-[0_16px_48px_rgba(15,40,90,0.05)]">
          <div className="flex flex-col gap-4 border-b border-[#EDF1F7] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <div className="flex items-center gap-2">
                <ClipboardPenLine className="h-4 w-4 text-brand-blue" />
                <h2 className="text-[17px] font-bold text-brand-navy">Complete your brand brief</h2>
              </div>
              <p className="mt-1 text-[11px] text-[#8A94AA]">Save a draft at any point and submit when the direction feels complete.</p>
            </div>
            {isLoading && <Loader2 className="h-5 w-5 animate-spin text-brand-blue" />}
          </div>

          <div className="space-y-7 p-5 sm:p-6">
            <FormSection icon={Building2} title="01 · The Brand" description="The essential information that identifies your brand.">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <TextField label="Brand name" value={draft.brand_name} onChange={(value) => updateField("brand_name", value)} placeholder="Your brand name" required />
                <TextField label="Tagline / one-liner" value={draft.brand_tagline} onChange={(value) => updateField("brand_tagline", value)} placeholder="The one sentence you'd use to describe it" />
                <TextField label="Industry" value={draft.industry} onChange={(value) => updateField("industry", value)} placeholder="e.g. Hospitality, Fintech, Fashion" />
                <TextArea label="What does your brand do?" value={draft.brand_description} onChange={(value) => updateField("brand_description", value)} placeholder="What you sell or serve, who it's for, and how it works." />
              </div>
            </FormSection>

            <FormSection icon={Building2} title="02 · Who we can reach" description="Contact details for the person responsible for this brief.">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <TextField label="Your name" value={draft.contact_name} onChange={(value) => updateField("contact_name", value)} placeholder="Full name" />
                <TextField label="Email" type="email" value={draft.contact_email} onChange={(value) => updateField("contact_email", value)} placeholder="you@brand.com" required />
                <TextField label="Phone or WhatsApp" value={draft.contact_phone} onChange={(value) => updateField("contact_phone", value)} placeholder="+234…" />
              </div>
            </FormSection>

            <FormSection icon={Target} title="03 · Audience & Market" description="Help the team understand who the brand serves and why it matters.">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <TextArea label="Who are you trying to reach?" value={draft.target_audience} onChange={(value) => updateField("target_audience", value)} placeholder="Describe your ideal customer: age, lifestyle, habits and location." />
                <TextArea label="Competitors / brands you admire" value={draft.competitors} onChange={(value) => updateField("competitors", value)} placeholder="List names or paste links." />
                <div className="md:col-span-2">
                  <TextArea label="What makes you different?" value={draft.unique_selling_point} onChange={(value) => updateField("unique_selling_point", value)} placeholder="What do you do better, differently, or only you can claim?" />
                </div>
              </div>
            </FormSection>

            <FormSection icon={Palette} title="04 · Brand Identity" description="Define the feeling, values and visual territory of the brand.">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <TextArea label="Brand personality" value={draft.brand_personality} onChange={(value) => updateField("brand_personality", value)} placeholder="e.g. Bold, warm, precise, playful." />
                <TextArea label="Core values" value={draft.brand_values} onChange={(value) => updateField("brand_values", value)} placeholder="What your brand stands for culturally, ethically and creatively." />
                <TextArea label="Design preferences" value={draft.design_preferences} onChange={(value) => updateField("design_preferences", value)} placeholder="Colours, styles, typography or things to avoid." />
                <TextArea label="Inspiration and references" value={draft.inspiration_references} onChange={(value) => updateField("inspiration_references", value)} placeholder="Brands, links or visual references you admire." />
              </div>
            </FormSection>

            <FormSection icon={ListChecks} title="05 · Scope & Goals" description="Tell us what CDS Space should create and what success looks like.">
              <div>
                <span className={labelClass}>What do you need from CDS Space?</span>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {ASSET_OPTIONS.map((asset) => {
                    const active = draft.assets_needed.includes(asset);
                    return (
                      <button key={asset} type="button" onClick={() => toggleAsset(asset)} className={`flex items-center gap-2.5 rounded-[8px] border px-3.5 py-2.5 text-left text-[12px] font-semibold transition ${active ? "border-brand-blue bg-brand-blue text-white" : "border-[#DDE4F2] bg-white text-brand-navy hover:border-brand-blue/40"}`}>
                        <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border ${active ? "border-white/50 bg-white/15" : "border-[#C9D2E3] bg-[#F7F9FC]"}`}>{active && <CheckCircle2 className="h-3 w-3" />}</span>
                        {asset}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <TextArea label="Short-term goals" value={draft.goals} onChange={(value) => updateField("goals", value)} placeholder="What does success look like in the next 3–6 months?" />
                <TextArea label="Long-term vision" value={draft.long_term_vision} onChange={(value) => updateField("long_term_vision", value)} placeholder="Where do you see the brand in 2–5 years?" />
                <label>
                  <span className={labelClass}>Budget currency</span>
                  <select
                    className={inputClass}
                    value={budgetCurrency}
                    onChange={(event) => {
                      // Ranges are currency specific, so switching currency clears the range.
                      setDraft((current) => ({ ...current, budget_currency: event.target.value, budget_range: "" }));
                      setNotice("");
                    }}
                  >
                    <option value="">Select a currency</option>
                    {CLIENT_BILLING_CURRENCY_OPTIONS.map((option) => (
                      <option key={option.code} value={option.code}>{option.symbol} {option.name} ({option.code})</option>
                    ))}
                  </select>
                </label>
                {budgetCurrency ? (
                  <SelectField label={`Budget range (${budgetCurrency})`} value={draft.budget_range} onChange={(value) => updateField("budget_range", value)} options={budgetRanges} placeholder="Select a range" />
                ) : (
                  <label>
                    <span className={labelClass}>Budget range</span>
                    <p className="mt-1 text-[13px] leading-6 text-brand-body/60">Choose a budget currency and the matching ranges will appear here.</p>
                  </label>
                )}
                <SelectField label="Timeline" value={draft.timeline} onChange={(value) => updateField("timeline", value)} options={TIMELINE_OPTIONS} placeholder="Select a timeline" />
                <div className="md:col-span-2"><TextArea label="Anything else we should know?" value={draft.additional_notes} onChange={(value) => updateField("additional_notes", value)} placeholder="Anything important that did not fit above." /></div>
              </div>
            </FormSection>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-[#EDF1F7] p-5 sm:flex-row sm:items-center sm:justify-end sm:p-6">
            <button type="button" onClick={() => saveBrief(false)} disabled={isSaving} className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] border border-[#DDE4F2] bg-white px-5 text-[12px] font-semibold text-brand-navy transition hover:bg-[#F7F9FC] disabled:opacity-50">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save draft
            </button>
            <button type="button" onClick={() => saveBrief(true)} disabled={isSaving} className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] bg-[#0A4FE8] px-5 text-[12px] font-semibold text-white shadow-[0_8px_20px_rgba(0,67,220,0.2)] transition hover:brightness-105 disabled:opacity-50">
              <CheckCircle2 className="h-4 w-4" /> Submit to CDS Space
            </button>
          </div>
        </section>

        <aside className="h-fit rounded-[16px] border border-[#E1E7F2] bg-white p-5 shadow-[0_16px_48px_rgba(15,40,90,0.05)] sm:p-6 xl:sticky xl:top-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-emerald-50 text-emerald-600">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-[16px] font-bold text-brand-navy">Attach reference files</h2>
              <p className="mt-1 text-[11px] leading-5 text-[#8A94AA]">Add an existing guideline, logo, references, source files or a ZIP package for the team.</p>
            </div>
          </div>

          <label className="mt-5 flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-[12px] border border-dashed border-brand-blue/30 bg-brand-blue/[0.035] px-5 py-6 text-center transition hover:border-brand-blue/60 hover:bg-brand-blue/[0.055]">
            {isUploading ? <Loader2 className="h-7 w-7 animate-spin text-brand-blue" /> : <UploadCloud className="h-7 w-7 text-brand-blue" />}
            <span className="mt-3 text-[12px] font-semibold text-brand-navy">{isUploading ? "Uploading securely…" : "Choose brand files"}</span>
            <span className="mt-1 text-[10px] leading-4 text-[#8A94AA]">PNG, JPG, WEBP, PDF, Office or ZIP · 25MB each</span>
            <input className="sr-only" type="file" multiple disabled={isUploading} onChange={uploadFiles} accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.doc,.docx,.ppt,.pptx,.zip" />
          </label>

          <div className="mt-6 flex items-center justify-between">
            <h3 className="text-[12px] font-bold text-brand-navy">Your reference files</h3>
            <span className="rounded-[4px] bg-[#F2F5FA] px-2 py-1 text-[9px] font-bold text-[#76819B]">{assets.length} files</span>
          </div>

          <div className="mt-3 space-y-2">
            {assets.length === 0 ? (
              <div className="rounded-[8px] border border-[#EDF1F7] bg-[#FAFBFD] px-4 py-5 text-center">
                <FileText className="mx-auto h-5 w-5 text-[#B7C0D2]" />
                <p className="mt-2 text-[10px] text-[#8A94AA]">No reference files uploaded yet.</p>
              </div>
            ) : assets.map((asset) => {
              const Icon = assetIcon(asset.file_kind);
              return (
                <div key={asset.id} className="flex items-center gap-3 rounded-[8px] border border-[#E8EDF5] p-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#F2F6FC] text-brand-blue">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold text-brand-navy">{asset.file_name}</p>
                    <p className="mt-0.5 text-[9px] text-[#9AA4BA]">{formatBytes(asset.file_size)}</p>
                  </div>
                  {asset.download_url && (
                    <a href={asset.download_url} target="_blank" rel="noreferrer" className="rounded-[4px] p-1.5 text-[#8A94AA] transition hover:bg-blue-50 hover:text-brand-blue" aria-label={`Download ${asset.file_name}`}>
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <button type="button" onClick={() => removeAsset(asset)} className="rounded-[4px] p-1.5 text-[#A5AEC0] transition hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${asset.file_name}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-5 rounded-[8px] bg-[#F6F8FC] p-3 text-[10px] leading-5 text-[#76819B]">
            Files are stored privately under your account ID and shared only with the CDS Space team working on your brand.
          </div>
        </aside>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof FileText; tone: "blue" | "purple" | "green" }) {
  const colours = {
    blue: "bg-blue-50 text-brand-blue",
    purple: "bg-purple-50 text-purple-600",
    green: "bg-emerald-50 text-emerald-600",
  };
  return (
    <div className="flex items-center gap-3 rounded-[12px] border border-[#E2E8F2] bg-white p-4 shadow-[0_8px_24px_rgba(15,40,90,0.035)]">
      <div className={`flex h-9 w-9 items-center justify-center rounded-[8px] ${colours[tone]}`}><Icon className="h-4 w-4" /></div>
      <div>
        <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#9AA4BA]">{label}</p>
        <p className="mt-0.5 text-[14px] font-bold text-brand-navy">{value}</p>
      </div>
    </div>
  );
}

function FormSection({ icon: Icon, title, description, children }: { icon: typeof FileText; title: string; description: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#F2F6FC] text-brand-blue"><Icon className="h-4 w-4" /></div>
        <div>
          <h3 className="text-[13px] font-bold text-brand-navy">{title}</h3>
          <p className="mt-0.5 text-[10px] text-[#8A94AA]">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, required, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; required?: boolean; type?: string }) {
  return (
    <label>
      <span className={labelClass}>{label}{required && <span className="ml-1 text-rose-500">*</span>}</span>
      <input type={type} className={inputClass} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function TextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label>
      <span className={labelClass}>{label}</span>
      <textarea className={`${inputClass} min-h-[104px] resize-y leading-5`} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function SelectField({ label, value, onChange, options, placeholder }: { label: string; value: string; onChange: (value: string) => void; options: readonly string[]; placeholder: string }) {
  return (
    <label>
      <span className={labelClass}>{label}</span>
      <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}
