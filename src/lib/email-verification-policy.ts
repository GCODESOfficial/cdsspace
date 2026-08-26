import "server-only";

import { resolveMx } from "node:dns/promises";
import { domainToASCII } from "node:url";
import { BLOCKED_EMAIL_MESSAGE, isBlockedEmail } from "@/lib/security/email-blocklist";

const RESERVED_DOMAINS = new Set([
  "example.com",
  "example.net",
  "example.org",
  "invalid",
  "localhost",
  "test",
]);

const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com",
  "guerrillamail.com",
  "maildrop.cc",
  "mailinator.com",
  "sharklasers.com",
  "tempmail.com",
  "temp-mail.org",
  "yopmail.com",
]);

const mxCache = new Map<string, { valid: boolean; expiresAt: number }>();
const DNS_CACHE_MS = 15 * 60_000;

function normalizedAddress(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at <= 0 || at !== email.indexOf("@")) return null;

  const local = email.slice(0, at);
  const rawDomain = email.slice(at + 1);
  const domain = domainToASCII(rawDomain).toLowerCase();
  if (!domain || email.length > 254 || local.length > 64 || domain.length > 253) return null;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return null;
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) return null;
  if (domain.split(".").some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) return null;
  return `${local}@${domain}`;
}

function domainIsBlocked(domain: string) {
  return RESERVED_DOMAINS.has(domain)
    || DISPOSABLE_DOMAINS.has(domain)
    || domain.endsWith(".example")
    || domain.endsWith(".invalid")
    || domain.endsWith(".localhost")
    || domain.endsWith(".test");
}

async function hasMailExchange(domain: string) {
  const cached = mxCache.get(domain);
  if (cached && cached.expiresAt > Date.now()) return cached.valid;

  const records = await Promise.race([
    resolveMx(domain),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("dns_timeout")), 5_000)),
  ]);
  const valid = records.some((record) => Boolean(record.exchange && record.exchange !== "."));
  mxCache.set(domain, { valid, expiresAt: Date.now() + DNS_CACHE_MS });
  return valid;
}

export async function verifyNewAccountEmail(value: unknown): Promise<
  | { ok: true; email: string }
  | { ok: false; error: string }
> {
  const email = normalizedAddress(value);
  if (!email) return { ok: false, error: "Enter a valid email address." };
  if (isBlockedEmail(email)) return { ok: false, error: BLOCKED_EMAIL_MESSAGE };

  const domain = email.slice(email.lastIndexOf("@") + 1);
  if (domainIsBlocked(domain)) {
    return { ok: false, error: "Use a permanent personal or business email address." };
  }

  try {
    if (!(await hasMailExchange(domain))) {
      return { ok: false, error: "That email domain cannot receive verification emails." };
    }
  } catch (error) {
    const code = String((error as { code?: unknown } | null)?.code || "");
    if (["ENODATA", "ENOTFOUND", "EBADNAME"].includes(code)) {
      return { ok: false, error: "That email domain cannot receive verification emails." };
    }
    return { ok: false, error: "We could not verify that email domain. Please try again." };
  }

  return { ok: true, email };
}
