import { CLIENT_IDENTITY_PERMISSION, hasPermission } from "@/lib/admin-permissions";

/**
 * Who a client is, is not something every admin needs to know.
 *
 * An admin running production, routing work or watching project status can do
 * all of it against a project name and a stable reference. The name, the email
 * address and the phone number are withheld until the super admin ticks
 * "See Client Identity" for that specific person.
 *
 * The mask is applied on the server, where the data is read, so a withheld name
 * is not merely hidden in the markup - it never reaches the browser.
 */

export { CLIENT_IDENTITY_PERMISSION };

export function canSeeClientIdentity(permissions: string[] | null | undefined) {
  return hasPermission(permissions || [], CLIENT_IDENTITY_PERMISSION);
}

/**
 * A short, stable code for a client whose name is withheld.
 *
 * The same client reads as the same code everywhere, so an admin can still tell
 * two projects apart, group them and talk about "Client 7F3A" without ever
 * being told who it is. Not reversible: it is a digest, not an encoding.
 */
export function clientReference(seed: string | null | undefined) {
  const value = String(seed || "").trim().toLowerCase();
  if (!value) return "Client";
  // FNV-1a: small, dependency-free, and stable across processes and restarts,
  // which a runtime-seeded hash would not be.
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `Client ${hash.toString(16).toUpperCase().padStart(8, "0").slice(0, 4)}`;
}

export function maskClientName(name: string | null | undefined, allowed: boolean) {
  if (allowed) return name ?? null;
  return clientReference(name);
}

/** Contact details have no masked form that is still useful, so they are dropped. */
export function maskClientEmail(email: string | null | undefined, allowed: boolean) {
  return allowed ? (email ?? null) : null;
}

export function maskClientPhone(phone: string | null | undefined, allowed: boolean) {
  return allowed ? (phone ?? null) : null;
}

/** The field names carrying client identity across the finance and order tables. */
const NAME_FIELDS = ["client", "client_name", "customer_name", "bill_to"] as const;
const EMAIL_FIELDS = ["client_email", "customer_email", "bill_to_email", "contact_email"] as const;
const PHONE_FIELDS = ["client_phone", "customer_phone", "contact_phone", "phone_number"] as const;

/**
 * Masks every client identity field on a row read from the database.
 *
 * Returns the row untouched when the reader is allowed to see identity, so the
 * allowed path costs nothing and cannot accidentally mangle a name.
 */
export function maskClientRow<T extends Record<string, unknown>>(row: T, allowed: boolean): T {
  if (allowed || !row) return row;
  const masked: Record<string, unknown> = { ...row };
  // The name is replaced rather than removed: a row with no label at all is
  // unreadable, and the reference still lets one client be told from another.
  const seed = NAME_FIELDS.map((field) => row[field]).find((value) => typeof value === "string" && value.trim());
  for (const field of NAME_FIELDS) {
    if (field in masked && masked[field] != null) masked[field] = clientReference(String(seed ?? masked[field]));
  }
  for (const field of [...EMAIL_FIELDS, ...PHONE_FIELDS]) {
    if (field in masked) masked[field] = null;
  }
  return masked as T;
}

export function maskClientRows<T extends Record<string, unknown>>(rows: T[], allowed: boolean): T[] {
  if (allowed) return rows;
  return rows.map((row) => maskClientRow(row, allowed));
}
