"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Facebook,
  Linkedin,
  Mail,
  MessageCircle,
  MessagesSquare,
  Send,
  Share2,
  X,
} from "lucide-react";
import { ShareInChatModal } from "@/components/chat/ShareInChatModal";
import { ViewportPortal } from "@/components/ui/ViewportPortal";
import { appToast } from "@/lib/app-notify";
import { cn } from "@/lib/utils";
import { publicSiteOrigin } from "@/lib/public-site";

export type ShareChannel =
  | "copy_link"
  | "whatsapp"
  | "linkedin"
  | "facebook"
  | "x"
  | "telegram"
  | "email"
  | "native"
  | "in_app_chat";

type ClientTarget = { id: string; name: string } | null;

export function UniversalShareButton({
  title,
  text,
  chatText,
  url,
  label = "Share",
  className,
  iconOnly = false,
  disabled = false,
  clientTarget = null,
  onChannel,
}: {
  title: string;
  text?: string;
  /** Optional safer/different copy for in-app chat (for example, omit a temporary password). */
  chatText?: string;
  /** Absolute or site-relative public URL. Defaults to the current page. */
  url?: string;
  label?: string;
  className?: string;
  /** Keep the accessible label while rendering only the share icon. */
  iconOnly?: boolean;
  disabled?: boolean;
  /** Optional client account to place first in the in-app destination picker. */
  clientTarget?: ClientTarget;
  onChannel?: (channel: ShareChannel) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const resolvedUrl = useMemo(() => {
    if (typeof window === "undefined") return url || "";
    try {
      const base = url?.startsWith("/") ? publicSiteOrigin() : window.location.origin;
      return new URL(url || window.location.href, base).toString();
    } catch {
      return window.location.href;
    }
  }, [open, url]);

  const shareText = useMemo(() => {
    const context = (text || title).trim();
    return resolvedUrl && !context.includes(resolvedUrl) ? `${context}\n${resolvedUrl}` : context;
  }, [resolvedUrl, text, title]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  async function record(channel: ShareChannel) {
    try {
      await onChannel?.(channel);
    } catch {
      // Analytics must never interrupt sharing.
    }
  }

  async function copyLink() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(resolvedUrl);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = resolvedUrl;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setCopied(true);
      appToast({ message: "Link copied", kind: "success" });
      await record("copy_link");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      appToast({ message: "Could not copy the link", kind: "error" });
    }
  }

  function openExternal(channel: Exclude<ShareChannel, "copy_link" | "native" | "in_app_chat">) {
    const encodedUrl = encodeURIComponent(resolvedUrl);
    const encodedText = encodeURIComponent(text || title);
    const encodedMessage = encodeURIComponent(shareText);
    const destinations: Record<typeof channel, string> = {
      whatsapp: `https://wa.me/?text=${encodedMessage}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      x: `https://x.com/intent/post?text=${encodedText}&url=${encodedUrl}`,
      telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
      email: `mailto:?subject=${encodeURIComponent(title)}&body=${encodedMessage}`,
    };
    window.open(destinations[channel], "_blank", "noopener,noreferrer");
    void record(channel);
  }

  async function nativeShare() {
    if (typeof navigator.share !== "function") {
      await copyLink();
      return;
    }
    try {
      await navigator.share({ title, text: text || title, url: resolvedUrl });
      await record("native");
      setOpen(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={cn(
          "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#D9E2F1] bg-white px-4 text-xs font-bold text-[#0A4FE8] shadow-sm transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[#D9E2F1] disabled:hover:bg-white",
          className,
        )}
        aria-haspopup="dialog"
        aria-label={label || `Share ${title}`}
        title={label || `Share ${title}`}
      >
        <Share2 className="h-4 w-4" /> {!iconOnly && label}
      </button>

      <ViewportPortal>
      {open && (
        <div className="fixed inset-0 layer-popover flex items-center justify-center overflow-y-auto overscroll-contain bg-[#07133B]/55 p-3 backdrop-blur-sm sm:p-4" onMouseDown={() => setOpen(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`Share ${title}`}
            className="my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/60 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="flex items-start gap-4 border-b border-[#E9EEF6] px-5 py-4 sm:px-6">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[#0A4FE8]">
                <Share2 className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-bold text-[#07133B]">Share {title}</h2>
                <p className="mt-1 text-xs text-[#69738D]">Send the secure public link or share it inside CDS Space.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close share options">
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="overflow-y-auto p-5 sm:p-6">
              <div className="flex items-center gap-2 rounded-2xl border border-[#E1E7F2] bg-[#F8FAFD] p-2">
                <span className="min-w-0 flex-1 truncate px-2 text-xs text-[#69738D]">{resolvedUrl}</span>
                <button type="button" onClick={() => void copyLink()} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#0A4FE8] px-3.5 text-xs font-bold text-white hover:bg-blue-700">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy link"}
                </button>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4">
                <ShareOption label="WhatsApp" icon={<MessageCircle className="h-5 w-5" />} tone="text-emerald-600 bg-emerald-50" onClick={() => openExternal("whatsapp")} />
                <ShareOption label="LinkedIn" icon={<Linkedin className="h-5 w-5" />} tone="text-blue-700 bg-blue-50" onClick={() => openExternal("linkedin")} />
                <ShareOption label="Facebook" icon={<Facebook className="h-5 w-5" />} tone="text-[#1877F2] bg-blue-50" onClick={() => openExternal("facebook")} />
                <ShareOption label="X" icon={<span className="text-base font-black">X</span>} tone="text-gray-900 bg-gray-100" onClick={() => openExternal("x")} />
                <ShareOption label="Telegram" icon={<Send className="h-5 w-5" />} tone="text-sky-600 bg-sky-50" onClick={() => openExternal("telegram")} />
                <ShareOption label="Email" icon={<Mail className="h-5 w-5" />} tone="text-violet-700 bg-violet-50" onClick={() => openExternal("email")} />
                <ShareOption
                  label="CDS chat"
                  icon={<MessagesSquare className="h-5 w-5" />}
                  tone="text-[#0A4FE8] bg-blue-50"
                  onClick={() => {
                    setOpen(false);
                    setChatOpen(true);
                    void record("in_app_chat");
                  }}
                />
                <ShareOption label="More" icon={<ExternalLink className="h-5 w-5" />} tone="text-gray-600 bg-gray-100" onClick={() => void nativeShare()} />
              </div>
            </div>
          </section>
        </div>
      )}

      <ShareInChatModal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        shareText={chatText ? `${chatText.trim()}${resolvedUrl && !chatText.includes(resolvedUrl) ? `\n${resolvedUrl}` : ""}` : shareText}
        title={`Share ${title}`}
        clientTarget={clientTarget}
      />
      </ViewportPortal>
    </>
  );
}

function ShareOption({
  label,
  icon,
  tone,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="group flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border border-[#E7ECF4] bg-white px-2 py-3 text-center transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
      <span className={cn("grid h-9 w-9 place-items-center rounded-xl", tone)}>{icon}</span>
      <span className="text-[11px] font-semibold text-[#33405C]">{label}</span>
    </button>
  );
}
