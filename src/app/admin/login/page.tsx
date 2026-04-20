"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<"idle" | "redeeming" | "ready" | "error">("idle");
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  // If the URL carries ?invite=TOKEN, redeem it once and pre-fill the form.
  // The token is stripped from the URL immediately so it can't be bookmarked
  // or leaked through referrer headers on subsequent navigations.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("invite");
    if (!token) return;

    window.history.replaceState({}, "", window.location.pathname);

    setInviteStatus("redeeming");
    fetch("/api/admin-invite/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Invite could not be redeemed");
        setEmail(json.email ?? "");
        setPassword(json.password ?? "");
        setInviteStatus("ready");
        setInviteMessage("Welcome. Your credentials are filled in — press Sign In to continue.");
      })
      .catch((e) => {
        setInviteStatus("error");
        setInviteMessage(e instanceof Error ? e.message : "Invite could not be redeemed.");
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });

      if (res.ok) {
        // Hard reload so the freshly set httpOnly admin_session cookie is
        // included in the very next request. router.push() can race the
        // cookie set on production deployments behind a CDN.
        window.location.href = "/admin";
        return;
      }
      setError("Invalid email or password");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#151D48] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image
            src="/images/cds-logo.svg"
            alt="CDS Space Logo"
            width={120}
            height={45}
          />
        </div>

        {/* Card */}
        <div className="bg-gradient-to-b from-[#08129C] to-[#072056] rounded-2xl p-8 shadow-2xl">
          <h1 className="text-2xl font-bold text-white text-center mb-2">
            Admin Login
          </h1>
          <p className="text-gray-400 text-sm text-center mb-8">
            Authorized personnel only
          </p>

          {/* Invite status banner */}
          {inviteStatus !== "idle" && (
            <div
              className={
                "mb-5 px-4 py-3 rounded-xl text-sm border " +
                (inviteStatus === "ready"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : inviteStatus === "error"
                    ? "bg-red-500/10 border-red-500/30 text-red-300"
                    : "bg-blue-500/10 border-blue-500/30 text-blue-200")
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

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-sm text-gray-300 mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter admin email"
                required
                disabled={isLoading}
                className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm text-gray-300 mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  required
                  disabled={isLoading}
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#FFFFFF] to-[#5BA8FF] text-[#151D48] font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> Signing in...
                </span>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
