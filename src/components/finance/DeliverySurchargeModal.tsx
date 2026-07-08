"use client";

import { useEffect, useState } from "react";
import { Zap, Rocket, Clock as ClockIcon, X, Percent, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DeliverySpeed } from "@/lib/finance/types";
import { deliverySpeedMeta, formatMoney } from "@/lib/finance/types";
import type { Currency } from "@/lib/finance/types";

/**
 * Prompts the admin to confirm the surcharge (percent of subtotal OR flat
 * amount) when Express / Super Express / Flash is picked. The value is added
 * to the invoice as a separate line-item in the parent via `onConfirm`.
 *
 * Surcharge of 0 just closes the modal without adding anything.
 */
export default function DeliverySurchargeModal({
  speed,
  subtotal,
  currency,
  onCancel,
  onConfirm,
}: {
  speed: DeliverySpeed;
  subtotal: number;
  currency: Currency;
  onCancel: () => void;
  onConfirm: (payload: { amount: number; note: string }) => void;
}) {
  const meta = deliverySpeedMeta(speed);
  const [mode, setMode] = useState<"pct" | "flat">(meta.surchargeType === "pct" ? "pct" : "flat");
  const [pct, setPct] = useState<string>(String(meta.defaultSurcharge ?? 0));
  const [flat, setFlat] = useState<string>("0");

  useEffect(() => {
    setMode(meta.surchargeType === "pct" ? "pct" : "flat");
    setPct(String(meta.defaultSurcharge ?? 0));
    setFlat("0");
  }, [speed, meta.surchargeType, meta.defaultSurcharge]);

  const Icon = speed === "flash" ? Zap : speed === "super_express" ? Rocket : ClockIcon;
  const accent =
    speed === "flash" ? "from-rose-500 to-orange-500"
    : speed === "super_express" ? "from-fuchsia-500 to-purple-500"
    : "from-blue-500 to-indigo-500";

  const amount =
    mode === "pct"
      ? Math.round(Number(subtotal) * (Number(pct || 0) / 100) * 100) / 100
      : Math.round(Number(flat || 0) * 100) / 100;

  const disabled = amount <= 0;

  const confirm = () => {
    const note =
      mode === "pct"
        ? `${meta.label} delivery surcharge (${pct}% of subtotal)`
        : `${meta.label} delivery surcharge`;
    onConfirm({ amount, note });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm grid place-items-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${accent} grid place-items-center shadow-lg shadow-blue-600/20`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-gray-900">{meta.label} - Delivery Surcharge</h2>
              <p className="text-[12px] text-gray-500 mt-0.5">{meta.helper} comes with an extra cost. Confirm how much to add.</p>
            </div>
          </div>
          <button onClick={onCancel} className="w-8 h-8 rounded-lg hover:bg-gray-100 grid place-items-center text-gray-400 hover:text-gray-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode("pct")}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-semibold transition ${
                mode === "pct" ? "bg-blue-600 text-white shadow-lg shadow-blue-600/25" : "bg-gray-100 text-gray-600"
              }`}
            >
              <Percent className="w-3.5 h-3.5" /> Percentage
            </button>
            <button
              type="button"
              onClick={() => setMode("flat")}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-semibold transition ${
                mode === "flat" ? "bg-blue-600 text-white shadow-lg shadow-blue-600/25" : "bg-gray-100 text-gray-600"
              }`}
            >
              <Banknote className="w-3.5 h-3.5" /> Flat amount
            </button>
          </div>

          {mode === "pct" ? (
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-gray-500">Surcharge (% of subtotal)</Label>
              <div className="relative mt-1.5">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  className="h-11 rounded-xl pr-10"
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
                  autoFocus
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">%</span>
              </div>
            </div>
          ) : (
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-gray-500">Surcharge amount ({currency})</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                className="h-11 rounded-xl mt-1.5"
                value={flat}
                onChange={(e) => setFlat(e.target.value)}
                autoFocus
              />
            </div>
          )}

          <div className="rounded-xl bg-blue-50/70 border border-blue-100 p-3 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-blue-700 font-semibold">Added to invoice</div>
              <div className="text-[11px] text-gray-500">{mode === "pct" ? `${pct || 0}% of ${formatMoney(subtotal, currency)}` : "Flat surcharge"}</div>
            </div>
            <div className="text-lg font-bold text-blue-700 tabular-nums">{formatMoney(amount, currency)}</div>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 flex items-center justify-end gap-2 border-t border-gray-100">
          <Button variant="outline" className="h-10 px-4 rounded-xl" onClick={onCancel}>Cancel</Button>
          <Button
            onClick={confirm}
            disabled={disabled}
            className="h-10 px-5 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/30 disabled:opacity-60"
          >
            Add Surcharge
          </Button>
        </div>
      </div>
    </div>
  );
}
