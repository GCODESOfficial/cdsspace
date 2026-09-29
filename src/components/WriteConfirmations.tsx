"use client";

import { useEffect } from "react";
import { appToast } from "@/lib/app-notify";

/**
 * Confirmation for the handful of writes that are a milestone for the user.
 *
 * This used to confirm every mutating call to our own API and stay quiet for a
 * denylist. That inverted the cost: a chat message, a reaction, a read receipt
 * and a filter change all read as "Done. Saved.", so the confirmation stopped
 * carrying information. It is now an allowlist: submitting a form, creating a
 * project, adding a team member - the completions worth interrupting for. A
 * screen that reports its own result still wins (see `alreadyAnnounced`).
 *
 * Patching fetch is still deliberate: it keeps the rule in one readable list
 * instead of scattered across call sites.
 */

/**
 * Surfaces that never warrant a floating confirmation, whatever they call.
 * Conversation and meeting screens are continuous activity - the message
 * appearing in the thread IS the confirmation.
 */
const QUIET_SURFACES = [
  "/chat",
  "/messages",
  "/cmeet",
  "/meetings",
  "/notifications",
];

/**
 * The writes worth confirming, by API path prefix. Everything not listed here
 * stays silent, so adding a new endpoint is an explicit decision rather than
 * an accident. `methods` defaults to POST alone: creating and submitting are
 * the milestone, editing a field of something that already exists is not.
 */
type MajorWrite = {
  prefix: string;
  methods?: string[];
  wording?: string;
  includeChildren?: boolean;
};

const MAJOR_WRITES: MajorWrite[] = [
  // Submissions from clients and the public.
  { prefix: "/api/consultation", wording: "Your request has been submitted." },
  { prefix: "/api/career/apply", wording: "Application submitted." },
  { prefix: "/api/forms/applications", wording: "Application submitted." },
  { prefix: "/api/requests", wording: "Request submitted." },
  { prefix: "/api/submit", wording: "Submitted." },
  { prefix: "/api/client/brand-brief", wording: "Brief submitted." },
  { prefix: "/api/brand-brief", includeChildren: true, wording: "Brief submitted." },
  { prefix: "/api/csign", includeChildren: true, wording: "Document signed." },
  { prefix: "/api/subscription", wording: "Subscription confirmed." },

  // Projects and the work that hangs off them.
  { prefix: "/api/admin/finance/projects", methods: ["POST", "DELETE"], wording: "Project created." },
  { prefix: "/api/admin/brand-briefs", wording: "Created." },
  { prefix: "/api/create/projects", wording: "Project created." },

  // People: team members, contractors, admins, clients.
  { prefix: "/api/admin/team-members", methods: ["POST", "DELETE"], wording: "Team member added." },
  { prefix: "/api/admin/team-invites", wording: "Invitation sent." },
  { prefix: "/api/admin/sub-admins/invite", wording: "Invitation sent." },
  { prefix: "/api/admin/finance/contractor-invites", wording: "Invitation sent." },
  { prefix: "/api/admin/finance/contractors", methods: ["POST", "DELETE"], wording: "Contractor added." },
  { prefix: "/api/admin/clients", methods: ["POST", "DELETE"], wording: "Client created." },
  { prefix: "/api/admin/departments", methods: ["POST", "DELETE"], wording: "Department created." },
  { prefix: "/api/admin/roles", methods: ["POST", "DELETE"], wording: "Role created." },

  // Money.
  { prefix: "/api/admin/finance/invoices", wording: "Invoice saved." },
  { prefix: "/api/admin/finance/quotations", wording: "Quotation created." },
  { prefix: "/api/admin/finance/payroll/runs", wording: "Payroll run created." },
  { prefix: "/api/finance/invoice", includeChildren: true, wording: "Payment submitted." },
  { prefix: "/api/admin/orders", methods: ["POST", "DELETE"], wording: "Order created." },
];

/**
 * Header a caller can set to stay silent, for a write the user did not ask for
 * - autosave being the obvious one - where a confirmation is pure noise.
 */
const SILENT_HEADER = "x-cds-silent";

/**
 * A confirmation is only warranted when the user actually asked for something.
 * A click or a form submit is that ask; typing is not, which is what separates
 * pressing Save from an autosave timer firing a few seconds after a keystroke.
 */
const COMMIT_WINDOW_MS = 4000;

/** The page the user is looking at, not the endpoint being called. */
function onQuietSurface() {
  const here = window.location.pathname;
  return QUIET_SURFACES.some(
    (surface) => here === surface || here.includes(`${surface}/`) || here.endsWith(surface),
  );
}

/** The matching rule for this call, or null when the write is not a milestone. */
function majorWrite(url: string, method: string): MajorWrite | null {
  let path: string;
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin !== window.location.origin) return null;
    path = parsed.pathname;
  } catch {
    return null;
  }
  // Match the intended endpoint boundary. A plain startsWith made a rule for
  // `/api/admin/clients` announce "Client created" for unrelated descendants
  // such as mailing autosaves, uploads, module toggles, and delivery updates.
  const rule = MAJOR_WRITES.find((candidate) =>
    path === candidate.prefix
    || (candidate.includeChildren && path.startsWith(`${candidate.prefix}/`)),
  );
  if (!rule) return null;
  const allowed = rule.methods ?? ["POST"];
  return allowed.includes(method) ? rule : null;
}

/**
 * True when something already told the user. Covers both toast systems by
 * looking for a live toast node, which is the only signal sonner exposes.
 */
function alreadyAnnounced() {
  return Boolean(document.querySelector("[data-sonner-toast], [data-app-toast]"));
}

/** True when the caller asked not to be confirmed. */
function askedForSilence(input: RequestInfo | URL, init?: RequestInit) {
  try {
    if (init?.headers && new Headers(init.headers).has(SILENT_HEADER)) return true;
    if (input instanceof Request && input.headers.has(SILENT_HEADER)) return true;
  } catch {
    // A malformed header set is not worth failing over.
  }
  return false;
}

export function WriteConfirmations() {
  useEffect(() => {
    // Capture phase, so a handler that stops propagation cannot hide the fact
    // that the user committed to something.
    let lastCommit = 0;
    const commit = () => { lastCommit = Date.now(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Enter") commit(); };
    document.addEventListener("click", commit, true);
    document.addEventListener("submit", commit, true);
    document.addEventListener("keydown", onKey, true);

    const native = window.fetch;
    // Guard against a double mount (fast refresh, or a second provider).
    if ((native as { __cdsWrapped?: boolean }).__cdsWrapped) return;

    const wrapped: typeof window.fetch = async (input, init) => {
      const method = String(
        init?.method || (input instanceof Request ? input.method : "GET"),
      ).toUpperCase();
      const url = input instanceof Request ? input.url : String(input);

      // Decide before awaiting: the surface can change while the call is in
      // flight, and the header set is cheapest to read now.
      const rule = majorWrite(url, method);
      const silent = askedForSilence(input, init) || onQuietSurface();
      const userAsked = Date.now() - lastCommit <= COMMIT_WINDOW_MS;

      const response = await native(input, init);

      // Quiet unless this is a milestone the user committed to and is here to
      // see. Otherwise the safety net becomes the noise.
      if (response.ok && rule && userAsked && !silent && !document.hidden) {
        // Let the caller render its own result first; only speak up if nothing did.
        window.setTimeout(() => {
          if (alreadyAnnounced()) return;
          try {
            const wording = method === "DELETE" ? "Deleted." : rule.wording || "Saved.";
            appToast({ kind: "success", title: "Done", message: wording });
          } catch {
            // A confirmation must never break the request it is confirming.
          }
        }, 350);
      }

      return response;
    };

    (wrapped as { __cdsWrapped?: boolean }).__cdsWrapped = true;
    window.fetch = wrapped;
    return () => {
      window.fetch = native;
      document.removeEventListener("click", commit, true);
      document.removeEventListener("submit", commit, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, []);

  return null;
}
