/**
 * Client helpers for the CMeet lobby.
 *
 * The server decides admission; these only carry the question and the answer.
 * Nothing here can let someone in on its own, which is deliberate: the checks
 * that matter live in /api/cmeet/[code]/admission.
 */

export type AdmissionStatus = "admitted" | "waiting" | "denied";

export interface AdmissionResult {
  status: AdmissionStatus;
  /** True for an admin host or the authenticated non-admin room creator. */
  canAdmit: boolean;
  requestId?: string;
  /** Server-verified role used by the in-call host/co-host UI. */
  role?: "host" | "cohost" | "staff" | "invited" | "guest";
}

export interface WaitingGuest {
  id: string;
  peer_id: string;
  name: string;
  email: string | null;
  requested_at: string;
}

/** Reads the invited-client token out of the link we emailed them. */
export function guestTokenFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("g");
}

export async function requestAdmission(
  code: string,
  peerId: string,
  name: string,
): Promise<AdmissionResult> {
  const response = await fetch(`/api/cmeet/${encodeURIComponent(code)}/admission`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ peerId, name, guestToken: guestTokenFromUrl() }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Could not reach the meeting host.");
  return payload as AdmissionResult;
}

/** Polls this peer's own verdict while it sits in the lobby. */
export async function pollAdmission(code: string, peerId: string): Promise<AdmissionStatus> {
  const query = new URLSearchParams({ peer: peerId });
  const token = guestTokenFromUrl();
  if (token) query.set("g", token);
  const response = await fetch(`/api/cmeet/${encodeURIComponent(code)}/admission?${query}`, {
    credentials: "include",
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  return (payload.status as AdmissionStatus) || "waiting";
}

/** Host/co-host view: everyone currently knocking. */
export async function fetchWaitingGuests(code: string): Promise<WaitingGuest[]> {
  const response = await fetch(`/api/cmeet/${encodeURIComponent(code)}/admission`, {
    credentials: "include",
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  return payload.canAdmit ? (payload.waiting as WaitingGuest[]) || [] : [];
}

export async function decideAdmission(code: string, requestId: string, admit: boolean) {
  const response = await fetch(`/api/cmeet/${encodeURIComponent(code)}/admission`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "decide", requestId, decision: admit ? "admit" : "deny" }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Could not update this admission request.");
}

/** Fetch short-lived relay credentials after the server has admitted a peer. */
export async function fetchCMeetIceServers(code: string, peerId: string): Promise<RTCIceServer[]> {
  const response = await fetch(`/api/cmeet/${encodeURIComponent(code)}/ice-servers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({ peerId, guestToken: guestTokenFromUrl() }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Could not configure the meeting relay.");
  return Array.isArray(payload.iceServers) ? payload.iceServers as RTCIceServer[] : [];
}
