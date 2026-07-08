"use client";

/**
 * CDS Space desktop app — download landing page ("install wizard" entry).
 *
 * The team login screen and in-portal prompts link here. It detects the
 * visitor's OS, offers the right installer, and walks them through the native
 * install steps. If an installer file isn't published yet it shows a clear
 * "not available" state instead of a raw 404.
 *
 * Point NEXT_PUBLIC_DESKTOP_APP_*_URL at hosted installers, or drop the built
 * files in public/downloads/ (see public/downloads/README.md).
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import { MonitorDown, Download, Apple, Loader2, CheckCircle2, ShieldCheck } from "lucide-react";
import { MAC_DOWNLOAD_URL, WIN_DOWNLOAD_URL, detectOs } from "@/lib/desktop-app";

type OsKey = "mac" | "windows" | "other";

const MAC_STEPS = [
  "Open the downloaded CDS-Space-mac.dmg file.",
  "Drag the CDS Space icon into your Applications folder.",
  "Open CDS Space from Applications and sign in.",
  "First launch only: if macOS asks, allow Screen Recording for CDS Space in System Settings → Privacy & Security.",
];

const WIN_STEPS = [
  "Run the downloaded CDS-Space-win.exe setup file.",
  "If Windows SmartScreen appears, click \"More info\" → \"Run anyway\".",
  "Follow the installer wizard to finish.",
  "Open CDS Space from the Start menu and sign in.",
];

export default function DownloadPage() {
  const [os, setOs] = useState<OsKey>("other");
  const [checking, setChecking] = useState<null | OsKey>(null);
  const [unavailable, setUnavailable] = useState<Partial<Record<OsKey, boolean>>>({});

  useEffect(() => { setOs(detectOs()); }, []);

  // Verify the installer exists before navigating, so a missing file shows a
  // friendly message instead of dropping the user on a 404.
  const startDownload = async (key: "mac" | "windows") => {
    const url = key === "mac" ? MAC_DOWNLOAD_URL : WIN_DOWNLOAD_URL;
    setChecking(key);
    setUnavailable((u) => ({ ...u, [key]: false }));
    try {
      // Only HEAD-check same-origin (public/) files; external hosts may block it.
      if (url.startsWith("/")) {
        const res = await fetch(url, { method: "HEAD" });
        if (!res.ok) {
          setUnavailable((u) => ({ ...u, [key]: true }));
          return;
        }
      }
      window.location.href = url;
    } catch {
      // Network/other error — try the navigation anyway.
      window.location.href = url;
    } finally {
      setChecking(null);
    }
  };

  const primary: "mac" | "windows" = os === "windows" ? "windows" : "mac";
  const secondary: "mac" | "windows" = primary === "mac" ? "windows" : "mac";

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F0F5FF] to-white">
      <div className="mx-auto flex max-w-3xl flex-col items-center px-5 py-16 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white shadow-lg ring-1 ring-black/5">
          <Image src="/favicon.png" alt="CDS Space" width={72} height={72} className="rounded-2xl" />
        </div>
        <h1 className="mt-6 text-[32px] font-bold tracking-tight text-[#0D1B39] sm:text-[38px]">Download CDS Space</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-brand-body/70">
          The desktop app runs your work sessions automatically in the background across all your
          screens. Install it, sign in, and you&apos;re set — no browser prompts.
        </p>

        {/* Download buttons */}
        <div className="mt-8 flex w-full max-w-md flex-col gap-3">
          <DownloadButton
            os="mac"
            primary={primary === "mac"}
            busy={checking === "mac"}
            unavailable={!!unavailable.mac}
            onClick={() => startDownload("mac")}
          />
          <DownloadButton
            os="windows"
            primary={primary === "windows"}
            busy={checking === "windows"}
            unavailable={!!unavailable.windows}
            onClick={() => startDownload("windows")}
          />
          <p className="mt-1 text-[12px] text-brand-body/45">
            Detected: {os === "mac" ? "macOS" : os === "windows" ? "Windows" : "your device"}. On a phone or tablet?
            {" "}<a href="/team/login" className="font-semibold text-brand-blue">Use the web portal instead →</a>
          </p>
        </div>

        {/* Install steps */}
        <div className="mt-12 grid w-full gap-5 text-left sm:grid-cols-2">
          <StepCard title="Install on macOS" steps={MAC_STEPS} highlight={primary === "mac"} />
          <StepCard title="Install on Windows" steps={WIN_STEPS} highlight={primary === "windows"} />
        </div>

        <div className="mt-10 flex flex-col items-center gap-2 text-[12.5px] text-brand-body/55">
          <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-green-600" /> Only management can view work-session data.</p>
          <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-green-600" /> Raw screen captures auto-delete after the retention window.</p>
        </div>
        <p className="mt-6 text-[12px] text-brand-body/40">Having trouble installing? Contact a super admin.</p>
      </div>
    </div>
  );
}

function DownloadButton({ os, primary, busy, unavailable, onClick }: {
  os: "mac" | "windows";
  primary: boolean;
  busy: boolean;
  unavailable: boolean;
  onClick: () => void;
}) {
  const label = os === "mac" ? "Download for macOS" : "Download for Windows";
  const Icon = os === "mac" ? Apple : MonitorDown;
  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className={`inline-flex w-full items-center justify-center gap-2.5 rounded-2xl px-6 py-4 text-[15px] font-bold transition disabled:opacity-70 ${
          primary
            ? "bg-brand-blue text-white shadow-lg shadow-brand-blue/25 hover:bg-brand-blue/90"
            : "border border-brand-stroke bg-white text-brand-navy hover:border-brand-blue/40"
        }`}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
        {label}
      </button>
      {unavailable && (
        <p className="mt-1.5 text-[12px] font-medium text-amber-600">
          This installer isn&apos;t published yet — please ask a super admin for the {os === "mac" ? "macOS" : "Windows"} build.
        </p>
      )}
    </div>
  );
}

function StepCard({ title, steps, highlight }: { title: string; steps: string[]; highlight: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${highlight ? "border-brand-blue/30 bg-brand-blue/[0.03]" : "border-brand-stroke/60 bg-white"}`}>
      <div className="flex items-center gap-2">
        <Download className="h-4 w-4 text-brand-blue" />
        <h3 className="text-[14px] font-bold text-[#0D1B39]">{title}</h3>
      </div>
      <ol className="mt-3 space-y-2">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-2.5 text-[12.5px] leading-relaxed text-brand-body/75">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-blue/10 text-[10px] font-bold text-brand-blue">{i + 1}</span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}
