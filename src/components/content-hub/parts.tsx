"use client";

import { useState } from "react";
import { Check, Copy, Download, Image as ImageIcon, Video, FileText, CheckCircle2 } from "lucide-react";
import { STATUS_META, platformLabel, type ContentItem, type ContentStatus } from "@/lib/content-hub/shared";

export function StatusBadge({ status }: { status: ContentStatus }) {
  const meta = STATUS_META[status] || STATUS_META.draft;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  );
}

export function PlatformPills({ platforms }: { platforms: string[] }) {
  if (!platforms?.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {platforms.map((p) => (
        <span key={p} className="rounded-md bg-gray-100 px-2 py-0.5 text-[10.5px] font-medium text-gray-600">
          {platformLabel(p)}
        </span>
      ))}
    </div>
  );
}

/** Compose the full, copy-ready caption: body + CTA + hashtags. */
export function buildCaption(item: Pick<ContentItem, "body" | "cta_label" | "cta_url" | "hashtags">): string {
  const parts: string[] = [];
  if (item.body) parts.push(item.body.trim());
  if (item.cta_label) parts.push(`${item.cta_label}${item.cta_url ? ` ${item.cta_url}` : ""}`);
  if (item.hashtags?.length) parts.push(item.hashtags.join(" "));
  return parts.join("\n\n");
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch { /* clipboard blocked */ }
      }}
      className="inline-flex items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#083EC0]"
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? "Copied" : label}
    </button>
  );
}

const KIND_ICON = { image: ImageIcon, video: Video, pdf: FileText, document: FileText, clip: Video } as const;

/**
 * The publishing package the Social Media Manager uses: copy the caption,
 * download each asset, download all, and mark the content as published.
 */
export function PublishingPackage({
  item,
  onMarkPublished,
  canPublish = true,
}: {
  item: ContentItem;
  onMarkPublished?: () => void;
  canPublish?: boolean;
}) {
  const caption = buildCaption(item);
  const media = item.media || [];

  // Save the asset to the device instead of opening it in a new tab. GlashDB
  // storage serves any public object as an attachment when the URL carries a
  // `?download=<name>` param, so this forces a real download even cross-origin.
  const downloadOne = (url: string, name?: string | null) => {
    const filename = name || url.split("/").pop()?.split("?")[0] || "asset";
    const sep = url.includes("?") ? "&" : "?";
    const a = document.createElement("a");
    a.href = `${url}${sep}download=${encodeURIComponent(filename)}`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const downloadAll = () => {
    // Stagger so the browser doesn't drop concurrent downloads.
    media.forEach((m, i) => setTimeout(() => downloadOne(m.url, m.file_name || `asset-${i + 1}`), i * 350));
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
      <h3 className="text-[14px] font-bold text-[#0D1B39]">Publishing package</h3>
      <p className="text-[12px] text-gray-500">Copy the caption, download the assets, post, then mark it published.</p>

      <pre className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-gray-100 bg-gray-50 p-3 text-[12.5px] leading-6 text-[#0D1B39]">
        {caption || "No caption yet."}
      </pre>

      <div className="mt-3 flex flex-wrap gap-2">
        <CopyButton text={caption} label="Copy Content" />
        {media.length > 0 && (
          <button
            type="button"
            onClick={downloadAll}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0D1B39] transition hover:border-blue-200 hover:bg-blue-50"
          >
            <Download className="h-4 w-4" />
            Download all assets
          </button>
        )}
        {canPublish && item.status !== "published" && onMarkPublished && (
          <button
            type="button"
            onClick={onMarkPublished}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-emerald-700"
          >
            <CheckCircle2 className="h-4 w-4" />
            Mark as published
          </button>
        )}
      </div>

      {media.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {media.map((m) => {
            const Icon = KIND_ICON[m.kind] || FileText;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => downloadOne(m.url, m.file_name)}
                title={`Download ${m.file_name || m.kind}`}
                className="group relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-gray-100 bg-gray-50"
              >
                {m.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt={m.file_name || "asset"} className="h-full w-full object-cover" />
                ) : (
                  <Icon className="h-7 w-7 text-gray-400" />
                )}
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/45 px-2 py-1 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100">
                  <span className="truncate">{m.file_name || m.kind}</span>
                  <Download className="h-3 w-3 shrink-0" />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
