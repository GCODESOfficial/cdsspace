"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { clientDashboardPath } from "@/lib/client-routes";
import type { ClientBillingCurrency } from "@/lib/client-billing";

export interface ClientAccountSnapshot {
  userId: string;
  publicUserId: string;
  email: string;
  fullName: string;
  companyName: string;
  phoneNumber: string;
  avatarUrl: string | null;
  billingCurrency: ClientBillingCurrency;
  createdAt: string | null;
}

interface ClientAccountContextValue {
  account: ClientAccountSnapshot;
  dashboardPath: (destination?: string) => string;
  updateAccount: (patch: Partial<Omit<ClientAccountSnapshot, "userId" | "email">>) => void;
}

const ClientAccountContext = createContext<ClientAccountContextValue | null>(null);

export function ClientAccountProvider({
  initialAccount,
  children,
}: {
  initialAccount: ClientAccountSnapshot;
  children: React.ReactNode;
}) {
  const [account, setAccount] = useState(initialAccount);
  const value = useMemo<ClientAccountContextValue>(() => ({
    account,
    dashboardPath: (destination = "/dashboard") => clientDashboardPath(account.publicUserId, destination),
    updateAccount: (patch) => setAccount((current) => ({ ...current, ...patch })),
  }), [account]);

  return <ClientAccountContext.Provider value={value}>{children}</ClientAccountContext.Provider>;
}

export function useClientAccount() {
  const context = useContext(ClientAccountContext);
  if (!context) throw new Error("useClientAccount must be used inside the protected client dashboard.");
  return context;
}
