export const CMEET_TOPIC_SUGGESTIONS = [
  "Onboarding meeting",
  "Team meeting",
  "Client meeting",
  "Project kickoff",
  "Weekly check-in",
  "Training session",
] as const;

export function normalizeCMeetTopic(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 120);
}

export function cmeetTopicSlug(value: unknown): string {
  const normalized = normalizeCMeetTopic(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72)
    .replace(/-+$/g, "");
  return normalized || "meeting";
}

/** Build the public, title-aware cMeet URL while preserving the room code. */
export function buildCMeetPath(roomCode: string, topic?: unknown, guestToken?: string | null): string {
  const code = encodeURIComponent(String(roomCode || "").trim());
  const base = topic ? `/meet/${code}/${cmeetTopicSlug(topic)}` : `/meet/${code}`;
  return guestToken ? `${base}?g=${encodeURIComponent(guestToken)}` : base;
}

/** Convert any cMeet URL into an internal route that joins as soon as identity is resolved. */
export function buildCMeetAutoJoinPath(value: string): string {
  const url = new URL(String(value || ""), "https://cdsspace.pro");
  url.searchParams.delete("embed");
  url.searchParams.set("join", "1");
  return `${url.pathname}${url.search}`;
}
