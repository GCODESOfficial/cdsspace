export const CMEET_AGENDA_ITEM_LIMIT = 24;
export const CMEET_AGENDA_ITEM_MAX_LENGTH = 180;

export function normalizeCMeetAgendaItems(value: unknown): string[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n/)
      : [];

  const unique = new Set<string>();
  for (const entry of source) {
    const title = String(entry || "").replace(/\s+/g, " ").trim().slice(0, CMEET_AGENDA_ITEM_MAX_LENGTH);
    if (title) unique.add(title);
    if (unique.size >= CMEET_AGENDA_ITEM_LIMIT) break;
  }
  return Array.from(unique);
}

export function agendaItemsToText(items: string[]) {
  return items.join("\n");
}
