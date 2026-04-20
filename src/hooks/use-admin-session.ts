"use client";

import { useEffect, useState } from "react";

export interface AdminSession {
  role: "super_admin" | "sub_admin";
  email: string;
  name: string;
  permissions: string[];
}

export function useAdminSession() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin-check")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.authenticated) {
          setSession({
            role: data.role,
            email: data.email,
            name: data.name,
            permissions: data.permissions || [],
          });
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  return { session, isLoading };
}
