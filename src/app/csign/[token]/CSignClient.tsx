"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, PenLine, Check, Eraser, ArrowLeft } from "lucide-react";

interface Request {
  id: string;
  status: "pending" | "signed" | "cancelled" | "expired";
  signer_email: string | null;
  signer_name: string | null;
  signed_at: string | null;
  signature_image_url: string | null;
  created_at: string;
  requested_by_name: string | null;
}

interface Doc {
  id: string;
  title: string;
  body: string;
}

export default function PublicCsignPage() {
  const params = useParams<{ token: string }>();
  const token = (params?.token || "").toString();

  const [request, setRequest] = useState<Request | null>(null);
  const [document, setDocument] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/csign/${token}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) {
          setError(j.error || "Link is invalid");
          return;
        }
        setRequest(j.request);
        setDocument(j.document);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#040B37";
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasStrokes(true);
  }

  function stopDraw() {
    setIsDrawing(false);
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  }

  async function submitSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/csign/${token}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signed_png_url: dataUrl }),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok || !json.ok) {
      setError(json.error || "Could not submit signature");
      return;
    }
    // Refetch to show signed state
    const r2 = await fetch(`/api/csign/${token}`);
    const j2 = await r2.json();
    if (j2.ok) {
      setRequest(j2.request);
      setDocument(j2.document);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-brand-blue animate-spin" />
      </div>
    );
  }

  if (error && !request) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-brand-stroke/30 p-10 max-w-md text-center">
          <h1 className="text-[22px] font-bold text-brand-navy mb-2">Link unavailable</h1>
          <p className="text-[13px] text-brand-body/70">{error}</p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-1.5 text-[13px] text-brand-blue font-semibold hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> CDS Space
          </Link>
        </div>
      </div>
    );
  }

  const isSigned = request?.status === "signed";
  const isDead = request?.status === "cancelled" || request?.status === "expired";

  return (
    <main className="min-h-screen bg-brand-bg">
      <header className="border-b border-brand-stroke/30 bg-white/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-[13px] text-brand-body hover:text-brand-blue transition">
            <ArrowLeft className="w-4 h-4" /> CDS Space
          </Link>
          <span className="text-[11px] text-brand-body/50 uppercase tracking-[0.15em] font-semibold">
            Signature request
          </span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-6 md:p-10 space-y-6">
        <div
          className="rounded-3xl overflow-hidden text-white p-8 md:p-10 relative"
          style={{ backgroundImage: "linear-gradient(146.28deg, #0035C1 8.83%, #0575FF 86.3%)" }}
        >
          <div className="absolute -top-20 -right-20 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 border border-white/20 text-[11px] uppercase tracking-[0.15em] font-bold mb-3">
              <PenLine className="w-3 h-3" /> Signature requested
            </div>
            <h1 className="text-[28px] md:text-[32px] font-bold tracking-tight leading-tight">
              {document?.title || "Please review and sign"}
            </h1>
            {request?.requested_by_name && (
              <p className="text-white/80 mt-2 text-[14px]">
                From <strong>{request.requested_by_name}</strong>
              </p>
            )}
          </div>
        </div>

        {document?.body && (
          <article className="bg-white rounded-2xl border border-brand-stroke/30 p-8 prose prose-sm max-w-none">
            <div className="whitespace-pre-line text-[14px] leading-relaxed text-brand-body">
              {document.body}
            </div>
          </article>
        )}

        {isSigned ? (
          <div className="bg-white rounded-2xl border border-emerald-200 p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
              <Check className="w-6 h-6" />
            </div>
            <h2 className="text-[18px] font-bold text-brand-navy">Signed</h2>
            <p className="text-[13px] text-brand-body/70 mt-1">
              Signed on {request?.signed_at ? new Date(request.signed_at).toLocaleString() : "unknown"}.
            </p>
            {request?.signature_image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={request.signature_image_url}
                alt="Signature"
                className="mt-6 mx-auto max-w-[320px] border border-brand-stroke/40 rounded-xl bg-white"
              />
            )}
          </div>
        ) : isDead ? (
          <div className="bg-white rounded-2xl border border-rose-200 p-8 text-center">
            <h2 className="text-[18px] font-bold text-rose-700">This request is no longer active.</h2>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-brand-stroke/30 p-6 md:p-8">
            <h2 className="text-[11px] uppercase tracking-[0.15em] font-bold text-brand-body/50 mb-3">
              Sign below
            </h2>
            <div className="rounded-xl border border-dashed border-brand-stroke/60 bg-brand-bg/40 overflow-hidden">
              <canvas
                ref={canvasRef}
                width={800}
                height={240}
                className="w-full h-[220px] touch-none cursor-crosshair"
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={stopDraw}
                onMouseLeave={stopDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={stopDraw}
              />
            </div>

            <div className="flex items-center justify-between mt-4 gap-3">
              <button
                onClick={clearCanvas}
                disabled={!hasStrokes}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-brand-stroke text-[12px] font-semibold text-brand-body hover:text-rose-600 hover:border-rose-200 transition disabled:opacity-40"
              >
                <Eraser className="w-3.5 h-3.5" />
                Clear
              </button>
              <button
                onClick={submitSignature}
                disabled={submitting || !hasStrokes}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-blue text-white text-[13px] font-semibold hover:bg-brand-blue/90 transition disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Submit signature
              </button>
            </div>

            {error && (
              <div className="mt-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[12px] px-4 py-2.5">
                {error}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
