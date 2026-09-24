"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Image as ImageIcon, Video, X } from "lucide-react";
import { ViewportPortal } from "@/components/ui/ViewportPortal";
import { cn } from "@/lib/utils";

type MediaKind = "image" | "video";

interface PlatformMediaViewerProps {
  url: string;
  title: string;
  children: ReactNode;
  kind?: MediaKind;
  detail?: string | null;
  triggerClassName?: string;
  ariaLabel?: string;
}

/**
 * Keeps storage-backed media inside the CDS Space interface. The underlying
 * object URL is used only as media source data and is never used as a browser
 * navigation target.
 */
export function PlatformMediaViewer({
  url,
  title,
  children,
  kind = "image",
  detail,
  triggerClassName,
  ariaLabel,
}: PlatformMediaViewerProps) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setFailed(false);
          setOpen(true);
        }}
        className={cn("appearance-none border-0 bg-transparent p-0 text-inherit", triggerClassName)}
        aria-label={ariaLabel || `Preview ${title}`}
      >
        {children}
      </button>

      {open && (
        <ViewportPortal>
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-[#061126]/80 p-3 backdrop-blur-sm sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label={`Previewing ${title}`}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
          >
            <section className="flex max-h-[94dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {kind === "image" ? <ImageIcon className="h-4 w-4 shrink-0 text-[#0A4FE8]" /> : <Video className="h-4 w-4 shrink-0 text-[#0A4FE8]" />}
                    <h2 className="truncate text-[15px] font-semibold text-[#0D1B39]">{title}</h2>
                  </div>
                  {detail && <p className="mt-1 truncate text-[11.5px] text-slate-400">{detail}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  title="Close preview"
                  aria-label="Close preview"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0A4FE8] text-white transition hover:bg-[#083EC0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A4FE8]/30"
                >
                  <X className="h-4 w-4" />
                </button>
              </header>

              <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-950">
                {failed ? (
                  <div className="px-6 py-16 text-center text-sm text-white/70">This media could not be displayed.</div>
                ) : kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt={title}
                    className="max-h-[calc(94dvh-64px)] w-auto max-w-full object-contain"
                    onError={() => setFailed(true)}
                  />
                ) : (
                  <video
                    src={url}
                    controls
                    playsInline
                    preload="metadata"
                    className="max-h-[calc(94dvh-64px)] w-full max-w-full bg-black"
                    onError={() => setFailed(true)}
                  />
                )}
              </div>
            </section>
          </div>
        </ViewportPortal>
      )}
    </>
  );
}
