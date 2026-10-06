"use client";

 

// CDS Space branded replacements for window.alert / confirm / prompt.
// Promise-based singleton store + a <AppNotifyRoot /> you mount once.

import * as React from "react";

type ToastKind = "info" | "success" | "error" | "warning";

export interface ConfirmOptions {
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  icon?: React.ReactNode;
}

export interface AlertOptions {
  title?: string;
  message?: string;
  okLabel?: string;
  kind?: ToastKind;
}

export interface PromptOptions {
  title?: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  inputType?: "text" | "password" | "url" | "email";
}

export interface ToastOptions {
  title?: string;
  message: string;
  kind?: ToastKind;
  durationMs?: number;
}

type ConfirmRec = ConfirmOptions & { id: number; resolve: (v: boolean) => void };
type AlertRec = AlertOptions & { id: number; resolve: () => void };
type PromptRec = PromptOptions & { id: number; resolve: (v: string | null) => void };
type ToastRec = ToastOptions & { id: number };

type Listener = (snap: {
  confirms: ConfirmRec[];
  alerts: AlertRec[];
  prompts: PromptRec[];
  toasts: ToastRec[];
}) => void;

class NotifyStore {
  confirms: ConfirmRec[] = [];
  alerts: AlertRec[] = [];
  prompts: PromptRec[] = [];
  toasts: ToastRec[] = [];
  seq = 1;
  listeners = new Set<Listener>();

  subscribe(l: Listener) {
    this.listeners.add(l);
    l(this.snap());
    return () => { this.listeners.delete(l); };
  }
  snap() {
    return {
      confirms: [...this.confirms],
      alerts: [...this.alerts],
      prompts: [...this.prompts],
      toasts: [...this.toasts],
    };
  }
  private emit() { const s = this.snap(); this.listeners.forEach((l) => l(s)); }

  confirm(opts: ConfirmOptions) {
    return new Promise<boolean>((resolve) => {
      this.confirms.push({ ...opts, id: this.seq++, resolve });
      this.emit();
    });
  }
  alert(opts: AlertOptions) {
    return new Promise<void>((resolve) => {
      this.alerts.push({ ...opts, id: this.seq++, resolve });
      this.emit();
    });
  }
  prompt(opts: PromptOptions) {
    return new Promise<string | null>((resolve) => {
      this.prompts.push({ ...opts, id: this.seq++, resolve });
      this.emit();
    });
  }
  toast(opts: ToastOptions) {
    const rec: ToastRec = { ...opts, id: this.seq++ };
    this.toasts.push(rec);
    this.emit();
    const dur = opts.durationMs ?? 3500;
    setTimeout(() => this.closeToast(rec.id), dur);
  }
  closeConfirm(id: number, value: boolean) {
    const rec = this.confirms.find((r) => r.id === id);
    if (!rec) return;
    this.confirms = this.confirms.filter((r) => r.id !== id);
    this.emit();
    rec.resolve(value);
  }
  closeAlert(id: number) {
    const rec = this.alerts.find((r) => r.id === id);
    if (!rec) return;
    this.alerts = this.alerts.filter((r) => r.id !== id);
    this.emit();
    rec.resolve();
  }
  closePrompt(id: number, value: string | null) {
    const rec = this.prompts.find((r) => r.id === id);
    if (!rec) return;
    this.prompts = this.prompts.filter((r) => r.id !== id);
    this.emit();
    rec.resolve(value);
  }
  closeToast(id: number) {
    if (!this.toasts.some((t) => t.id === id)) return;
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.emit();
  }
}

const store = new NotifyStore();

export function appConfirm(opts: ConfirmOptions | string) {
  return store.confirm(typeof opts === "string" ? { message: opts } : opts);
}
export function appAlert(opts: AlertOptions | string) {
  return store.alert(typeof opts === "string" ? { message: opts } : opts);
}
export function appPrompt(opts: PromptOptions | string) {
  return store.prompt(typeof opts === "string" ? { message: opts } : opts);
}
export function appToast(opts: ToastOptions | string) {
  return store.toast(typeof opts === "string" ? { message: opts } : opts);
}

/* ------------------------------------------------------------------ */
/*  <AppNotifyRoot /> - mount once in app/layout.tsx                  */
/* ------------------------------------------------------------------ */
export function AppNotifyRoot() {
  const [snap, setSnap] = React.useState(store.snap());
  React.useEffect(() => store.subscribe(setSnap), []);

  return (
    <>
      {/* Modals */}
      {snap.confirms.map((r) => (
        <ConfirmModal key={r.id} rec={r} />
      ))}
      {snap.alerts.map((r) => (
        <AlertModal key={r.id} rec={r} />
      ))}
      {snap.prompts.map((r) => (
        <PromptModal key={r.id} rec={r} />
      ))}

      {/* Toast rail */}
      {snap.toasts.length > 0 && (
        <div className="fixed inset-x-3 bottom-3 layer-modal-top flex flex-col gap-2 w-auto md:inset-x-auto md:bottom-auto md:top-4 md:right-4 md:w-[min(92vw,360px)]">
          {snap.toasts.map((t) => (
            <ToastCard key={t.id} rec={t} />
          ))}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  CDS Space branded primitives                                      */
/* ------------------------------------------------------------------ */
const BRAND = {
  blue: "#0A4FE8",
  blueHover: "#083EC0",
  navy: "#0D1B39",
  line: "rgba(15,26,74,0.08)",
  logoSrc: "/navbar/CDS Logo.svg",
};

function Shell({
  children,
  onBackdrop,
  narrow = false,
}: {
  children: React.ReactNode;
  onBackdrop: () => void;
  narrow?: boolean;
}) {
  return (
    <div
      className="layer-modal-top fixed inset-0 bg-[#040b37]/60 backdrop-blur-sm flex items-end justify-center p-3 sm:items-center sm:p-4 animate-fadeIn"
      onClick={onBackdrop}
    >
      <div
        className={`bg-white rounded-[24px] shadow-[0_28px_60px_rgba(4,11,55,0.28)] w-full ${narrow ? "max-w-sm" : "max-w-md"} overflow-hidden sm:rounded-2xl`}
        onClick={(e) => e.stopPropagation()}
        style={{ color: BRAND.navy, boxShadow: "0 28px 60px rgba(4,11,55,0.28)", border: `1px solid ${BRAND.line}` }}
      >
        {children}
      </div>
    </div>
  );
}

function BrandHeader({ title }: { title: string }) {
  return (
    <div
      className="px-5 pt-5 pb-3 border-b"
      style={{ borderColor: BRAND.line }}
    >
      <div className="flex items-center gap-2 mb-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BRAND.logoSrc} alt="CDS Space" className="h-4 w-auto" />
        <span className="text-[10px] uppercase tracking-[0.2em] font-semibold" style={{ color: BRAND.blue }}>
          CDS Space
        </span>
      </div>
      <h2 className="text-[15px] font-bold leading-tight" style={{ color: BRAND.navy }}>
        {title}
      </h2>
    </div>
  );
}

function BrandButton({
  children, onClick, variant = "primary", disabled, autoFocus,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const base =
    "inline-flex w-full sm:w-auto items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold transition disabled:opacity-50";
  const styles =
    variant === "primary"
      ? { background: BRAND.blue, color: "white" }
      : variant === "danger"
        ? { background: "#DC2626", color: "white" }
        : undefined;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      autoFocus={autoFocus}
      className={
        base +
        (variant === "primary"
          ? " hover:opacity-95"
          : variant === "danger"
            ? " hover:bg-rose-700"
            : " border hover:bg-gray-50")
      }
      style={{
        ...(styles || {}),
        ...(variant === "ghost" ? { borderColor: BRAND.line, color: BRAND.navy } : {}),
      }}
    >
      {children}
    </button>
  );
}

/* -------- Confirm -------- */
function ConfirmModal({ rec }: { rec: ConfirmRec }) {
  const { title = "Please confirm", message, confirmLabel = "Confirm", cancelLabel = "Cancel", destructive, id } = rec;
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") store.closeConfirm(id, false);
      else if (e.key === "Enter") store.closeConfirm(id, true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id]);
  return (
    <Shell narrow onBackdrop={() => store.closeConfirm(id, false)}>
      <BrandHeader title={title} />
      {message && (
        <p className="px-5 py-4 text-[13px] leading-relaxed" style={{ color: "#4B5563" }}>
          {message}
        </p>
      )}
      <div className="px-5 pb-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <BrandButton variant="ghost" onClick={() => store.closeConfirm(id, false)}>
          {cancelLabel}
        </BrandButton>
        <BrandButton
          variant={destructive ? "danger" : "primary"}
          onClick={() => store.closeConfirm(id, true)}
          autoFocus
        >
          {confirmLabel}
        </BrandButton>
      </div>
    </Shell>
  );
}

/* -------- Alert -------- */
function AlertModal({ rec }: { rec: AlertRec }) {
  const { title, message, okLabel = "OK", kind = "info", id } = rec;
  const computedTitle = title || (kind === "error" ? "Something went wrong" : kind === "warning" ? "Heads up" : kind === "success" ? "Done" : "Notice");
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "Enter") store.closeAlert(id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id]);
  return (
    <Shell narrow onBackdrop={() => store.closeAlert(id)}>
      <BrandHeader title={computedTitle} />
      {message && (
        <p className="px-5 py-4 text-[13px] leading-relaxed" style={{ color: "#4B5563" }}>
          {message}
        </p>
      )}
      <div className="px-5 pb-5 flex">
        <BrandButton onClick={() => store.closeAlert(id)} autoFocus>
          {okLabel}
        </BrandButton>
      </div>
    </Shell>
  );
}

/* -------- Prompt -------- */
function PromptModal({ rec }: { rec: PromptRec }) {
  const {
    title = "Enter a value",
    message,
    placeholder,
    defaultValue = "",
    confirmLabel = "Submit",
    cancelLabel = "Cancel",
    inputType = "text",
    id,
  } = rec;
  const [value, setValue] = React.useState(defaultValue);
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    const t = setTimeout(() => ref.current?.focus(), 30);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") store.closePrompt(id, null);
    }
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [id]);
  return (
    <Shell narrow onBackdrop={() => store.closePrompt(id, null)}>
      <BrandHeader title={title} />
      <div className="px-5 pt-4 pb-3">
        {message && <p className="text-[13px] mb-2" style={{ color: "#4B5563" }}>{message}</p>}
        <input
          ref={ref}
          type={inputType}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") store.closePrompt(id, value); }}
          placeholder={placeholder}
          className="w-full px-3 py-2.5 rounded-xl border text-[13px] focus:outline-none"
          style={{ borderColor: BRAND.line, background: "#F7F8FB" }}
        />
      </div>
      <div className="px-5 pb-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <BrandButton variant="ghost" onClick={() => store.closePrompt(id, null)}>
          {cancelLabel}
        </BrandButton>
        <BrandButton onClick={() => store.closePrompt(id, value)}>
          {confirmLabel}
        </BrandButton>
      </div>
    </Shell>
  );
}

/* -------- Toast -------- */
function ToastCard({ rec }: { rec: ToastRec }) {
  const { title, message, kind = "info", id } = rec;
  // Success and info both sit in CDS blue: a routine confirmation is not a
  // different brand moment, it is the ordinary one. Only genuine problems
  // borrow a colour, because that is the whole point of using one.
  const accent =
    kind === "error" ? "#DC2626" :
    kind === "warning" ? "#D97706" :
    BRAND.blue;
  const tint =
    kind === "error" ? "#FEF2F2" :
    kind === "warning" ? "#FFFBEB" :
    "#EEF3FE";
  return (
    <div
      data-app-toast
      className="flex items-start gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_18px_36px_rgba(4,11,55,0.18)] ring-1 animate-fadeIn"
      style={{ borderColor: BRAND.line }}
    >
      <span
        aria-hidden
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
        style={{ background: tint, color: accent }}
      >
        {kind === "error" || kind === "warning" ? (
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M10 6v5" /><path d="M10 14h.01" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 10.5 3.2 3.2L15 7" />
          </svg>
        )}
      </span>
      <div className="min-w-0 flex-1">
        {title && <p className="text-[12.5px] font-bold" style={{ color: BRAND.navy }}>{title}</p>}
        <p className="text-[12px]" style={{ color: "#4B5563" }}>{message}</p>
      </div>
      <button
        onClick={() => store.closeToast(id)}
        className="-mr-1 rounded-lg px-1 text-[11px] text-gray-300 transition hover:bg-gray-50 hover:text-gray-600"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
