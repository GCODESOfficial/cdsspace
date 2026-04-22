"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Facebook, Instagram, Link2, AlertCircle, CheckCircle2, Clock } from "lucide-react";

type Platform = "facebook" | "instagram";

interface Integration {
  id: string;
  platform: Platform;
  is_active: boolean;
  page_id: string | null;
  page_name: string | null;
  page_access_token: string | null;
  page_access_token_set?: boolean;
  ig_business_id: string | null;
  ig_username: string | null;
  verify_token: string | null;
  app_secret: string | null;
  app_secret_set?: boolean;
  scopes: string | null;
  backfill_status: "idle" | "running" | "done" | "error";
  backfill_messages_ingested: number;
  backfill_conversations_seen: number;
  backfill_since: string | null;
  backfill_last_error: string | null;
  backfill_started_at: string | null;
  backfill_finished_at: string | null;
}

export default function MetaIntegrationPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Platform | null>(null);
  const [runningBackfill, setRunningBackfill] = useState<Platform | null>(null);

  const fetchIntegrations = useCallback(async () => {
    const res = await fetch("/api/admin/integrations/meta");
    const data = await res.json();
    if (res.ok) setIntegrations(data.integrations || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchIntegrations();
    const id = setInterval(fetchIntegrations, 4000);
    return () => clearInterval(id);
  }, [fetchIntegrations]);

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }

  const fb = integrations.find((i) => i.platform === "facebook");
  const ig = integrations.find((i) => i.platform === "instagram");
  const webhookUrl =
    typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/meta` : "";

  return (
    <div className="p-8 max-w-[1000px]">
      <div className="mb-6">
        <p className="text-[#0A4FE8] text-sm font-semibold">Integrations</p>
        <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">Facebook &amp; Instagram</h1>
        <p className="text-sm text-gray-500 mt-1">
          Connect a Facebook Page and/or linked Instagram Business account, then backfill up to 12 months of messages.
        </p>
      </div>

      <div className="mb-6 bg-blue-50 border border-blue-100 rounded-xl p-4 text-[12.5px] text-[#0D1B39]">
        <div className="flex items-center gap-2 mb-1 font-semibold">
          <Link2 className="w-3.5 h-3.5" /> Webhook URL
        </div>
        <code className="text-[11.5px] break-all">{webhookUrl}</code>
        <p className="text-[11px] text-gray-500 mt-1">
          Subscribe to <b>messages</b>, <b>messaging_postbacks</b>, and <b>message_reactions</b> under
          both the <b>Page</b> and <b>Instagram</b> products in the Meta Developer portal.
        </p>
      </div>

      {fb && (
        <PlatformCard
          integ={fb}
          label="Facebook Messenger"
          icon={<Facebook className="w-5 h-5" />}
          saving={saving === "facebook"}
          onSave={(patch) => save("facebook", patch)}
          runningBackfill={runningBackfill === "facebook"}
          onBackfill={(months, reset) => runBackfill("facebook", months, reset)}
        />
      )}
      <div className="h-4" />
      {ig && (
        <PlatformCard
          integ={ig}
          label="Instagram"
          icon={<Instagram className="w-5 h-5" />}
          saving={saving === "instagram"}
          onSave={(patch) => save("instagram", patch)}
          runningBackfill={runningBackfill === "instagram"}
          onBackfill={(months, reset) => runBackfill("instagram", months, reset)}
        />
      )}
    </div>
  );

  async function save(platform: Platform, patch: Record<string, unknown>) {
    setSaving(platform);
    await fetch("/api/admin/integrations/meta", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, ...patch }),
    });
    await fetchIntegrations();
    setSaving(null);
  }

  async function runBackfill(platform: Platform, months: number, reset: boolean) {
    setRunningBackfill(platform);
    try {
      // Keep stepping until the server reports done.
      while (true) {
        const res = await fetch("/api/admin/integrations/meta/backfill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform, months, reset }),
        });
        const data = await res.json();
        reset = false; // only reset once
        if (!res.ok) break;
        await fetchIntegrations();
        if (data.done) break;
      }
    } finally {
      setRunningBackfill(null);
      await fetchIntegrations();
    }
  }
}

function PlatformCard({
  integ,
  label,
  icon,
  saving,
  onSave,
  runningBackfill,
  onBackfill,
}: {
  integ: Integration;
  label: string;
  icon: React.ReactNode;
  saving: boolean;
  onSave: (patch: Record<string, unknown>) => void;
  runningBackfill: boolean;
  onBackfill: (months: number, reset: boolean) => void;
}) {
  const [form, setForm] = useState({
    page_id: integ.page_id ?? "",
    page_name: integ.page_name ?? "",
    page_access_token: "",
    ig_business_id: integ.ig_business_id ?? "",
    ig_username: integ.ig_username ?? "",
    verify_token: integ.verify_token ?? "",
    app_secret: "",
  });
  const [months, setMonths] = useState(12);

  // Re-sync form when the integration row refreshes (avoid clobbering user edits mid-type).
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current) return;
    setForm((prev) => ({
      ...prev,
      page_id: integ.page_id ?? prev.page_id,
      page_name: integ.page_name ?? prev.page_name,
      ig_business_id: integ.ig_business_id ?? prev.ig_business_id,
      ig_username: integ.ig_username ?? prev.ig_username,
      verify_token: integ.verify_token ?? prev.verify_token,
    }));
    hydrated.current = true;
  }, [integ]);

  const isIg = integ.platform === "instagram";

  return (
    <section className="bg-white border border-gray-100 rounded-2xl p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0A4FE8]/10 text-[#0A4FE8] flex items-center justify-center">
            {icon}
          </div>
          <div>
            <h2 className="font-semibold text-[#0D1B39]">{label}</h2>
            <p className="text-[12px] text-gray-500">
              {integ.is_active ? "Active" : "Not connected"}
              {integ.page_name ? ` · ${integ.page_name}` : ""}
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-[12px] text-gray-600">
          <input
            type="checkbox"
            checked={integ.is_active}
            onChange={(e) => onSave({ is_active: e.target.checked })}
            disabled={saving}
          />
          Active
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Page ID" value={form.page_id} onChange={(v) => setForm({ ...form, page_id: v })} />
        <Field label="Page Name" value={form.page_name} onChange={(v) => setForm({ ...form, page_name: v })} />
        <Field
          label={`Page Access Token${integ.page_access_token_set ? " (currently set)" : ""}`}
          value={form.page_access_token}
          onChange={(v) => setForm({ ...form, page_access_token: v })}
          placeholder={integ.page_access_token_set ? "Leave blank to keep current" : "EAAG…"}
          masked
        />
        <Field label="Verify Token" value={form.verify_token} onChange={(v) => setForm({ ...form, verify_token: v })} />
        {isIg && (
          <>
            <Field label="Instagram Business ID" value={form.ig_business_id} onChange={(v) => setForm({ ...form, ig_business_id: v })} />
            <Field label="Instagram Username" value={form.ig_username} onChange={(v) => setForm({ ...form, ig_username: v })} />
          </>
        )}
        <Field
          label={`App Secret${integ.app_secret_set ? " (currently set)" : ""}`}
          value={form.app_secret}
          onChange={(v) => setForm({ ...form, app_secret: v })}
          placeholder={integ.app_secret_set ? "Leave blank to keep current" : ""}
          masked
        />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => onSave(form)}
          disabled={saving}
          className="px-4 py-2 bg-[#0A4FE8] text-white rounded-lg text-[13px] font-semibold hover:bg-[#083bb3] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="mt-6 border-t border-gray-100 pt-5">
        <h3 className="font-semibold text-[#0D1B39] text-[14px] mb-1">Backfill historical messages</h3>
        <p className="text-[12px] text-gray-500 mb-3">
          Pulls past messages via Graph API and inserts them into the unified inbox. Safe to re-run;
          duplicates are skipped.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[12.5px]">
            <span className="text-gray-600">Months back</span>
            <input
              type="number"
              min={1}
              max={24}
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="w-16 px-2 py-1 rounded-md border border-gray-200 text-[12.5px]"
            />
          </label>
          <button
            onClick={() => onBackfill(months, true)}
            disabled={runningBackfill || !integ.page_access_token_set}
            className="px-4 py-2 rounded-lg text-[13px] font-semibold border border-[#0A4FE8] text-[#0A4FE8] hover:bg-blue-50 disabled:opacity-40"
            title={!integ.page_access_token_set ? "Save a page access token first" : ""}
          >
            {runningBackfill ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Running…
              </span>
            ) : (
              `Backfill last ${months} months`
            )}
          </button>
          {integ.backfill_status === "running" && !runningBackfill && (
            <button
              onClick={() => onBackfill(months, false)}
              className="px-3 py-2 rounded-lg text-[12.5px] text-gray-700 border border-gray-200 hover:border-[#0A4FE8]"
            >
              Resume
            </button>
          )}
        </div>

        <BackfillStatus integ={integ} />
      </div>
    </section>
  );
}

function BackfillStatus({ integ }: { integ: Integration }) {
  if (integ.backfill_status === "idle") return null;

  const Icon =
    integ.backfill_status === "running" ? Clock :
    integ.backfill_status === "done" ? CheckCircle2 :
    AlertCircle;
  const tone =
    integ.backfill_status === "running" ? "bg-blue-50 text-blue-700 border-blue-100" :
    integ.backfill_status === "done" ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
    "bg-rose-50 text-rose-700 border-rose-100";

  return (
    <div className={`mt-3 rounded-xl border p-3 text-[12.5px] flex items-start gap-2 ${tone}`}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="font-semibold capitalize">{integ.backfill_status}</p>
        <p className="mt-0.5">
          {integ.backfill_messages_ingested.toLocaleString()} messages across {integ.backfill_conversations_seen.toLocaleString()} conversations
          {integ.backfill_since ? ` · since ${new Date(integ.backfill_since).toLocaleDateString()}` : ""}
        </p>
        {integ.backfill_last_error && (
          <p className="mt-1 text-[11.5px] break-words">Error: {integ.backfill_last_error}</p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  masked,
}: {
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
