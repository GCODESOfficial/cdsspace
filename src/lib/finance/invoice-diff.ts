/* eslint-disable @typescript-eslint/no-explicit-any */
import { formatMoney } from "@/lib/finance/types";

type Row = Record<string, any>;

type FieldKind = "number" | "money" | "percent" | "date";

const FIELD_LABELS: Array<[key: string, label: string, kind?: FieldKind]> = [
  ["client_name", "Client"],
  ["client_email", "Client email"],
  ["client_address", "Client address"],
  ["currency", "Currency"],
  ["issue_date", "Issue date", "date"],
  ["due_date", "Due date", "date"],
  ["discount", "Discount", "money"],
  ["tax_rate", "Tax rate", "percent"],
  ["total", "Total", "money"],
  ["payment_terms", "Payment terms"],
  ["revisions_note", "Revisions"],
  ["working_hours", "Working hours"],
  ["delivery_speed", "Delivery speed"],
  ["delivery_period", "Delivery period"],
  ["notes", "Notes"],
];

function text(value: unknown) {
  return String(value ?? "").trim();
}

// Snapshots store dates either as "2026-09-27" or a full timestamp.
function dateOnly(value: unknown) {
  return text(value).slice(0, 10);
}

function same(a: unknown, b: unknown, kind?: FieldKind) {
  if (kind === "number" || kind === "money" || kind === "percent") return Math.abs(Number(a || 0) - Number(b || 0)) < 0.005;
  if (kind === "date") return dateOnly(a) === dateOnly(b);
  return text(a) === text(b);
}

function display(value: unknown, kind: FieldKind | undefined, currency: string) {
  if (kind === "date") return dateOnly(value) || "empty";
  if (kind === "money") return formatMoney(Number(value || 0), currency as never);
  if (kind === "percent") return `${Number(value || 0)}%`;
  const shown = text(value);
  if (!shown) return "empty";
  return shown.length > 60 ? `${shown.slice(0, 57)}...` : shown;
}

function itemKey(item: Row) {
  return text(item.name).toLowerCase();
}

function itemLabel(item: Row, currency: string) {
  const quantity = Number(item.quantity || 0);
  const lineTotal = Number(item.total ?? quantity * Number(item.unit_price || 0));
  return `${text(item.name)} x ${quantity} (${formatMoney(lineTotal, currency as never)})`;
}

export interface InvoiceChanges {
  added: string[];
  removed: string[];
  changed: string[];
}

/** Human-readable difference between two saved invoice snapshots. */
export function diffInvoiceSnapshots(
  before: { invoice: Row | null; items: Row[] },
  after: { invoice: Row | null; items: Row[] },
): InvoiceChanges {
  const currency = text(after.invoice?.currency || before.invoice?.currency || "NGN");
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  const beforeItems = new Map<string, Row[]>();
  for (const item of before.items) beforeItems.set(itemKey(item), [...(beforeItems.get(itemKey(item)) || []), item]);
  for (const item of after.items) {
    const matches = beforeItems.get(itemKey(item));
    const previous = matches?.shift();
    if (!previous) {
      added.push(itemLabel(item, currency));
      continue;
    }
    const parts: string[] = [];
    if (!same(previous.quantity, item.quantity, "number")) parts.push(`qty ${Number(previous.quantity)} to ${Number(item.quantity)}`);
    if (!same(previous.unit_price, item.unit_price, "number")) {
      parts.push(`price ${formatMoney(Number(previous.unit_price), currency as never)} to ${formatMoney(Number(item.unit_price), currency as never)}`);
    }
    if (!same(previous.description, item.description)) parts.push("description edited");
    if (parts.length) changed.push(`${text(item.name)}: ${parts.join(", ")}`);
  }
  for (const leftovers of beforeItems.values()) for (const item of leftovers) removed.push(itemLabel(item, currency));

  if (before.invoice && after.invoice) {
    for (const [key, label, kind] of FIELD_LABELS) {
      if (!(key in after.invoice)) continue;
      if (same(before.invoice[key], after.invoice[key], kind)) continue;
      changed.push(`${label}: ${display(before.invoice[key], kind, currency)} to ${display(after.invoice[key], kind, currency)}`);
    }
  }

  return { added, removed, changed };
}

export function hasInvoiceChanges(changes: InvoiceChanges) {
  return changes.added.length + changes.removed.length + changes.changed.length > 0;
}

/** Short list for a notification line: the first few entries, then a count. */
export function summariseList(entries: string[], limit = 3) {
  if (entries.length <= limit) return entries.join("; ");
  return `${entries.slice(0, limit).join("; ")} and ${entries.length - limit} more`;
}
