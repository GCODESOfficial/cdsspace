"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { StaffSignInForm } from "@/components/auth/StaffSignInForm";

export default function TeamLoginPage() {
  const router = useRouter();
  const [checkingBridge, setCheckingBridge] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function bridgeIfPossible() {
      try {
        const teamSession = await fetch("/api/team/session", {
          credentials: "include",
          cache: "no-store",
        });
        if (!cancelled && teamSession.ok) {
          router.replace("/team");
          return;
        }

        const bridge = await fetch("/api/admin/team-bridge", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
        });
        if (!cancelled && bridge.ok) {
          router.replace("/team");
          return;
        }
      } catch {
        // Fall through to normal team login.
      } finally {
        if (!cancelled) setCheckingBridge(false);
      }
    }

    bridgeIfPossible();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (checkingBridge) return null;

  return (
    <AuthLayout>
      <Suspense fallback={null}>
        <StaffSignInForm initialTab="team" />
      </Suspense>
    </AuthLayout>
  );
}
