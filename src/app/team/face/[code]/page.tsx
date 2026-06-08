"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { Camera, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";

interface FaceChallenge {
  token: string;
  purpose: "enrollment" | "verification" | "login";
  actions: string[];
  expires_at: string;
}

export default function TeamFaceMobilePage() {
  const params = useParams<{ code: string }>();
  const code = String(params?.code || "").toUpperCase();
  const [challenge, setChallenge] = useState<FaceChallenge | null>(null);
  const [memberName, setMemberName] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "complete" | "expired" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const isMobileLike = useMemo(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(pointer: coarse)").matches || /mobile|android|iphone|ipod/i.test(navigator.userAgent);
  }, []);

  useEffect(() => {
    if (!code) return;
    fetch(`/api/team/face/challenge?code=${encodeURIComponent(code)}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || "Face link is invalid.");
        if (json.status === "completed") {
          setStatus("complete");
          return;
        }
        if (json.status === "expired") {
          setStatus("expired");
          return;
        }
        setChallenge(json.challenge);
        setMemberName(json.member?.full_name || "");
        setStatus("ready");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Face link is invalid.");
        setStatus("error");
      });
  }, [code]);

  return (
    <main className="min-h-dvh bg-[#F0F5FF] px-4 py-6 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-[520px] flex-col justify-center">
        <div className="rounded-[28px] border border-white/70 bg-white p-5 shadow-[0_24px_80px_rgba(13,27,57,0.12)] sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <Image src="/navbar/CDS Logo.svg" alt="CDS Space" width={58} height={32} className="brightness-0" />
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.24em] text-[#0A4FE8]">CDS Space</p>
              <p className="text-[12px] text-slate-500">Face verification</p>
            </div>
          </div>

          {!isMobileLike ? (
            <StateMessage
              title="Open this link on your phone"
              body="For security, liveness checks are completed from a mobile camera. Scan the QR code from your login screen or type the short link into your phone."
            />
          ) : status === "loading" ? (
            <StateMessage title="Loading face check" body="Preparing your secure phone verification." loading />
          ) : status === "complete" ? (
            <StateMessage title="Face check complete" body="Return to your original login device. It will continue automatically." success />
          ) : status === "expired" ? (
            <StateMessage title="Face link expired" body="Return to the login screen and request a fresh QR code." />
          ) : status === "error" || !challenge ? (
            <StateMessage title="Face link unavailable" body={error || "Return to the login screen and request a fresh QR code."} />
          ) : (
            <MobileFaceCapture
              challenge={challenge}
              memberName={memberName}
              onDone={() => setStatus("complete")}
            />
          )}
        </div>
      </div>
    </main>
  );
}

function StateMessage({
  title,
  body,
  loading,
  success,
}: {
  title: string;
  body: string;
  loading?: boolean;
  success?: boolean;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-8 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#0A4FE8] shadow-sm">
        {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : success ? <CheckCircle2 className="h-7 w-7 text-emerald-600" /> : <ShieldCheck className="h-6 w-6" />}
      </div>
      <h1 className="text-[20px] font-bold tracking-tight text-[#0D1B39]">{title}</h1>
      <p className="mx-auto mt-2 max-w-[360px] text-[14px] leading-6 text-slate-500">{body}</p>
    </div>
  );
}

function MobileFaceCapture({
  challenge,
  memberName,
  onDone,
}: {
  challenge: FaceChallenge;
  memberName: string;
  onDone: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [step, setStep] = useState(0);
  const [neutralImage, setNeutralImage] = useState<string | null>(null);
  const [captures, setCaptures] = useState<{ action: string; image: string }[]>([]);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isEnrollment = challenge.purpose === "enrollment";
  const totalSteps = challenge.actions.length + 1;
  const currentAction = step >= totalSteps
    ? "Liveness complete"
    : step === 0
      ? "Look straight at the camera"
      : challenge.actions[step - 1];

  useEffect(() => {
    let mounted = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera permission is required for face verification.");
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then(async (stream) => {
        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraReady(true);
      })
      .catch(() => setError("Camera permission is required for face verification."));
    return () => {
      mounted = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function captureFrame() {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setError("Camera is not ready yet.");
      return;
    }
    const size = Math.min(video.videoWidth, video.videoHeight);
    const sx = Math.round((video.videoWidth - size) / 2);
    const sy = Math.round((video.videoHeight - size) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = 360;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, 360, 360);
    const image = canvas.toDataURL("image/jpeg", 0.72);
    if (step === 0) {
      setNeutralImage(image);
    } else {
      const action = challenge.actions[step - 1];
      setCaptures((current) => [...current.filter((item) => item.action !== action), { action, image }]);
    }
    setStep((current) => Math.min(totalSteps, current + 1));
    setError(null);
  }

  async function submitFace() {
    if (!neutralImage || captures.length < challenge.actions.length) {
      setError("Complete every liveness step before continuing.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/team/face/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: challenge.token,
          neutral_image: neutralImage,
          challenge_images: captures,
          handoff: true,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Face verification failed.");
        return;
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      onDone();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-[12px] font-bold uppercase tracking-[0.24em] text-[#0A4FE8]">
          {isEnrollment ? "Face setup" : "Face verification"}
        </p>
        <h1 className="mt-2 text-[24px] font-bold leading-tight tracking-tight text-[#0D1B39]">
          {isEnrollment ? "Set up your face login" : "Verify your face"}
        </h1>
        <p className="mt-2 text-[14px] leading-6 text-slate-500">
          {memberName ? `${memberName.split(" ")[0]}, ` : ""}
          complete the liveness check here. Your login device will continue after success.
        </p>
      </div>

      <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-black">
        <video ref={videoRef} muted playsInline className="aspect-square w-full object-cover" />
      </div>

      <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
          Step {Math.min(step + 1, totalSteps)} of {totalSteps}
        </p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="text-[16px] font-bold capitalize text-[#0D1B39]">{currentAction}</p>
          {step >= totalSteps && <CheckCircle2 className="h-6 w-6 text-emerald-600" />}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-600">
          {error}
        </div>
      )}

      {step < totalSteps ? (
        <button
          type="button"
          onClick={captureFrame}
          disabled={!cameraReady}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#0A4FE8] text-[14px] font-bold text-white shadow-lg shadow-blue-600/20 disabled:opacity-50"
        >
          <Camera className="h-4 w-4" />
          Capture
        </button>
      ) : (
        <button
          type="button"
          onClick={submitFace}
          disabled={submitting}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#0A4FE8] text-[14px] font-bold text-white shadow-lg shadow-blue-600/20 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Finish face check
        </button>
      )}
    </div>
  );
}
