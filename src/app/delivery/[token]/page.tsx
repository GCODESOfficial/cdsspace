import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import {
  CalendarDays,
  ExternalLink,
  FolderKanban,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";
import { DeliveryAssetBrowser } from "@/components/deliveries/DeliveryAssetBrowser";
import { UniversalShareButton } from "@/components/share/UniversalShareButton";
import { getPublicDelivery, getPublicDeliverySummary } from "@/lib/public-delivery";
import { publicDeliveryPath } from "@/lib/delivery-links";
import { absolutePublicUrl } from "@/lib/public-site";

type Params = Promise<{ token: string }>;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { token } = await params;
  const delivery = await getPublicDeliverySummary(token).catch(() => null);
  const title = delivery ? `${delivery.title} · CDS Space Delivery` : "Delivery · CDS Space";
  const description = delivery?.description || "A completed client delivery from CDS Space.";
  const publicUrl = delivery
    ? absolutePublicUrl(publicDeliveryPath(delivery.title, delivery.token))
    : absolutePublicUrl("/");
  const coverUrl = delivery?.cover_version
    ? absolutePublicUrl(`/api/delivery/${delivery.token}/cover?v=${delivery.cover_version}`)
    : null;
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      type: "article",
      siteName: "CDS Space",
      url: publicUrl,
      ...(coverUrl ? { images: [{ url: coverUrl, width: 1200, height: 630, alt: `${delivery!.title} delivery cover` }] } : {}),
    },
    twitter: {
      card: coverUrl ? "summary_large_image" : "summary",
      title,
      description,
      ...(coverUrl ? { images: [coverUrl] } : {}),
    },
  };
}

export default async function PublicDeliveryPage({ params }: { params: Params }) {
  const { token } = await params;
  const delivery = await getPublicDeliverySummary(token).catch(() => null);

  if (!delivery) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#F3F6FC] px-5">
        <section className="w-full max-w-lg rounded-3xl border border-white bg-white p-8 text-center shadow-[0_24px_80px_rgba(13,27,57,0.10)]">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-[#0A4FE8]"><ShieldCheck className="h-7 w-7" /></div>
          <h1 className="mt-5 text-2xl font-bold text-[#07133B]">This delivery link is unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-[#69738D]">The link may have been disabled or the delivery has not been released yet.</p>
          <Link href="/" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#0A4FE8] px-5 text-sm font-bold text-white">Go to CDS Space</Link>
        </section>
      </main>
    );
  }

  const deliveredAt = delivery.published_at || delivery.created_at;
  const publicPath = publicDeliveryPath(delivery.title, delivery.token);
  return (
    <main className="min-h-screen bg-[#F3F6FC] px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between gap-4 rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-[0_12px_40px_rgba(15,40,90,0.08)] sm:px-5">
          <Link href="/" aria-label="CDS Space home"><Image src="/navbar/CDS Logo.svg" alt="CDS Space" width={82} height={32} className="h-8 w-auto object-contain" priority /></Link>
          <UniversalShareButton title={delivery.title} text={`View ${delivery.title}, a completed delivery from CDS Space.`} url={publicPath} />
        </header>

        <section className="mt-6 overflow-hidden rounded-3xl border border-[#DDE5F2] bg-white shadow-[0_24px_80px_rgba(15,40,90,0.10)]">
          <div className="bg-[#0A4FE8] px-5 py-8 text-white sm:px-8 sm:py-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-semibold text-white/90">
              <PackageCheck className="h-3.5 w-3.5" /> Completed {delivery.delivery_type === "brand_identity" ? "brand identity" : "design delivery"}
            </div>
            <h1 className="mt-5 max-w-3xl text-3xl font-bold sm:text-4xl">{delivery.title}</h1>
            {delivery.description && <p className="mt-3 max-w-3xl text-sm leading-6 text-white/75">{delivery.description}</p>}
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/65">
              {delivery.client_name && <span>{delivery.client_name}</span>}
              {delivery.project_name && <span className="inline-flex items-center gap-1.5"><FolderKanban className="h-3.5 w-3.5" /> {delivery.project_name}</span>}
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> Delivered {new Date(deliveredAt).toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric" })}</span>
            </div>
          </div>

          <div className="p-5 sm:p-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#07133B]">Delivery files</h2>
                <p className="mt-1 text-xs text-[#7B859B]">Each file opens through a short-lived secure download link.</p>
              </div>
              {delivery.external_url && (
                <a href={delivery.external_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-xs font-bold text-white hover:bg-blue-700">
                  <ExternalLink className="h-4 w-4" /> Open shared folder
                </a>
              )}
            </div>

            <Suspense fallback={<DeliveryFilesSkeleton />}>
              <DeliveryFilesSection token={delivery.token} />
            </Suspense>

            <div className="mt-7 flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div><p className="text-xs font-bold text-emerald-900">Secure CDS Space delivery</p><p className="mt-1 text-[11px] leading-5 text-emerald-800/75">Only people with this private link can view the handover. Download links expire automatically.</p></div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

async function DeliveryFilesSection({ token }: { token: string }) {
  const delivery = await getPublicDelivery(token).catch(() => null);
  if (delivery?.files.length) {
    return <DeliveryAssetBrowser token={delivery.token} files={delivery.files} />;
  }

  return (
    <div className="mt-5 rounded-2xl border border-dashed border-[#D6DFED] bg-[#F8FAFD] px-5 py-10 text-center text-sm text-[#7B859B]">
      {delivery?.external_url ? "This handover is provided through the shared folder above." : "No downloadable files are attached to this handover."}
    </div>
  );
}

function DeliveryFilesSkeleton() {
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-[#DFE6F1] bg-[#F8FAFD]" aria-label="Loading delivery files">
      <div className="border-b border-[#E4EAF3] bg-white p-4">
        <div className="h-11 max-w-md animate-pulse rounded-xl bg-[#EDF2F8]" />
      </div>
      <div className="space-y-2 p-4">
        {[0, 1, 2].map((item) => (
          <div key={item} className="flex items-center gap-3 rounded-xl border border-[#E4EAF3] bg-white p-3">
            <div className="h-11 w-14 animate-pulse rounded-lg bg-[#EDF2F8]" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-2/5 animate-pulse rounded bg-[#EDF2F8]" />
              <div className="h-2.5 w-1/5 animate-pulse rounded bg-[#F1F4F8]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
