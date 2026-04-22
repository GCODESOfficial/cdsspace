"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Loader2, QrCode, Cloud, CheckCircle2, AlertCircle, Link2, RefreshCw } from "lucide-react";

type Mode = "cloud_api" | "web_qr";

interface Integration {
  id: string;
  mode: Mode;
  is_active: boolean;
  cloud_phone_number_id: string | null;
  cloud_waba_id: string | null;
  cloud_access_token: string | null;
  cloud_access_token_set?: boolean;
  cloud_verify_token: string | null;
  cloud_business_phone: string | null;
  cloud_app_id: string | null;
  qr_status: "disconnected" | "pairing" | "connected" | "error";
  qr_linked_phone: string | null;
  qr_last_seen_at: string | null;
  qr_error: string | null;
}

interface QrState {
  qr_code: string | null;
  qr_status: "disconnected" | "pairing" | "connected" | "error";
  qr_linked_phone: string | null;
  qr_last_seen_at: string | null;
  qr_error: string | null;
  bridgeAlive: boolean;
}

export default function WhatsAppIntegrationPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [qr, setQr] = useState<QrState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const cloud = integrations.find((i) => i.mode === "cloud_api");
  const qrInteg = integrations.find((i) => i.mode === "web_qr");
  const activeMode: Mode | null = integrations.find((i) => i.is_active)?.mode ?? null;

  const [cloudForm, setCloudForm] = useState({
    cloud_phone_number_id: "",
    cloud_waba_id: "",
    cloud_access_token: "",
    cloud_verify_token: "",
    cloud_business_phone: "",
    cloud_app_id: "",
  });

  const fetchIntegrations = useCallback(async () => {
    const res = await fetch("/api/admin/integrations/whatsapp");
    const data = await res.json();
    if (res.ok) {
      setIntegrations(data.integrations || []);
      const c = data.integrations?.find((i: Integration) => i.mode === "cloud_api");
      if (c) {
        setCloudForm((prev) => ({
          cloud_phone_number_id: c.cloud_phone_number_id ?? prev.cloud_phone_number_id,
          cloud_waba_id: c.cloud_waba_id ?? prev.cloud_waba_id,
          cloud_access_token: c.cloud_access_token ?? prev.cloud_access_token,
          cloud_verify_token: c.cloud_verify_token ?? prev.cloud_verify_token,
          cloud_business_phone: c.cloud_business_phone ?? prev.cloud_business_phone,
          cloud_app_id: c.cloud_app_id ?? prev.cloud_app_id,
        }));
      }
    }
    setLoading(false);
  }, []);

  const fetchQr = useCallback(async () => {
    const res = await fetch("/api/admin/integrations/whatsapp/qr");
    if (res.ok) setQr(await res.json());
  }, []);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  useEffect(() => {
    if (activeMode !== "web_qr") return;
    fetchQr();
    const id = setInterval(fetchQr, 2000);
    return () => clearInterval(id);
  }, [activeMode, fetchQr]);

  // On first load in web_qr mode with no QR + no linked phone, auto-start the
  // in-process client so the admin doesn't have to click an extra button.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (activeMode !== "web_qr") return;
    if (autoStartedRef.current) return;
    if (!qr) return;
    if (qr.qr_status === "connected") return;
    if (qr.qr_code) return;
    autoStartedRef.current = true;
    fetch("/api/admin/integrations/whatsapp/qr/start", { method: "POST" }).catch(() => {});
  }, [activeMode, qr]);

  async function activate(mode: Mode) {
    setSaving(true);
    await fetch("/api/admin/integrations/whatsapp", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, is_active: true }),
    });
    if (mode === "web_qr") {
      // Spin up the in-process WhatsApp Web client so a QR is published to
      // whatsapp_integrations.qr_code for the polling UI to display.
      await fetch("/api/admin/integrations/whatsapp/qr/start", { method: "POST" });
    }
    await fetchIntegrations();
    setSaving(false);
  }

  async function deactivate() {
    if (!activeMode) return;
    setSaving(true);
    await fetch("/api/admin/integrations/whatsapp", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: activeMode, is_active: false }),
    });
    await fetchIntegrations();
    setSaving(false);
  }

  async function saveCloudConfig() {
    setSaving(true);
    await fetch("/api/admin/integrations/whatsapp", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "cloud_api", ...cloudForm }),
    });
    await fetchIntegrations();
    setSaving(false);
  }

  async function resetQrSession() {
    setSaving(true);
    await fetch("/api/admin/integrations/whatsapp/qr", { method: "DELETE" });
    // Immediately start a new session so a fresh QR appears.
    await fetch("/api/admin/integrations/whatsapp/qr/start", { method: "POST" });
    await fetchQr();
    setSaving(false);
  }

  async function startQrSession() {
    setSaving(true);
    await fetch("/api/admin/integrations/whatsapp/qr/start", { method: "POST" });
    await fetchQr();
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/whatsapp`
      : "";

  return (
    <div className="p-8 max-w-[1000px]">
      <div className="mb-6">
        <p className="text-[#0A4FE8] text-sm font-semibold">Integrations</p>
        <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">WhatsApp</h1>
        <p className="text-sm text-gray-500 mt-1">
          Choose how inbound WhatsApp messages reach your unified inbox. Only one mode can be active at a time.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <ModeCard
          title="Meta Cloud API"
          blurb="Official WhatsApp Business Cloud API. Requires an approved Meta business. Works on Vercel."
          icon={<Cloud className="w-5 h-5" />}
          active={activeMode === "cloud_api"}
          onActivate={() => activate("cloud_api")}
          disabled={saving}
        />
        <ModeCard
          title="WhatsApp Web QR"
          blurb="Scan a QR with your phone to link — same as WhatsApp Web. Requires a running bridge process."
          icon={<QrCode className="w-5 h-5" />}
          active={activeMode === "web_qr"}
          onActivate={() => activate("web_qr")}
          disabled={saving}
        />
      </div>

      {activeMode && (
        <button
          onClick={deactivate}
          disabled={saving}
          className="mb-6 text-[12px] text-gray-400 hover:text-gray-600 underline"
        >
          Disable WhatsApp integration
        </button>
      )}

      {/* Cloud API panel */}
      {activeMode === "cloud_api" && cloud && (
        <section className="bg-white border border-gray-100 rounded-2xl p-6 mb-6">
          <h2 className="font-semibold text-[#0D1B39] mb-1">Cloud API configuration</h2>
          <p className="text-[12.5px] text-gray-500 mb-4">
            Fill these from Meta Business Suite → WhatsApp → API Setup.
          </p>

          <div className="mb-4 bg-blue-50 border border-blue-100 rounded-xl p-3 text-[12.5px] text-[#0D1B39]">
            <div className="flex items-center gap-2 mb-1 font-semibold">
              <Link2 className="w-3.5 h-3.5" /> Webhook URL
            </div>
            <code className="text-[11.5px] break-all">{webhookUrl}</code>
            <p className="text-[11px] text-gray-500 mt-1">
              Paste this into the WhatsApp webhook configuration, subscribe to <b>messages</b>,
              and set the Verify Token below to the same value.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Phone Number ID" value={cloudForm.cloud_phone_number_id} onChange={(v) => setCloudForm({ ...cloudForm, cloud_phone_number_id: v })} />
            <Field label="WhatsApp Business Account ID" value={cloudForm.cloud_waba_id} onChange={(v) => setCloudForm({ ...cloudForm, cloud_waba_id: v })} />
            <Field label="Business Phone (+234…)" value={cloudForm.cloud_business_phone} onChange={(v) => setCloudForm({ ...cloudForm, cloud_business_phone: v })} />
            <Field label="App ID" value={cloudForm.cloud_app_id} onChange={(v) => setCloudForm({ ...cloudForm, cloud_app_id: v })} />
            <Field label="Verify Token" value={cloudForm.cloud_verify_token} onChange={(v) => setCloudForm({ ...cloudForm, cloud_verify_token: v })} />
            <Field
              label={`Permanent Access Token${cloud.cloud_access_token_set ? " (currently set)" : ""}`}
              value={cloudForm.cloud_access_token}
              placeholder={cloud.cloud_access_token_set ? "Leave blank to keep current" : ""}
              onChange={(v) => setCloudForm({ ...cloudForm, cloud_access_token: v })}
              masked
            />
          </div>

          <button
            onClick={saveCloudConfig}
            disabled={saving}
            className="mt-5 px-4 py-2 bg-[#0A4FE8] text-white rounded-lg text-[13px] font-semibold hover:bg-[#083bb3] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save configuration"}
          </button>
        </section>
      )}

      {/* QR panel */}
      {activeMode === "web_qr" && qrInteg && (
        <section className="bg-white border border-gray-100 rounded-2xl p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="font-semibold text-[#0D1B39] mb-1">WhatsApp Web session</h2>
              <p className="text-[12.5px] text-gray-500">
                Start the bridge process (<code>npm start</code> inside <code>whatsapp-bridge/</code>), then scan the QR with your business WhatsApp.
              </p>
            </div>
            <button
              onClick={resetQrSession}
              disabled={saving}
              className="text-[12px] text-gray-500 hover:text-[#0A4FE8] flex items-center gap-1"
              title="Force a fresh QR — clears any linked device"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reset session
            </button>
          </div>

          <QrDisplay qr={qr} onStart={startQrSession} starting={saving} />
        </section>
      )}
    </div>
  );
}

function ModeCard({ title, blurb, icon, active, onActivate, disabled }: {
  title: string;
  blurb: string;
  icon: React.ReactNode;
  active: boolean;
  onActivate: () => void;
  disabled: boolean;
}) {
  return (
    <div className={`border rounded-2xl p-5 transition-all ${active ? "border-[#0A4FE8] bg-blue-50/40 shadow-sm" : "border-gray-100 bg-white hover:border-gray-200"}`}>
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${active ? "bg-[#0A4FE8] text-white" : "bg-gray-100 text-gray-500"}`}>
          {icon}
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-[#0D1B39] text-[14px]">{title}</h3>
          <p className="text-[12px] text-gray-500 mt-0.5 leading-relaxed">{blurb}</p>
        </div>
      </div>
      {active ? (
        <div className="flex items-center gap-1.5 text-[12px] text-[#0A4FE8] font-semibold">
          <CheckCircle2 className="w-3.5 h-3.5" /> Active
        </div>
      ) : (
        <button
          onClick={onActivate}
          disabled={disabled}
          className="text-[12px] px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:border-[#0A4FE8] hover:text-[#0A4FE8] disabled:opacity-50"
        >
          Activate
        </button>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, masked }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  masked?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[11.5px] font-medium text-gray-500 mb-1">{label}</span>
      <input
        type={masked ? "password" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-[#0A4FE8]"
      />
    </label>
  );
}

function QrDisplay({ qr, onStart, starting }: { qr: QrState | null; onStart: () => void; starting: boolean }) {
  if (!qr) return <div className="text-[12.5px] text-gray-400">Loading status…</div>;

  if (qr.qr_status === "connected") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-[13px] text-emerald-800 flex items-start gap-2">
        <CheckCircle2 className="w-4 h-4 mt-0.5" />
        <div>
          <p className="font-semibold">Linked as {qr.qr_linked_phone || "—"}</p>
          <p className="text-[11.5px] mt-1">
            Last heartbeat: {qr.qr_last_seen_at ? new Date(qr.qr_last_seen_at).toLocaleTimeString() : "—"}
          </p>
        </div>
      </div>
    );
  }

  if (qr.qr_status === "error") {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-[12.5px] text-rose-700 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5" />
        <div>
          <p className="font-semibold">Bridge reported an error</p>
          <p className="mt-1 break-words">{qr.qr_error || "Unknown"}</p>
        </div>
      </div>
    );
  }

  if (qr.qr_code) {
    return (
      <div className="flex flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr.qr_code} alt="WhatsApp linking QR" className="w-72 h-72 rounded-xl border border-gray-100" />
        <p className="mt-3 text-[12px] text-gray-500">
          WhatsApp → Settings → Linked devices → Link a device → scan.
        </p>
      </div>
    );
  }

  // No QR and no connected session → offer to start one now.
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <button
        onClick={onStart}
        disabled={starting}
        className="px-5 py-2.5 rounded-full bg-emerald-500 text-white text-[13px] font-semibold hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-2"
      >
        {starting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Starting session…
          </>
        ) : (
          "Start WhatsApp session"
        )}
      </button>
      <p className="text-[11.5px] text-gray-500 max-w-md text-center">
        Click to boot the WhatsApp Web client in this server. The linking QR will
        appear here within a few seconds; scan it with your business phone to
        connect.
      </p>
    </div>
  );
}
