"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/glashdb/client";

export default function AuthRecoveryPage() {
  const [message, setMessage] = useState("Confirming your recovery link…");

  useEffect(() => {
    (async () => {
      try {
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const search = new URLSearchParams(window.location.search);
        if (hash.get("error") || search.get("error")) throw new Error("recovery_failed");

        const accessToken = hash.get("access_token");
        const refreshToken = hash.get("refresh_token");
        const tokenHash = hash.get("token_hash");
        const code = search.get("code");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const glash = createClient() as any;
        if (tokenHash) {
          const { error } = await glash.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
          if (error) throw error;
        } else if (accessToken && refreshToken) {
          const { error } = await glash.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (error) throw error;
        } else if (code) {
          const { error } = await glash.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          throw new Error("missing_recovery_credentials");
        }
        window.location.replace("/reset-password");
      } catch {
        setMessage("This recovery link is invalid or expired. Redirecting…");
        window.setTimeout(() => window.location.replace("/forgot-password"), 1200);
      }
    })();
  }, []);

  return (
    <main className="grid min-h-screen place-items-center bg-brand-bg px-4">
      <div className="rounded-2xl border border-brand-stroke bg-white p-8 text-center shadow-sm">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#0A4FE8] border-t-transparent" />
        <p className="mt-4 text-[14px] font-medium text-brand-body">{message}</p>
      </div>
    </main>
  );
}
