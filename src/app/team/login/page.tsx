"use client";

import { Suspense } from "react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { StaffSignInForm } from "@/components/auth/StaffSignInForm";

export default function TeamLoginPage() {
  return (
    <AuthLayout>
      <Suspense fallback={null}>
        <StaffSignInForm initialTab="team" />
      </Suspense>
    </AuthLayout>
  );
}
