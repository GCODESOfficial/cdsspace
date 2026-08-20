"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/glashdb/client";

/**
 * OAuth return handler (client component).
 *
 * GlashDB completes Google sign-in with the **implicit** flow: it redirects back
 * to this URL with the session in the URL *fragment* (`#access_token=…&refresh_token=…`).
 * A fragment is never sent to the server, so this MUST run in the browser. We
 * read the tokens, hand them to the GlashDB client via `setSession` (which writes
 * the session cookies), then finalize on the server and redirect.
 *
 * A `?code=…` (PKCE) response is handled as a fallback for completeness.
 */
export default function AuthCallbackPage() {
  const [message, setMessage] = useState("Signing you in…");

  useEffect(() => {
    (async () => {
      try {
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const search = new URLSearchParams(window.location.search);

        const oauthError =
          hash.get("error_description") || hash.get("error") || search.get("error");
        if (oauthError) {
          window.location.replace(`/login?error=${encodeURIComponent(oauthError)}`);
          return;
        }

        const accessToken = hash.get("access_token");
        const refreshToken = hash.get("refresh_token");
        const code = search.get("code");

        let nextPath: string;

        if (accessToken && refreshToken) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const glash = createClient() as any;
          const { error } = await glash.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;

          const res = await fetch("/api/auth/after-login", {
            method: "POST",
            credentials: "include",
          });
          const json = await res.json().catch(() => null);
          if (!res.ok || json?.ok !== true || typeof json?.next !== "string") {
            throw new Error("oauth_finalization_failed");
          }
          nextPath = json.next;
        } else if (code) {
          const exchange = await fetch("/api/auth/oauth/exchange", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code }),
          });
          const json = await exchange.json().catch(() => null);
          if (!exchange.ok || json?.ok !== true || typeof json?.next !== "string") {
            throw new Error("oauth_exchange_failed");
          }
          nextPath = json.next;
        } else {
          throw new Error("missing_credentials");
        }

        window.location.replace(nextPath);
      } catch {
        setMessage("Sign-in could not be completed. Redirecting…");
        window.location.replace("/login?error=auth_code_exchange_failed");
      }
    })();
  }, []);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-blue border-t-transparent" />
      <p className="text-[14px] font-medium text-brand-body">{message}</p>
    </div>
  );
}
