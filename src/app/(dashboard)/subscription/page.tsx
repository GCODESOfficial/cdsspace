"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { FileText } from "lucide-react";
import { ActiveSubscriptionView } from "@/components/subscription/ActiveSubscriptionView";
import { SubscriptionPlanCatalog } from "@/components/subscription/SubscriptionPlanCatalog";
import { useClientAccount } from "@/components/dashboard/ClientAccountProvider";
import { storageService } from "@/lib/supabase/storage";
import Link from "next/link";

interface SubscriptionRecord {
  id: string;
  plan: string;
  industry: string;
  company_name: string;
  design_count: number;
  design_quantity?: number;
}

interface PendingSubscription {
  id: string;
  plan: string;
  industry: string;
  design_quantity: number;
  invoice: {
    invoice_number: string;
    public_token: string;
    total: number;
    currency: string;
    status: string;
  } | null;
}

export default function SubscriptionPage() {
  const { account } = useClientAccount();
  const [subscription, setSubscription] = useState<SubscriptionRecord | null>(null);
  const [pending, setPending] = useState<PendingSubscription | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const uploadControllers = useRef<Record<number, AbortController>>({});

  useEffect(() => {
    let cancelled = false;
    async function loadSubscription() {
      try {
        const response = await fetch("/api/subscription", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not load the subscription.");
        if (!cancelled) {
          setSubscription(data.subscription || null);
          setPending(data.pending || null);
          setCatalogOpen(!data.subscription);
        }
      } catch (error) {
        console.error("[subscription] load failed", error instanceof Error ? error.message : error);
        if (!cancelled) setCatalogOpen(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadSubscription();
    return () => { cancelled = true; };
  }, []);

  async function handleFileUpload(
    file: File,
    index: number,
    customSetter?: (updater: (previous: any[]) => any[]) => void,
  ) {
    const controller = new AbortController();
    uploadControllers.current[index] = controller;
    if (!customSetter) return;

    try {
      const path = storageService.generatePath(account.userId, file.name);
      await storageService.uploadFile(file, "brand-assets", path);
      if (controller.signal.aborted) return;
      customSetter((previous) => previous.map((entry, entryIndex) => entryIndex === index ? {
        ...entry,
        status: "success",
        progress: 100,
        storagePath: path,
      } : entry));
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("[subscription] asset upload failed", error instanceof Error ? error.message : error);
      customSetter((previous) => previous.map((entry, entryIndex) => entryIndex === index ? {
        ...entry,
        status: "error",
      } : entry));
    } finally {
      delete uploadControllers.current[index];
    }
  }

  function handleCancelUpload(index: number) {
    uploadControllers.current[index]?.abort();
    delete uploadControllers.current[index];
  }

  async function handleFileDelete(file: { storagePath?: string }, index: number) {
    handleCancelUpload(index);
    if (!file.storagePath) return;
    await storageService.deleteFile("brand-assets", file.storagePath).catch((error) => {
      console.error("[subscription] asset delete failed", error instanceof Error ? error.message : error);
    });
  }

  if (loading) {
    return (
      <div className="grid h-full min-h-[420px] place-items-center bg-white">
        <div className="relative h-20 w-20 animate-pulse">
          <Image src="/navbar/CDS Logo.svg" alt="CDS Space" fill priority className="object-contain" />
        </div>
      </div>
    );
  }

  if (catalogOpen || !subscription) {
    return (
      <SubscriptionPlanCatalog
        pendingInvoice={pending?.invoice}
        onBack={subscription ? () => setCatalogOpen(false) : undefined}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[#F4F6FB]">
      {pending?.invoice && ["sent", "overdue"].includes(pending.invoice.status) && (
        <div className="mx-4 mt-4 flex flex-col gap-3 rounded-[14px] border border-blue-200 bg-blue-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between lg:mx-6">
          <div>
            <p className="text-sm font-semibold text-brand-navy">A plan change is awaiting payment</p>
            <p className="mt-0.5 text-xs text-brand-body">Invoice {pending.invoice.invoice_number} is ready. Your current plan remains active until payment is verified.</p>
          </div>
          <Link href={`/invoice/${pending.invoice.public_token}`} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-[10px] bg-[#0A4FE8] px-4 text-sm font-semibold text-white">
            <FileText className="h-4 w-4" /> Open invoice
          </Link>
        </div>
      )}
      <div className="min-h-0 flex-1">
        <ActiveSubscriptionView
          plan={subscription.plan}
          industry={subscription.industry}
          designCount={subscription.design_count || 0}
          designLimit={subscription.design_quantity}
          companyName={subscription.company_name}
          onUpgrade={() => setCatalogOpen(true)}
          onFileUpload={handleFileUpload}
          onFileRemoved={handleFileDelete}
          onCancelUpload={handleCancelUpload}
        />
      </div>
    </div>
  );
}
