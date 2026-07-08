"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, Check, X as XIcon, Eraser, Upload as UploadIcon } from "lucide-react";
import { parseCDocBody } from "@/lib/cdocs-markdown";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";

interface SignRequest {
  id: string;
  status: "pending" | "opened" | "signed" | "declined" | "cancelled";
  access_token: string;
  signed_png_url: string | null;
  signed_at: string | null;
}

interface DocPayload {
  id: string;
  title: string;
  body: string;
  theme: "light" | "dark";
  share_token: string;
}

export default function SignPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [reqRow, setReqRow] = useState<SignRequest | null>(null);
  const [doc, setDoc] = useState<DocPayload | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [phase, setPhase] = useState<"draw" | "place" | "done">("draw");
  const [submitting, setSubmitting] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [placement, setPlacement] = useState<{ x: number; y: number; page: number }>({ x: 50, y: 80, page: 1 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const r = await fetch(`/api/csign/${token}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.ok) { setNotFound(true); return; }
      setReqRow(j.request);
      setDoc(j.team_cdocs);
      if (j.request.status === "signed") setPhase("done");
    })();
  }, [token]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = doc?.theme === "dark" ? "#ffffff" : "#0D1B39";
  }, [doc?.theme, phase]);

  function pointer(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pointer(e);
  }
  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    const c = canvasRef.current!; const ctx = c.getContext("2d")!;
    const p = pointer(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  }
  function onUp() { drawing.current = false; last.current = null; }
  function clearCanvas() {
    const c = canvasRef.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setSignatureDataUrl(null);
  }

  function trimAndStage() {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    const img = ctx.getImageData(0, 0, c.width, c.height);
    let top = c.height, bottom = 0, left = c.width, right = 0;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const a = img.data[(y * c.width + x) * 4 + 3];
        if (a > 8) { if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y; }
      }
    }
    if (right < left || bottom < top) { appAlert("Draw your signature first."); return; }
    const pad = 6;
    const w = Math.max(right - left + pad * 2, 1);
    const h = Math.max(bottom - top + pad * 2, 1);
    const out = document.createElement("canvas");
    out.width = w; out.height = h;
    out.getContext("2d")!.drawImage(c, left - pad, top - pad, w, h, 0, 0, w, h);
    setSignatureDataUrl(out.toDataURL("image/png"));
    setPhase("place");
  }

  async function submitSignature() {
    if (!signatureDataUrl) return;
    setSubmitting(true);
    const r = await fetch(`/api/csign/${token}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signed_png_url: signatureDataUrl,
        signature_x: placement.x,
        signature_y: placement.y,
        signature_page: placement.page,
      }),
    });
    const j = await r.json();
    setSubmitting(false);
    if (!r.ok || !j.ok) { appAlert(j.error || "Couldn't submit"); return; }
    setPhase("done");
  }

  async function decline() {
    if (!(await appConfirm("Decline to sign this document?"))) return;
    await fetch(`/api/csign/${token}`, { method: "DELETE" });
    setReqRow(reqRow ? { ...reqRow, status: "declined" } : null);
  }

  if (notFound) return <FullScreen msg="Signature request not found or link expired." />;
  if (!reqRow || !doc) return <FullScreen><Loader2 className="w-5 h-5 animate-spin text-[#0A4FE8]" /></FullScreen>;
  if (reqRow.status === "declined") return <FullScreen msg="You declined to sign this document." />;

  const isDark = doc.theme === "dark";
  const blocks = parseCDocBody(doc.body || "");

  if (phase === "done") {
    return (
      <FullScreen>
        <div className="text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-3">
            <Check className="w-6 h-6 text-emerald-600" />
          </div>
          <p className="text-[16px] font-bold text-[#0D1B39]">Thank you - signature captured.</p>
          <p className="text-[12px] text-gray-500 mt-1">You can close this page. The sender has been notified.</p>
        </div>
      </FullScreen>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb]">
      <header className="px-4 md:px-8 py-3 bg-white border-b border-gray-100 flex items-center gap-3 sticky top-0 z-10">
        <div className="flex-1 min-w-0">
          <p className="text-[10.5px] uppercase tracking-[0.18em] text-[#0A4FE8] font-semibold">CDS Space · cSign</p>
          <h1 className="text-[14px] font-bold text-[#0D1B39] truncate">{doc.title}</h1>
        </div>
        <button onClick={decline} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-[12px] hover:text-rose-600">
          <XIcon className="w-3.5 h-3.5" /> Decline
        </button>
      </header>

      <main className="max-w-[780px] mx-auto p-4 md:p-6">
        {/* Doc preview */}
        <div className={`rounded-2xl overflow-hidden border shadow-sm mb-6 ${isDark ? "bg-[#0D1B39] text-white border-white/10" : "bg-white text-[#0D1B39] border-gray-100"}`}>
          <div className="p-5 md:p-8">
            <h2 className="text-[17px] font-bold mb-3">{doc.title}</h2>
            <div className="relative">
              {blocks.map((block, i) => {
                if (block.kind === "blank") return <div key={i} style={{ height: "0.6em" }} />;
                const text = block.spans.map((s) => s.text).join("");
                if (block.kind === "h1") return <h3 key={i} className="text-[15px] font-bold mt-4">{text}</h3>;
                if (block.kind === "h2") return <h4 key={i} className="text-[13.5px] font-semibold mt-3">{text}</h4>;
                if (block.kind === "bullet") return <li key={i} className="text-[12.5px] ml-5">{text}</li>;
                return (
                  <p key={i} className="text-[12.5px] leading-relaxed my-2">
                    {block.spans.map((s, j) => {
                      const style: React.CSSProperties = {};
                      if (s.type === "bold") style.fontWeight = 700;
                      if (s.type === "underline") style.textDecoration = "underline";
                      return <span key={j} style={style}>{s.text}</span>;
                    })}
                  </p>
                );
              })}
              {phase === "place" && signatureDataUrl && (
                <DraggableSignature
                  src={signatureDataUrl}
                  isDark={isDark}
                  onChange={(pos) => setPlacement({ ...pos, page: 1 })}
                />
              )}
            </div>
          </div>
        </div>

        {/* Signature pad */}
        {phase === "draw" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-[13px] font-semibold text-[#0D1B39] mb-1">Draw your signature</p>
            <p className="text-[11px] text-gray-400 mb-3">Use your mouse, stylus or finger. You can clear and redo.</p>
            <canvas
              ref={canvasRef}
              width={720}
              height={200}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              className="w-full h-[200px] bg-gray-50 rounded-xl border border-dashed border-gray-300 touch-none"
            />
            <div className="mt-3 flex items-center gap-2">
              <button onClick={clearCanvas} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-gray-600 text-[12px] hover:bg-gray-50">
                <Eraser className="w-3.5 h-3.5" /> Clear
              </button>
              <button onClick={trimAndStage} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0A4FE8] text-white text-[12px] font-medium hover:bg-[#083EC0] ml-auto">
                <UploadIcon className="w-3.5 h-3.5" /> Place on document
              </button>
            </div>
          </div>
        )}

        {phase === "place" && signatureDataUrl && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-[13px] font-semibold text-[#0D1B39] mb-1">Drag the signature to the right spot</p>
            <p className="text-[11px] text-gray-400 mb-3">Tap and drag inside the document preview above.</p>
            <div className="flex items-center gap-2">
              <button onClick={() => { setPhase("draw"); setSignatureDataUrl(null); }} className="px-3 py-2 rounded-lg border border-gray-200 text-gray-600 text-[12px] hover:bg-gray-50">
                Redraw
              </button>
              <button onClick={submitSignature} disabled={submitting} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#0A4FE8] text-white text-[12px] font-medium hover:bg-[#083EC0] ml-auto disabled:opacity-50">
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Save signature
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function DraggableSignature({ src, isDark, onChange }: { src: string; isDark: boolean; onChange: (p: { x: number; y: number }) => void }) {
  const [pos, setPos] = useState({ x: 50, y: 70 });
  const dragging = useRef(false);
  const start = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y };
  }
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current || !start.current || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const dx = ((e.clientX - start.current.px) / rect.width) * 100;
    const dy = ((e.clientY - start.current.py) / rect.height) * 100;
    const next = {
      x: Math.max(0, Math.min(100, start.current.ox + dx)),
      y: Math.max(0, Math.min(100, start.current.oy + dy)),
    };
    setPos(next);
    onChange(next);
  }
  function onUp() { dragging.current = false; start.current = null; }

  return (
    <div ref={wrapRef} className="absolute inset-0 pointer-events-none">
      <div
        className="absolute pointer-events-auto cursor-grab active:cursor-grabbing"
        style={{
          left: `${pos.x}%`,
          top: `${pos.y}%`,
          transform: "translate(-50%, -50%)",
          padding: 6,
          borderRadius: 8,
          boxShadow: "0 4px 18px rgba(10, 79, 232, 0.25)",
          background: isDark ? "rgba(10, 30, 80, 0.4)" : "rgba(255, 255, 255, 0.9)",
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <img src={src} alt="Signature" className="h-14 w-auto pointer-events-none select-none" />
      </div>
    </div>
  );
}

function FullScreen({ children, msg }: { children?: React.ReactNode; msg?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f7fb] px-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-sm w-full text-center">
        {msg ? <p className="text-[13px] text-gray-500">{msg}</p> : children}
      </div>
    </div>
  );
}
