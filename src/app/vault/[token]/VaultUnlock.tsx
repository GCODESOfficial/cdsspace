"use client";

import { useEffect, useState } from "react";
import { FileText, Folder, Loader2, Lock, Download, ShieldCheck, AlertTriangle } from "lucide-react";

interface SharedFile {
  id: string;
  title: string;
  file_name: string;
  size: string;
  kind: string;
}

interface ShareInfo {
  kind: "file" | "folder";
  needs_password: boolean;
  note: string | null;
  expires_at: string | null;
  item: { title: string; file_name?: string; size?: string; description?: string; file_count?: number };
}

export default function VaultUnlock({ token }: { token: string }) {
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [files, setFiles] = useState<SharedFile[] | null>(null);
  const [done, setDone] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/vault/${token}`)
      .then(async (response) => {
        const json = await response.json().catch(() => ({}));
        if (!active) return;
        if (!response.ok || !json.ok) setLoadError(json.error || "This link is no longer available.");
        else setInfo(json);
      })
      .catch(() => active && setLoadError("This link could not be opened."));
    return () => { active = false; };
  }, [token]);

  /** Streams a file, or lists the folder when nothing is picked yet. */
  const open = async (fileId?: string) => {
    setBusy(true); setError(""); setDone("");
    try {
      const response = await fetch(`/api/vault/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, download: fileId || undefined }),
      });
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json.error || "This link could not be opened.");
      }
      if (contentType.includes("application/json")) {
        const json = await response.json();
        setFiles(json.files || []);
        return;
      }
      const blob = await response.blob();
      const name = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") || "")?.[1] || "document";
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href; anchor.download = name;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(href), 4000);
      setDone(`${name} downloaded.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "This link could not be opened.");
    } finally {
      setBusy(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <main className="min-h-screen bg-[#EEF3FC] px-4 py-16">
      <div className="mx-auto w-full max-w-lg rounded-3xl border border-blue-100 bg-white p-6 shadow-sm sm:p-8">
        {children}
      </div>
    </main>
  );

  if (loadError) {
    return shell(
      <div className="text-center">
        <AlertTriangle className="mx-auto h-9 w-9 text-amber-500" />
        <h1 className="mt-4 text-lg font-bold text-[#07133B]">Link unavailable</h1>
        <p className="mt-2 text-sm text-slate-500">{loadError}</p>
        <p className="mt-4 text-xs text-slate-400">Ask the sender for a new link.</p>
      </div>,
    );
  }

  if (!info) {
    return shell(<div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#0A4FE8]" /></div>);
  }

  return shell(
    <>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[#0A4FE8]">
          {info.kind === "folder" ? <Folder className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#0A4FE8]">CDS Space secure share</p>
          <h1 className="truncate text-lg font-bold text-[#07133B]">{info.item.title}</h1>
          <p className="text-xs text-slate-500">
            {info.kind === "folder"
              ? `${info.item.file_count ?? 0} file${info.item.file_count === 1 ? "" : "s"}`
              : `${info.item.file_name} · ${info.item.size}`}
          </p>
        </div>
      </div>

      {info.note && <p className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">{info.note}</p>}

      {info.expires_at && (
        <p className="mt-3 text-xs text-slate-400">
          This link expires on {new Date(info.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.
        </p>
      )}

      {info.needs_password && (
        <div className="mt-5">
          <label className="text-xs font-semibold text-slate-600">Password</label>
          <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-[#0A4FE8]">
            <Lock className="h-4 w-4 shrink-0 text-slate-300" />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && !busy && open()}
              placeholder="Enter the password you were given"
              className="h-11 w-full bg-transparent text-sm outline-none"
            />
          </div>
        </div>
      )}

      {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {done && <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{done}</p>}

      <button
        type="button"
        onClick={() => open()}
        disabled={busy || (info.needs_password && !password)}
        className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] text-sm font-bold text-white disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : info.kind === "folder" ? <Folder className="h-4 w-4" /> : <Download className="h-4 w-4" />}
        {info.kind === "folder" ? "Open folder" : "Download"}
      </button>

      {files && (
        <div className="mt-5 space-y-2">
          {files.length === 0 && <p className="text-sm text-slate-400">This folder is empty.</p>}
          {files.map((file) => (
            <div key={file.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#07133B]">{file.title}</p>
                <p className="truncate text-xs text-slate-400">{file.file_name} · {file.size}</p>
              </div>
              <button
                type="button"
                onClick={() => open(file.id)}
                disabled={busy}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-blue-200 px-2.5 py-1.5 text-xs font-bold text-[#0A4FE8] hover:bg-blue-50 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" /> Get
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 flex items-start gap-2 text-[11px] leading-relaxed text-slate-400">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        This link is private and may expire or be revoked by the sender. Please do not forward it.
      </p>
    </>,
  );
}
