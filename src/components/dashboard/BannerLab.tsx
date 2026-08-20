"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { appAlert } from "@/lib/app-notify";
import { bannerMaterialPrice, type BannerCommerceConfig, type BannerMaterial } from "@/lib/banner-commerce";
import { BannerLabStepper } from "./banner-lab/BannerLabStepper";
import { BannerLabPreview } from "./banner-lab/BannerLabPreview";
import { Step1_Dimensions } from "./banner-lab/Step1_Dimensions";
import { Step2_VisualExecution } from "./banner-lab/Step2_VisualExecution";
import { Step3_Fulfillment } from "./banner-lab/Step3_Fulfillment";
import { BannerStudioSuccessModal } from "./banner-lab/BannerStudioSuccessModal";
import type { BannerFormData, BannerLabProps, Step } from "./banner-lab/types";
import type { AssetFile } from "@/components/shared/AssetHub";

const EMPTY_FORM: BannerFormData = {
  productId: "",
  isCustom: false,
  customWidth: "",
  customHeight: "",
  dimensionUnit: "cm",
  quality: "Standard",
  size: "",
  environment: "Indoor",
  executionMode: "Create",
  designBrief: "",
  designContent: "",
  referenceNotes: "",
  assets: [],
  assetUrls: [],
  readyFiles: [],
  readyFileUrls: [],
  readyFile: null,
  readyFileUrl: null,
  draftId: null,
  discountCode: "",
  discountPercentage: 0,
  quantity: 1,
  fulfillmentType: "Door-to-door",
  shipping: {
    countryId: "",
    country: "",
    state: "",
    city: "",
    streetAddress: "",
    recipientName: "",
    phoneNumber: "",
    instructions: "",
    pickupLocationId: "",
    pickupStation: "",
  },
  isSubmitting: false,
};

export const BannerLab = ({ onBack, draftId }: BannerLabProps) => {
  const [step, setStep] = useState<Step>(1);
  const [config, setConfig] = useState<BannerCommerceConfig | null>(null);
  const [formData, setFormData] = useState<BannerFormData>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [autosaveError, setAutosaveError] = useState("");
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const [quotationNumber, setQuotationNumber] = useState<string | null>(null);
  const interactedRef = useRef(false);
  const lastSavedSnapshotRef = useRef("");
  const draftIdRef = useRef<string | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    draftIdRef.current = null;
    Promise.all([
      fetch("/api/banners/config", { cache: "no-store" }),
      fetch(draftId ? `/api/banners/draft?id=${encodeURIComponent(draftId)}` : "/api/banners/draft", { cache: "no-store" }),
    ])
      .then(async ([configResponse, draftResponse]) => {
        const next = await configResponse.json();
        if (!configResponse.ok) throw new Error(next.error || "Could not load banner options.");
        const draftResult = draftResponse.ok ? await draftResponse.json() : { draft: null, artworkPreviews: [] };
        return { next: next as BannerCommerceConfig, draftResult };
      })
      .then(({ next, draftResult }) => {
        setConfig(next);
        const currency = next.currency || "USD";
        const product = next.products.find((item) => bannerMaterialPrice(item, "Standard", currency) > 0 || bannerMaterialPrice(item, "Premium", currency) > 0) || next.products[0];
        const material: BannerMaterial = product && bannerMaterialPrice(product, "Standard", currency) <= 0 && bannerMaterialPrice(product, "Premium", currency) > 0
          ? "Premium"
          : "Standard";
        const country = next.countries.find((item) => item.country_code === "NG") || next.countries[0];
        const defaults: BannerFormData = {
          ...EMPTY_FORM,
          productId: product?.id || "",
          isCustom: false,
          size: product ? `${Number(product.width_cm)}x${Number(product.height_cm)}` : "",
          quality: material,
          environment: (product?.environment || "Indoor") as BannerFormData["environment"],
          shipping: { ...EMPTY_FORM.shipping, countryId: country?.id || "", country: country?.country_name || "" },
        };
        const draft = draftResult?.draft as Record<string, unknown> | null;
        if (!draft) {
          setFormData(defaults);
          return;
        }
        const payload = draft.draft_payload && typeof draft.draft_payload === "object" ? draft.draft_payload as Partial<BannerFormData> : {};
        const previews = Array.isArray(draftResult.artworkPreviews) ? draftResult.artworkPreviews : [];
        const readyFiles = previews.map((item: { path: string; url: string | null; name: string }) => {
          const extension = item.name.split(".").pop()?.toLowerCase() || "";
          const file = new File([], item.name) as AssetFile;
          file.storagePath = item.path;
          file.preview = item.url;
          file.previewKind = ["png", "jpg", "jpeg", "svg"].includes(extension) ? "image" : extension === "pdf" ? "pdf" : undefined;
          file.status = "success";
          file.progress = 100;
          return file;
        });
        const readyFileUrls = previews.map((item: { path: string }) => item.path);
        const restoredDraftId = String(draft.id || "") || null;
        draftIdRef.current = restoredDraftId;
        setFormData({
          ...defaults,
          ...payload,
          shipping: { ...defaults.shipping, ...(payload.shipping || {}) },
          draftId: restoredDraftId,
          readyFiles,
          readyFileUrls,
          readyFile: readyFiles[0] || null,
          readyFileUrl: readyFileUrls[0] || null,
          isSubmitting: false,
        });
        setStep(Math.max(1, Math.min(3, Number(draft.draft_step) || 1)) as Step);
      })
      .catch((error) => void appAlert(error.message))
      .finally(() => setLoading(false));
  }, [draftId]);

  const designService = useMemo(() => config?.designServices.find((service) => service.code === "banner-new-design") || null, [config]);
  const updateFormData = (updates: Partial<BannerFormData> | ((previous: BannerFormData) => BannerFormData)) => {
    interactedRef.current = true;
    setFormData((previous) => typeof updates === "function" ? updates(previous) : { ...previous, ...updates });
  };

  const serializableDraft = useMemo(() => {
    const { assets: _assets, readyFiles: _readyFiles, readyFile: _readyFile, isSubmitting: _isSubmitting, draftId: _draftId, ...payload } = formData;
    return payload;
  }, [formData]);
  const draftSnapshot = useMemo(() => JSON.stringify({ step, payload: serializableDraft }), [serializableDraft, step]);

  const persistDraft = useCallback((payload: typeof serializableDraft, currentStep: Step) => {
    const operation = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const response = await fetch("/api/banners/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draftId: draftIdRef.current, step: currentStep, payload }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "The banner draft could not be saved.");
        const savedDraftId = String(result.draft?.id || "");
        if (!savedDraftId) throw new Error(result.reason || "The draft save did not return a draft record.");
        draftIdRef.current = savedDraftId;
        setFormData((current) => current.draftId === savedDraftId ? current : { ...current, draftId: savedDraftId });
        return result;
      });
    saveQueueRef.current = operation.then(() => undefined, () => undefined);
    return operation;
  }, []);

  useEffect(() => {
    if (loading || !config || !interactedRef.current || formData.isSubmitting || draftSnapshot === lastSavedSnapshotRef.current) return;
    const timeout = window.setTimeout(async () => {
      setAutosaveStatus("saving");
      setAutosaveError("");
      try {
        await persistDraft(serializableDraft, step);
        lastSavedSnapshotRef.current = draftSnapshot;
        setAutosaveStatus("saved");
      } catch (error) {
        console.error("Banner autosave failed:", error);
        setAutosaveError(error instanceof Error ? error.message : "The banner draft could not be saved.");
        setAutosaveStatus("error");
      }
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [config, draftSnapshot, formData.isSubmitting, loading, persistDraft, serializableDraft, step]);

  const send = async (status?: "DRAFT") => {
    const response = await fetch("/api/banners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...formData, status }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not submit the banner order.");
    return payload;
  };

  const saveDraft = async () => {
    if (!formData.isCustom && !formData.productId) return void appAlert("Choose a banner size before saving the draft.");
    setSavingDraft(true);
    setAutosaveStatus("saving");
    setAutosaveError("");
    try {
      await persistDraft(serializableDraft, step);
      lastSavedSnapshotRef.current = draftSnapshot;
      setAutosaveStatus("saved");
      onBack();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save the draft.";
      setAutosaveError(message);
      setAutosaveStatus("error");
      await appAlert(message);
    } finally { setSavingDraft(false); }
  };

  const submit = async () => {
    updateFormData({ isSubmitting: true });
    try {
      const result = await send();
      if (result.quotation) {
        setQuotationNumber(result.quotation.quotation_number || "Quotation request");
        setInvoiceUrl(null);
      } else {
        setInvoiceUrl(result.invoice?.public_token ? `/invoice/${result.invoice.public_token}` : null);
        setQuotationNumber(null);
      }
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "Could not submit the banner order.");
    } finally {
      updateFormData({ isSubmitting: false });
    }
  };

  if (loading || !config) return <div className="grid min-h-[65vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[#0A4FE8]" /></div>;
  const currency = config.currency || "USD";
  const selectedProduct = config.products.find((product) => product.id === formData.productId) || null;

  return (
    <div className="grid min-h-[calc(100vh-96px)] items-stretch gap-4 bg-brand-bg xl:grid-cols-[minmax(0,1fr)_minmax(420px,40vw)]">
      <section className="overflow-hidden rounded-[24px] border border-brand-stroke bg-white shadow-[0_12px_40px_rgba(13,27,57,0.05)]">
        <div className="mx-auto max-w-[820px] px-4 py-6 sm:px-7 lg:px-10 lg:py-9">
          <header className="flex items-center justify-between gap-4">
            <button type="button" onClick={step === 1 ? onBack : () => setStep((step - 1) as Step)} disabled={formData.isSubmitting || savingDraft} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-[#0D1B39] transition hover:bg-slate-50 disabled:opacity-40" aria-label="Go back"><ArrowLeft className="h-4 w-4" /></button>
            <div className="text-center"><h1 className="text-[19px] font-bold tracking-tight text-[#0D1B39] sm:text-[23px]">Banner Studio</h1><p className="text-[11px] font-medium text-slate-400">Prices in {currency}</p></div>
            <button type="button" onClick={saveDraft} disabled={formData.isSubmitting || savingDraft} title={autosaveError || undefined} className="min-w-[104px] text-right text-[11px] font-bold text-[#0A4FE8] disabled:opacity-40">{savingDraft || autosaveStatus === "saving" ? "Saving…" : autosaveStatus === "saved" ? "Saved · exit" : autosaveStatus === "error" ? "Retry save" : "Save & exit"}</button>
          </header>
          {autosaveStatus === "error" && autosaveError && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[10px] font-medium text-red-700">Draft not saved: {autosaveError}</p>}
          <div className="my-8 flex justify-center"><BannerLabStepper currentStep={step} /></div>
          <AnimatePresence mode="wait">
            {step === 1 && <Step1_Dimensions key="dimensions" formData={formData} products={config.products} currency={currency} updateFormData={updateFormData} onNext={() => setStep(2)} />}
            {step === 2 && <Step2_VisualExecution key="artwork" formData={formData} currency={currency} designService={designService} updateFormData={updateFormData} onNext={() => setStep(3)} onPrev={() => setStep(1)} />}
            {step === 3 && <Step3_Fulfillment key="fulfilment" formData={formData} currency={currency} products={config.products} designService={designService} countries={config.countries} deliveryZones={config.deliveryZones} pickupLocations={config.pickupLocations} updateFormData={updateFormData} onPrev={() => setStep(2)} onSubmit={submit} />}
          </AnimatePresence>
        </div>
      </section>

      <aside className={cn("hidden min-h-[calc(100vh-96px)] overflow-hidden rounded-[24px] border border-brand-stroke bg-white xl:block")}><BannerLabPreview formData={formData} product={selectedProduct} /></aside>

      <BannerStudioSuccessModal isOpen={Boolean(invoiceUrl || quotationNumber)} invoiceUrl={invoiceUrl} quotationNumber={quotationNumber} onClose={() => { setInvoiceUrl(null); setQuotationNumber(null); onBack(); }} />
    </div>
  );
};
