"use client";

import { useEffect, useState } from "react";
import NextLink from "next/link";
import { Eye, EyeOff, Loader2, ShieldCheck, Users, Download, Monitor, Smartphone, CheckCircle2 } from "lucide-react";
import { detectPlatform, detectOs, type Platform } from "@/lib/desktop-app";

type Tab = "admin" | "team";

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
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Invite redemption from ?invite=TOKEN - works on both tabs. If a team
  // invite link is opened, we auto-switch to the Team tab so the pre-fill
  // lines up with the right endpoint.
  const [inviteStatus, setInviteStatus] = useState<"idle" | "redeeming" | "ready" | "error">("idle");
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteProcessed, setInviteProcessed] = useState(false);

  // Platform detection for the team-portal download prompt. Runs client-side
  // only (defaults to desktop-browser during SSR so nothing flashes wrong).
  const [platform, setPlatform] = useState<Platform>("desktop-browser");
  const [os, setOs] = useState<"mac" | "windows" | "other">("other");
  useEffect(() => {
    setPlatform(detectPlatform());
    setOs(detectOs());
  }, []);

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
        `Welcome${full_name ? `, ${full_name.split(" ")[0]}` : ""}. Your account is ready - press Sign In to continue.`,
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
        setInviteMessage("Welcome. Your credentials are filled in - press Sign In to continue.");
      })
      .catch((e) => {
        setInviteStatus("error");
        setInviteMessage(e instanceof Error ? e.message : "Invite could not be redeemed.");
      });
  }, [tab, inviteProcessed]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
          body: JSON.stringify({ identifier, password }),
          credentials: "include",
        });
        const json = await res.json();
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
    // Keep identifier/password so a user who mis-picked doesn't have to retype
  }

  const isAdmin = tab === "admin";

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

      {/* Segmented toggle - Admin | Team side by side */}
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

      {/* Team: platform-aware access prompt */}
      {!isAdmin && platform === "desktop-browser" && (
        <div className="rounded-2xl border border-brand-blue/20 bg-brand-blue/[0.04] p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10">
              <Monitor className="h-5 w-5 text-brand-blue" />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-brand-navy">Get the CDS Space app</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-brand-body/70">
                For full work sessions (automatic background reporting across all your screens),
                download the desktop app and sign in there. You can also just continue in this
                browser below — sign-in works either way.
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <NextLink
              href="/download"
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition ${os === "mac" ? "bg-brand-blue text-white hover:bg-brand-blue/90" : "bg-white text-brand-navy border border-brand-stroke hover:border-brand-blue/40"}`}
            >
              <Download className="h-4 w-4" /> Download for macOS
            </NextLink>
            <NextLink
              href="/download"
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition ${os === "windows" ? "bg-brand-blue text-white hover:bg-brand-blue/90" : "bg-white text-brand-navy border border-brand-stroke hover:border-brand-blue/40"}`}
            >
              <Download className="h-4 w-4" /> Download for Windows
            </NextLink>
          </div>
          <p className="mt-2 text-center text-[11.5px] text-brand-body/50">
            Continuing in the browser signs you in with activity-only tracking.
          </p>
        </div>
      )}

      {/* Team: running inside the desktop app */}
      {!isAdmin && platform === "desktop-app" && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12.5px] font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> CDS Space desktop app detected — you&apos;re all set to sign in.
        </div>
      )}

      {/* Team: mobile / tablet — web portal is allowed here */}
      {!isAdmin && platform === "mobile" && (
        <div className="flex items-start gap-2 rounded-xl border border-brand-blue/20 bg-brand-blue/[0.04] px-4 py-3 text-[12.5px] leading-relaxed text-brand-body/75">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" />
          <span>On mobile you can sign in and use the web portal directly. The desktop app is only needed on computers.</span>
        </div>
      )}

      {/* Team policy notice: VPN + monitoring disclosure (all platforms) */}
      {!isAdmin && (
        <div className="px-4 py-3 rounded-xl text-[12.5px] leading-relaxed border bg-amber-50 border-amber-200 text-amber-800">
          <p className="font-semibold">Before you sign in</p>
          <ul className="mt-1 list-disc pl-4 space-y-0.5">
            <li><b>Do not use a VPN</b> when logging in or checking in — it interferes with attendance and location verification.</li>
            <li>Work sessions are monitored during work hours (activity and periodic screen captures) to keep reporting, compliance and productive use of work time fair for everyone.</li>
          </ul>
        </div>
      )}

      {/* Invite banner - shows for whichever tab redeemed the invite */}
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

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-600 px-3 lg:px-4 py-2.5 lg:py-3 rounded-xl text-xs lg:text-sm font-medium">
            {error}
          </div>
        )}

        {/* CTA - mirrors client sign-in button */}
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
