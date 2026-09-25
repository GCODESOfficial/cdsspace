"use client";

import { useRef, useState } from "react";
import { Check, Eraser, PenLine } from "lucide-react";

export function LiveSignaturePad({ onSave, busy = false }: { onSave: (file: File) => void | Promise<void>; busy?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const bounds = canvas.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * canvas.width / bounds.width, y: (event.clientY - bounds.top) * canvas.height / bounds.height };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawing.current = true; last.current = point(event); canvas.setPointerCapture(event.pointerId);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    const canvas = canvasRef.current!;
    const context = canvas.getContext("2d");
    if (!context) return;
    const native = event.nativeEvent;
    const samples = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [native];
    context.strokeStyle = "#07133B"; context.lineCap = "round"; context.lineJoin = "round"; context.lineWidth = 5;
    for (const sample of samples) {
      const bounds = canvas.getBoundingClientRect();
      const next = { x: (sample.clientX - bounds.left) * canvas.width / bounds.width, y: (sample.clientY - bounds.top) * canvas.height / bounds.height };
      context.beginPath(); context.moveTo(last.current.x, last.current.y); context.lineTo(next.x, next.y); context.stroke(); last.current = next;
    }
    setHasInk(true);
  }

  function end(event: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = false; last.current = null;
    if (canvasRef.current?.hasPointerCapture(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId);
  }

  function clear() {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
    for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
      if (image.data[(y * canvas.width + x) * 4 + 3] > 10) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
    }
    if (right < left || bottom < top) return;
    const padding = 18;
    left = Math.max(0, left - padding); top = Math.max(0, top - padding); right = Math.min(canvas.width - 1, right + padding); bottom = Math.min(canvas.height - 1, bottom + padding);
    const trimmed = document.createElement("canvas"); trimmed.width = right - left + 1; trimmed.height = bottom - top + 1;
    trimmed.getContext("2d")?.putImageData(context.getImageData(left, top, trimmed.width, trimmed.height), 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => trimmed.toBlob(resolve, "image/png"));
    if (blob) await onSave(new File([blob], `cSign-${new Date().toISOString().slice(0, 10)}.png`, { type: "image/png" }));
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-[11.5px] text-[#07133B]"><PenLine className="h-4 w-4 shrink-0 text-[#0A4FE8]" /><span>Sign naturally with a mouse, finger, or stylus. cSign removes the empty area before adding it to your letter.</span></div>
      <canvas ref={canvasRef} width={900} height={300} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} className="h-[210px] w-full touch-none rounded-xl border border-dashed border-[#AFC3E7] bg-white shadow-inner sm:h-[250px]" aria-label="Draw your signature" />
      <div className="mt-4 flex flex-wrap justify-between gap-2">
        <button type="button" onClick={clear} className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 px-4 text-[12px] font-semibold text-gray-600 hover:bg-gray-50"><Eraser className="h-4 w-4" />Clear</button>
        <button type="button" disabled={!hasInk || busy} onClick={() => void save()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-[12px] font-semibold text-white hover:bg-[#083EC0] disabled:opacity-50"><Check className="h-4 w-4" />{busy ? "Saving signature…" : "Use this signature"}</button>
      </div>
    </div>
  );
}
