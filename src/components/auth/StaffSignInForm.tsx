"use client";

import { useEffect, useState } from "react";
import NextLink from "next/link";
import {
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  MapPin,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Users,
} from "lucide-react";

type Tab = "admin" | "team";

interface FaceChallenge {
  token: string;
  code: string;
  purpose: "enrollment" | "verification" | "login";
  actions: string[];
  expires_at: string;
}

interface FaceCompleteResult {
  ok: boolean;
  requires_geofence?: boolean;
  face_event_id?: string;
  member?: {
    full_name?: string | null;
  } | null;
}

interface GeofenceStep {
  faceEventId: string;
  memberName: string;
}

export function StaffSignInForm({ initialTab = "admin" }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);

  // Sync URL without full reload when user flips the toggle
  useEffect(() => {
    if (typeof window === "undefined") return;
    const target = tab === "admin" ? "/admin/login" : "/team/login";
    if (window.location.pathname !== target) {
      window.history.replaceState({}, "", target);
    }
  }, [tab]);

  // Shared state for both forms
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [teamBypassCode, setTeamBypassCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [faceChallenge, setFaceChallenge] = useState<FaceChallenge | null>(null);
  const [faceMemberName, setFaceMemberName] = useState("");
  const [geofenceStep, setGeofenceStep] = useState<GeofenceStep | null>(null);

  // Invite redemption from ?invite=TOKEN — works on both tabs. If a team
  // invite link is opened, we auto-switch to the Team tab so the pre-fill
  // lines up with the right endpoint.
  const [inviteStatus, setInviteStatus] = useState<"idle" | "redeeming" | "ready" | "error">("idle");
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteProcessed, setInviteProcessed] = useState(false);

  // Pre-fill from a just-redeemed team invite that walked the user through
  // /team/invite/[token]. The setup form stashes { username, password } in
  // sessionStorage and bounces here so the invitee can manually sign in.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (initialTab !== "team") return;
    const raw = sessionStorage.getItem("cds_team_invite_prefill");
    if (!raw) return;
    try {
      const { username, password: pw, full_name } = JSON.parse(raw) as {
        username?: string;
        password?: string;
        full_name?: string;
      };
      if (username) setIdentifier(username);
      if (pw) setPassword(pw);
      setInviteStatus("ready");
      setInviteMessage(
        `Welcome${full_name ? `, ${full_name.split(" ")[0]}` : ""}. Your account is ready — press Sign In to continue.`,
      );
    } catch {
      // ignore malformed payload
    } finally {
      sessionStorage.removeItem("cds_team_invite_prefill");
    }
  }, [initialTab]);

  useEffect(() => {
    if (typeof window === "undefined" || inviteProcessed) return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("invite");
    if (!token) return;

    const onTeamPath = window.location.pathname.startsWith("/team/");
    if (onTeamPath && tab !== "team") {
      setTab("team");
      return;
    }
    if (!onTeamPath && tab !== "admin") {
      setTab("admin");
      return;
    }

    setInviteProcessed(true);
    window.history.replaceState({}, "", window.location.pathname);

    const endpoint = onTeamPath ? "/api/team-invite-redeem" : "/api/admin-invite/redeem";
    setInviteStatus("redeeming");
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Invite could not be redeemed");
        // Team response: { username, email, password }
        // Admin response: { email, password }
        setIdentifier(json.username ?? json.email ?? "");
        setPassword(json.password ?? "");
        setInviteStatus("ready");
        setInviteMessage("Welcome. Your credentials are filled in — press Sign In to continue.");
      })
      .catch((e) => {
        setInviteStatus("error");
        setInviteMessage(e instanceof Error ? e.message : "Invite could not be redeemed.");
      });
  }, [tab, inviteProcessed]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFaceChallenge(null);
    setGeofenceStep(null);
    setIsLoading(true);

    try {
      if (tab === "admin") {
        const res = await fetch("/api/admin-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: identifier, password }),
          credentials: "include",
        });
        if (res.ok) {
          window.location.href = "/admin";
          return;
        }
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Invalid email or password");
      } else {
        const res = await fetch("/api/team/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identifier,
            password,
            bypass_code: teamBypassCode.trim() || undefined,
          }),
          credentials: "include",
        });
        const json = await res.json();
        if (json.requires_face_setup || json.requires_face_verification) {
          setFaceChallenge(json.face_challenge);
          setFaceMemberName(json.member?.full_name || "");
          return;
        }
        if (!res.ok || !json.ok) {
          setError(json.error || "Invalid credentials");
          return;
        }
        window.location.href = "/team";
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  function switchTab(next: Tab) {
    if (next === tab) return;
    setTab(next);
    setError(null);
    setFaceChallenge(null);
    setGeofenceStep(null);
    // Keep identifier/password so a user who mis-picked doesn't have to retype
  }

  const isAdmin = tab === "admin";

  if (!isAdmin && faceChallenge) {
    return (
      <FaceHandoffPanel
        challenge={faceChallenge}
        memberName={faceMemberName}
        onBack={() => {
          setFaceChallenge(null);
          setError(null);
        }}
        onDone={(result) => {
          if (result.requires_geofence && result.face_event_id) {
            setFaceChallenge(null);
            setGeofenceStep({
              faceEventId: result.face_event_id,
              memberName: result.member?.full_name || faceMemberName,
            });
            return;
          }
          window.location.href = "/team";
        }}
      />
    );
  }

  if (!isAdmin && geofenceStep) {
    return (
      <GeofencePanel
        faceEventId={geofenceStep.faceEventId}
        memberName={geofenceStep.memberName}
        onBack={() => {
          setGeofenceStep(null);
          setError(null);
        }}
      />
    );
  }

  return (
    <div className="w-full flex flex-col gap-6 lg:gap-8 xl:gap-[32px] 2xl:gap-[40px]">
      {/* Header */}
      <div className="flex flex-col gap-1.5 2xl:gap-2">
        <p className="text-[11px] lg:text-[12px] uppercase tracking-[0.2em] text-brand-blue font-bold">
          Team Portal
        </p>
        <h1 className="text-brand-navy text-[24px] lg:text-[28px] xl:text-[32px] 2xl:text-[40px] font-semibold tracking-[-0.02em] leading-tight">
          {isAdmin ? "Sign in as Admin" : "Sign in as Team"}
        </h1>
        <p className="text-brand-body text-[13px] lg:text-[14px] xl:text-[15px] 2xl:text-[16px] font-medium leading-relaxed">
          {isAdmin
            ? "Authorized personnel only. Access the staff dashboard to manage CDS Space."
            : "Welcome back. Pick up where you left off in your team workspace."}
        </p>
      </div>

      {/* Segmented toggle — Admin | Team side by side */}
      <div className="w-full bg-brand-bg border border-brand-stroke rounded-xl p-1 flex relative">
        <div
          className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl bg-white border border-brand-stroke shadow-[0_4px_12px_rgba(4,11,55,0.06)] transition-transform duration-300"
          style={{ transform: isAdmin ? "translateX(0)" : "translateX(100%)" }}
        />
        <button
          type="button"
          onClick={() => switchTab("admin")}
          className={`relative z-10 flex-1 inline-flex items-center justify-center gap-2 py-2.5 lg:py-3 rounded-xl text-[13px] lg:text-[14px] font-semibold transition-colors ${
            isAdmin ? "text-brand-blue" : "text-brand-body hover:text-brand-navy"
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Admin
        </button>
        <button
          type="button"
          onClick={() => switchTab("team")}
          className={`relative z-10 flex-1 inline-flex items-center justify-center gap-2 py-2.5 lg:py-3 rounded-xl text-[13px] lg:text-[14px] font-semibold transition-colors ${
            !isAdmin ? "text-brand-blue" : "text-brand-body hover:text-brand-navy"
          }`}
        >
          <Users className="w-4 h-4" />
          Team
        </button>
      </div>

      {/* Invite banner — shows for whichever tab redeemed the invite */}
      {inviteStatus !== "idle" && (
        <div
          className={
            "px-4 py-3 rounded-xl text-sm border " +
            (inviteStatus === "ready"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : inviteStatus === "error"
                ? "bg-rose-50 border-rose-200 text-rose-700"
                : "bg-blue-50 border-blue-200 text-blue-700")
          }
        >
          {inviteStatus === "redeeming" ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Redeeming invite…
            </span>
          ) : (
            inviteMessage
          )}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 lg:gap-5 2xl:gap-6">
        <div className="flex flex-col gap-1.5 2xl:gap-2">
          <label className="text-brand-body text-[13px] lg:text-[14px] 2xl:text-[15px] font-medium">
            {isAdmin ? "Email address" : "Username"}
          </label>
          <div className="bg-brand-bg border border-brand-stroke rounded-xl px-3 lg:px-4 py-3 lg:py-3.5 2xl:py-4 flex items-center transition-colors focus-within:border-brand-blue/40">
            <input
              type={isAdmin ? "email" : "text"}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={isAdmin ? "admin@cdsspace.pro" : "Enter your username"}
              required
              disabled={isLoading}
              autoComplete={isAdmin ? "email" : "username"}
              className="w-full bg-transparent outline-none text-brand-navy text-[13px] lg:text-[14px] 2xl:text-[15px] font-medium placeholder:text-brand-mute disabled:opacity-50"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5 2xl:gap-2">
          <label className="text-brand-body text-[13px] lg:text-[14px] 2xl:text-[15px] font-medium">
            Password
          </label>
          <div className="bg-brand-bg border border-brand-stroke rounded-xl px-3 lg:px-4 py-3 lg:py-3.5 2xl:py-4 flex items-center transition-colors focus-within:border-brand-blue/40">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              disabled={isLoading}
              autoComplete="current-password"
              className="w-full bg-transparent outline-none text-brand-navy text-[13px] lg:text-[14px] 2xl:text-[15px] font-medium placeholder:text-brand-mute disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-brand-mute hover:text-brand-body transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4 2xl:w-5 2xl:h-5" />
              ) : (
                <Eye className="w-4 h-4 2xl:w-5 2xl:h-5" />
              )}
            </button>
          </div>
        </div>

        {!isAdmin && (
          <div className="flex flex-col gap-1.5 2xl:gap-2">
            <label className="text-brand-body text-[13px] lg:text-[14px] 2xl:text-[15px] font-medium">
              Team bypass code
            </label>
            <div className="bg-brand-bg border border-brand-stroke rounded-xl px-3 lg:px-4 py-3 lg:py-3.5 2xl:py-4 flex items-center gap-2 transition-colors focus-within:border-brand-blue/40">
              <KeyRound className="h-4 w-4 text-brand-mute" />
              <input
                type="text"
                value={teamBypassCode}
                onChange={(e) => setTeamBypassCode(e.target.value.toUpperCase())}
                placeholder="Optional super-admin code"
                disabled={isLoading}
                autoComplete="one-time-code"
                className="w-full bg-transparent outline-none text-brand-navy text-[13px] lg:text-[14px] 2xl:text-[15px] font-medium placeholder:text-brand-mute disabled:opacity-50"
              />
            </div>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-600 px-3 lg:px-4 py-2.5 lg:py-3 rounded-xl text-xs lg:text-sm font-medium">
            {error}
          </div>
        )}

        {/* CTA — mirrors client sign-in button */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full h-[44px] lg:h-[48px] 2xl:h-[56px] rounded-xl p-[2px] bg-brand-bg border border-[#648EFC] shadow-[0_4px_8px_rgba(0,0,0,0.04)] group overflow-hidden disabled:opacity-70 disabled:cursor-not-allowed"
        >
          <div className="w-full h-full rounded-xl flex items-center justify-center transition-opacity group-hover:opacity-90 bg-linear-to-r from-[#0035C1] to-[#0575FF]">
            {isLoading ? (
              <Loader2 className="w-4 h-4 lg:w-5 lg:h-5 2xl:w-6 2xl:h-6 animate-spin text-white" />
            ) : (
              <span className="text-white text-[14px] lg:text-[15px] 2xl:text-[18px] font-medium">
                Sign in{isAdmin ? " to Admin" : " to Team Portal"}
              </span>
            )}
          </div>
        </button>
      </form>

      {/* Client sign-in cross-link */}
      <div className="flex items-center justify-center gap-1.5 lg:gap-2 text-[12px] lg:text-[13px]">
        <span className="text-brand-body font-medium">Are you a client?</span>
        <NextLink
          href="/login"
          className="text-brand-blue font-semibold hover:underline decoration-2 underline-offset-4"
        >
          Sign in here
        </NextLink>
      </div>
    </div>
  );
}

function FaceHandoffPanel({
  challenge,
  memberName,
  onBack,
  onDone,
}: {
  challenge: FaceChallenge;
  memberName: string;
  onBack: () => void;
  onDone: (result: FaceCompleteResult) => void;
}) {
  const [origin, setOrigin] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [pollingState, setPollingState] = useState<"waiting" | "verifying" | "expired" | "error">("waiting");
  const [error, setError] = useState<string | null>(null);
  const linkPath = `/team/face/${challenge.code}`;
  const fullLink = origin ? `${origin}${linkPath}` : linkPath;
  const isEnrollment = challenge.purpose === "enrollment";

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!fullLink.startsWith("http")) return;
    import("qrcode")
      .then((QRCode) => QRCode.toDataURL(fullLink, { margin: 1, width: 240, color: { dark: "#0D1B39", light: "#FFFFFF" } }))
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError("Could not generate QR code. Use the short link instead.");
      });
    return () => {
      cancelled = true;
    };
  }, [fullLink]);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        setPollingState((current) => current === "waiting" ? "verifying" : current);
        const res = await fetch(`/api/team/face/status?code=${encodeURIComponent(challenge.code)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setPollingState("error");
          setError(json.error || "Could not verify face handoff.");
          return;
        }
        if (json.status === "expired") {
          setPollingState("expired");
          setError("This face link expired. Go back and sign in again.");
          return;
        }
        if (json.status === "authenticated") {
          window.location.href = "/team";
          return;
        }
        if (json.status === "passed" && json.requires_geofence && json.face_event_id) {
          onDone({
            ok: true,
            requires_geofence: true,
            face_event_id: json.face_event_id,
            member: json.member,
          });
          return;
        }
        setPollingState("waiting");
      } catch {
        if (!cancelled) {
          setPollingState("error");
          setError("Connection lost while waiting for phone verification.");
        }
      }
    };
    const immediate = window.setTimeout(check, 800);
    const interval = window.setInterval(check, 2500);
    return () => {
      cancelled = true;
      window.clearTimeout(immediate);
      window.clearInterval(interval);
    };
  }, [challenge.code, onDone]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(fullLink);
    } catch {
      setError("Copy failed. Type the short link on your phone instead.");
    }
  }

  return (
    <div className="w-full flex flex-col gap-5 sm:gap-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-brand-blue font-bold">
          {isEnrollment ? "Face Setup" : "Face Verification"}
        </p>
        <h1 className="mt-2 text-brand-navy text-[26px] lg:text-[32px] font-semibold tracking-[-0.02em] leading-tight">
          Continue on your phone
        </h1>
        <p className="mt-2 text-brand-body text-sm leading-relaxed">
          {memberName ? `${memberName.split(" ")[0]}, ` : ""}
          scan the QR code or open the short link on your phone to complete the liveness check. This desktop will continue automatically.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center rounded-[24px] border border-brand-stroke bg-brand-bg p-4 sm:p-5">
        <div className="mx-auto flex h-[196px] w-[196px] items-center justify-center rounded-[24px] border border-white bg-white p-3 shadow-sm">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="Face verification QR code" className="h-full w-full" />
          ) : (
            <QrCode className="h-16 w-16 text-brand-blue/40" />
          )}
        </div>
        <div className="min-w-0">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-blue">
            <Smartphone className="h-3.5 w-3.5" />
            Phone check
          </div>
          <p className="text-[13px] font-semibold text-brand-navy">Short link</p>
          <div className="mt-2 flex items-center gap-2 rounded-2xl border border-brand-stroke bg-white px-3 py-3">
            <code className="min-w-0 flex-1 truncate text-[13px] font-semibold text-brand-navy">
              {fullLink.replace(/^https?:\/\//, "")}
            </code>
            <button
              type="button"
              onClick={copyLink}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-bg text-brand-blue"
              aria-label="Copy phone link"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-3 text-[12px] leading-5 text-brand-body/70">
            Link expires at {new Date(challenge.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-brand-stroke bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          {pollingState === "waiting" || pollingState === "verifying" ? (
            <Loader2 className="h-4 w-4 animate-spin text-brand-blue" />
          ) : (
            <RefreshCw className="h-4 w-4 text-rose-500" />
          )}
          <p className="text-[13px] font-semibold text-brand-navy">
            {pollingState === "waiting" || pollingState === "verifying"
              ? "Waiting for phone verification..."
              : "Phone verification needs attention"}
          </p>
        </div>
        {error && <p className="mt-2 text-[12px] leading-5 text-rose-600">{error}</p>}
      </div>

      <button
        type="button"
        onClick={onBack}
        className="h-12 rounded-xl border border-brand-stroke bg-white text-sm font-semibold text-brand-body"
      >
        Back to sign in
      </button>
    </div>
  );
}

function GeofencePanel({
  faceEventId,
  memberName,
  onBack,
}: {
  faceEventId: string;
  memberName: string;
  onBack: () => void;
}) {
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number | null;
    captured_at: string;
  } | null>(null);
  const [bypassCode, setBypassCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function captureLocation() {
    setError(null);
    if (!navigator.geolocation) {
      setError("Location access is not available in this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy ?? null,
          captured_at: new Date().toISOString(),
        });
        setLocating(false);
      },
      () => {
        setError("Location permission was denied. Enter a team bypass code to continue.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

  async function submitGeofence() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/team/login/geofence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          face_event_id: faceEventId,
          location,
          bypass_code: bypassCode.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Location verification failed.");
        return;
      }
      window.location.href = "/team";
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full flex flex-col gap-5">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-brand-blue font-bold">
          Location Check
        </p>
        <h1 className="mt-2 text-brand-navy text-[26px] lg:text-[32px] font-semibold tracking-[-0.02em] leading-tight">
          Verify office location
        </h1>
        <p className="mt-2 text-brand-body text-sm leading-relaxed">
          {memberName ? `${memberName.split(" ")[0]}, ` : ""}
          continue with your current location or a super-admin team bypass code.
        </p>
      </div>

      <div className="rounded-2xl border border-brand-stroke bg-brand-bg p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-brand-blue">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-brand-navy">
              {location ? "Location captured" : "CDS Space HQ geofence"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-brand-body">
              {location
                ? `Accuracy: ${Math.round(location.accuracy ?? 0)}m`
                : "Onsite and assigned hybrid staff must be within the office radius."}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 2xl:gap-2">
        <label className="text-brand-body text-[13px] lg:text-[14px] 2xl:text-[15px] font-medium">
          Team bypass code
        </label>
        <div className="bg-brand-bg border border-brand-stroke rounded-xl px-3 lg:px-4 py-3 lg:py-3.5 2xl:py-4 flex items-center gap-2 transition-colors focus-within:border-brand-blue/40">
          <KeyRound className="h-4 w-4 text-brand-mute" />
          <input
            type="text"
            value={bypassCode}
            onChange={(e) => setBypassCode(e.target.value.toUpperCase())}
            placeholder="Optional super-admin code"
            autoComplete="one-time-code"
            className="w-full bg-transparent outline-none text-brand-navy text-[13px] lg:text-[14px] 2xl:text-[15px] font-medium placeholder:text-brand-mute"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onBack}
          className="h-12 rounded-xl border border-brand-stroke bg-white text-sm font-semibold text-brand-body"
        >
          Back
        </button>
        <button
          type="button"
          onClick={captureLocation}
          disabled={locating}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-brand-stroke bg-white text-sm font-semibold text-brand-navy disabled:opacity-50"
        >
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
          Capture
        </button>
      </div>

      <button
        type="button"
        onClick={submitGeofence}
        disabled={submitting || (!location && !bypassCode.trim())}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-blue text-sm font-semibold text-white disabled:opacity-50"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        Finish sign in
      </button>
    </div>
  );
}
