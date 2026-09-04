"use client";

/**
 * "View as" - a super admin previewing the dashboard through another admin's
 * permissions.
 *
 * This is a preview, not an impersonation. Nothing about the session changes:
 * every request still carries the super admin's own cookie and the server still
 * answers with super admin authority. What changes is only which navigation and
 * which permission-gated controls this browser draws, which is what the tool is
 * for: seeing what a given person can reach without asking them to log in.
 * Because of that it must never be used to judge whether someone is locked out
 * of data, only out of navigation.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export interface ViewAsPerson {
  id: string;
  name: string;
  email: string | null;
  kind: "sub_admin" | "team_member";
  roleTitle: string | null;
  permissions: string[];
}

interface ViewAsValue {
  viewingAs: ViewAsPerson | null;
  setViewingAs: (person: ViewAsPerson | null) => void;
}

const ViewAsContext = createContext<ViewAsValue>({ viewingAs: null, setViewingAs: () => {} });

// Kept in sessionStorage rather than localStorage: a preview should end with
// the browser tab, never linger into a later session where the super admin has
// forgotten they are wearing someone else's navigation.
const STORAGE_KEY = "cds.admin.viewAs";

export function ViewAsProvider({ children }: { children: React.ReactNode }) {
  const [viewingAs, setViewingAsState] = useState<ViewAsPerson | null>(null);

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(STORAGE_KEY);
      if (stored) setViewingAsState(JSON.parse(stored) as ViewAsPerson);
    } catch {
      /* a malformed or unavailable store just means no preview */
    }
  }, []);

  const setViewingAs = useCallback((person: ViewAsPerson | null) => {
    setViewingAsState(person);
    try {
      if (person) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(person));
      else window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* preview still works for this render, it just will not survive a reload */
    }
  }, []);

  const value = useMemo(() => ({ viewingAs, setViewingAs }), [viewingAs, setViewingAs]);
  return <ViewAsContext.Provider value={value}>{children}</ViewAsContext.Provider>;
}

export function useViewAs() {
  return useContext(ViewAsContext);
}
