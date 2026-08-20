"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, Link2, LinkIcon, Plug, RefreshCcw, Share2, X } from "lucide-react";

interface Channel {
  platform: "linkedin" | "facebook" | "instagram" | "tiktok" | "x";
  label: string;
  configured: boolean;
  implemented: boolean;
  connected: boolean;
  status: string | null;
  accountName: string | null;
  tokenExpiresAt: string | null;
}

export default function SocialChannels() {
  const params = useSearchParams();
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/content-hub/social", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setChannels(json.channels || []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Surface the OAuth callback result (redirect carries ?social=connected|error).
  useEffect(() => {
    const social = params.get("social");
    if (!social) return;
    const channel = params.get("channel") || "channel";
    const detail = params.get("detail");
    if (social === "connected") setNotice({ tone: "ok", text: `${channel} connected${detail ? ` as ${detail}` : ""}.` });
    else if (social === "error") setNotice({ tone: "error", text: `Could not connect ${channel}${detail ? `: ${detail}` : ""}.` });
  }, [params]);

  async function connect(platform: string) {
    setBusy(platform); setNotice(null);
    const res = await fetch("/api/admin/content-hub/social", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "connect", platform }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok && json.authUrl) { window.location.href = json.authUrl; return; }
    setNotice({ tone: "error", text: json.error || "Could not start the connection." });
  }

  async function disconnect(platform: string) {
    setBusy(platform); setNotice(null);
    const res = await fetch("/api/admin/content-hub/social", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disconnect", platform }),
    });
    setBusy(null);
    if (res.ok) { setNotice({ tone: "ok", text: `Disconnected.` }); await load(); }
    else setNotice({ tone: "error", text: "Could not disconnect." });
  }

  return (
    <section className="mt-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-[#0A4FE8]"><Share2 className="h-4 w-4" /></span>
        <div>
          <h2 className="text-[15px] font-bold text-[#0D1B39]">Auto-publishing channels</h2>
          <p className="text-[12px] text-gray-500">Connect CDS Space brand accounts once. Scheduled content posts to them automatically.</p>
        </div>
      </div>

      {notice && (
        <div className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-[12px] ${notice.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {notice.tone === "ok" ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>{notice.text}</span>
        </div>
      )}

      <div className="mt-4 space-y-2.5">
        {!channels ? (
          <div className="grid place-items-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#0A4FE8]" /></div>
        ) : channels.map((c) => (
          <div key={c.platform} className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-bold text-[#0D1B39]">{c.label}</p>
                {c.connected ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Connected</span>
                ) : !c.implemented ? (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">Coming soon</span>
                ) : !c.configured ? (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">Needs API keys</span>
                ) : (
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0A4FE8]">Ready to connect</span>
                )}
                {c.connected && c.status && c.status !== "connected" && (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-600">{c.status}</span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-gray-500">
                {c.connected ? (c.accountName ? `Posting as ${c.accountName}` : "Connected")
                  : !c.implemented ? "Configuration slot ready - posting turns on in a follow-up."
                  : !c.configured ? "Add its API credentials to the environment to enable connecting."
                  : "Authorize the CDS Space account to enable auto-posting."}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {c.connected ? (
                <>
                  <button onClick={() => connect(c.platform)} disabled={busy === c.platform || !c.configured} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                    {busy === c.platform ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />} Reconnect
                  </button>
                  <button onClick={() => disconnect(c.platform)} disabled={busy === c.platform} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 text-[12px] font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                    <Link2 className="h-3.5 w-3.5" /> Disconnect
                  </button>
                </>
              ) : (
                <button onClick={() => connect(c.platform)} disabled={busy === c.platform || !c.implemented || !c.configured} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0A4FE8] px-3.5 text-[12px] font-bold text-white hover:bg-[#083EC0] disabled:cursor-not-allowed disabled:opacity-50">
                  {busy === c.platform ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LinkIcon className="h-3.5 w-3.5" />} Connect
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-gray-400"><Plug className="h-3 w-3" /> Tokens are stored securely server-side and never shown here. Scheduled posts go out via the auto-publish worker.</p>
    </section>
  );
}
