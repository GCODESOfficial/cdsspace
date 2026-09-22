"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { clientDashboardPath } from "@/lib/client-routes";
import type { ClientBillingCurrency } from "@/lib/client-billing";
import { allClientModulesEnabled, type ClientModuleKey, type ClientModuleVisibility } from "@/lib/client-modules";

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
  /** Which dashboard modules admin has left switched on for this client. */
  modules: ClientModuleVisibility;
  isModuleEnabled: (key: ClientModuleKey) => boolean;
  dashboardPath: (destination?: string) => string;
  updateAccount: (patch: Partial<Omit<ClientAccountSnapshot, "userId" | "email">>) => void;
}

const ClientAccountContext = createContext<ClientAccountContextValue | null>(null);

export function ClientAccountProvider({
  initialAccount,
  modules,
  children,
}: {
  initialAccount: ClientAccountSnapshot;
  modules?: ClientModuleVisibility;
  children: React.ReactNode;
}) {
  const [account, setAccount] = useState(initialAccount);
  const resolvedModules = useMemo(() => modules || allClientModulesEnabled(), [modules]);
  const value = useMemo<ClientAccountContextValue>(() => ({
    account,
    modules: resolvedModules,
    isModuleEnabled: (key) => resolvedModules[key] !== false,
    dashboardPath: (destination = "/dashboard") => clientDashboardPath(account.publicUserId, destination),
    updateAccount: (patch) => setAccount((current) => ({ ...current, ...patch })),
  }), [account, resolvedModules]);

  return <ClientAccountContext.Provider value={value}>{children}</ClientAccountContext.Provider>;
}

export function useClientAccount() {
  const context = useContext(ClientAccountContext);
  if (!context) throw new Error("useClientAccount must be used inside the protected client dashboard.");
  return context;
}
