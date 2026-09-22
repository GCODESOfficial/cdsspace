"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, MonitorCog, PenLine, ShieldAlert } from "lucide-react";
import { appToast } from "@/lib/app-notify";

/**
 * Devices a team member holds, and the custody agreement each one carries.
 *
 * A device handed over used to leave nothing on record but an assignment row.
 * Signing here is what puts the assignee's acceptance of responsibility for
 * loss or damage on record, so the pending ones are shown first and cannot be
 * dismissed.
 */
type Agreement = {
  id: string;
  status: "pending" | "signed" | "declined";
  agreement_version: string;
  agreement_text: string;
  signer_name: string | null;
  signed_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  asset_tag: string;
  device_name: string;
  serial_number: string | null;
  manufacturer: string | null;
  model: string | null;
  equipment_type_name: string;
  assigned_at: string;
  assignment_note: string | null;
};

export function TeamEquipmentCustody() {
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [memberName, setMemberName] = useState("");
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/team/equipment", { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    setAgreements(json.agreements || []);
    setMemberName(json.memberName || "");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const pending = agreements.filter((item) => item.status === "pending");

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-brand-blue" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <header className="flex items-start gap-3">
        <div className="rounded-2xl bg-blue-50 p-2.5">
          <MonitorCog className="h-5 w-5 text-brand-blue" />
        </div>
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-brand-navy sm:text-[24px]">My equipment</h1>
          <p className="mt-1 text-[13px] text-brand-body">
            Company devices in your care. Each one carries an agreement you sign to accept responsibility for it.
          </p>
        </div>
      </header>

      {pending.length > 0 && (
        <p className="mt-5 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {pending.length === 1
            ? "One device is waiting for your signature."
            : `${pending.length} devices are waiting for your signature.`}
        </p>
      )}

      {agreements.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-[13px] text-brand-body">
          No company devices are assigned to you.
        </p>
      ) : (
        <ul className="mt-5 flex flex-col gap-3">
          {agreements.map((item) => (
            <li key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-brand-navy">{item.device_name}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-brand-blue">{item.asset_tag}</p>
                  <p className="mt-1.5 text-[12px] text-brand-body">
                    {item.equipment_type_name}
                    {item.serial_number ? ` | Serial ${item.serial_number}` : ""}
                    {` | Assigned ${new Date(item.assigned_at).toLocaleDateString()}`}
                  </p>
                  {item.assignment_note && <p className="mt-1 text-[12px] text-brand-body/80">{item.assignment_note}</p>}
                </div>
                <StatusBadge item={item} />
              </div>

              {item.status === "pending" && (
                openId === item.id ? (
                  <SignPanel
                    item={item}
                    defaultName={memberName}
                    onClose={() => setOpenId(null)}
                    onDone={async () => { setOpenId(null); await load(); }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpenId(item.id)}
                    className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#0A4FE8] px-4 py-2.5 text-[13px] font-semibold text-white hover:opacity-90"
                  >
                    <PenLine className="h-4 w-4" />
                    Read and sign
                  </button>
                )
              )}

              {item.status !== "pending" && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-[12px] font-semibold text-brand-blue">View the agreement</summary>
                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-[12px] leading-6 text-brand-body">{item.agreement_text}</pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ item }: { item: Agreement }) {
  if (item.status === "signed") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 text-[11px] font-semibold text-green-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Signed {item.signed_at ? new Date(item.signed_at).toLocaleDateString() : ""}
      </span>
    );
  }
  if (item.status === "declined") {
    return <span className="rounded-full bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-600">Declined</span>;
  }
  return <span className="rounded-full bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-700">Awaiting your signature</span>;
}

/** The agreement text, a typed name and a drawn signature, as cSign captures one. */
function SignPanel({
  item,
  defaultName,
  onClose,
  onDone,
}: {
  item: Agreement;
  defaultName: string;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [name, setName] = useState(defaultName);
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const box = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - box.left) * (canvas.width / box.width),
      y: (event.clientY - box.top) * (canvas.height / box.height),
    };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    drawing.current = true;
    setHasDrawn(true);
    const { x, y } = point(event);
    context.lineWidth = 2;
    context.lineCap = "round";
    context.strokeStyle = "#0D1B39";
    context.beginPath();
    context.moveTo(x, y);
    canvasRef.current?.setPointerCapture(event.pointerId);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const { x, y } = point(event);
    context.lineTo(x, y);
    context.stroke();
  };

  const end = () => { drawing.current = false; };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  async function submit() {
    if (saving) return;
    if (!accepted || name.trim().length < 2 || !hasDrawn) return;
    setSaving(true);
    const response = await fetch("/api/team/equipment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: item.id,
        signerName: name.trim(),
        signatureImage: canvasRef.current?.toDataURL("image/png"),
      }),
    });
    const json = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      appToast(json.error || "The agreement could not be signed.", "error");
      return;
    }
    appToast("Agreement signed. A copy is on your equipment record.", "success");
    await onDone();
  }

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-[12px] leading-6 text-brand-body">{item.agreement_text}</pre>

      <label className="mt-4 flex items-start gap-2.5 text-[13px] font-medium text-brand-navy">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#0A4FE8]"
        />
        <span>
          I accept custody of this device and full responsibility for its loss or damage while it is with me, on the terms above
          (version {item.agreement_version}).
        </span>
      </label>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-[12px] font-semibold text-brand-body" htmlFor={`name-${item.id}`}>Your full name</label>
          <input
            id={`name-${item.id}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] text-brand-navy outline-none focus:border-[#0A4FE8]"
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-brand-body">Draw your signature</span>
            <button type="button" onClick={clear} className="text-[11px] font-semibold text-brand-blue hover:underline">Clear</button>
          </div>
          <canvas
            ref={canvasRef}
            width={600}
            height={180}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
            aria-label="Signature drawing area"
            className="mt-1.5 h-[110px] w-full touch-none rounded-xl border border-dashed border-slate-300 bg-white"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={saving || !accepted || name.trim().length < 2 || !hasDrawn}
          className="inline-flex items-center gap-2 rounded-full bg-[#0A4FE8] px-4 py-2.5 text-[13px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
          {saving ? "Signing…" : "Sign and accept"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-slate-200 px-4 py-2.5 text-[13px] font-semibold text-brand-body hover:bg-white"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
