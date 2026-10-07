import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";
import {
  CLIENT_DASHBOARD_SESSION_COOKIE,
  type ClientDashboardSessionClaims,
  verifyClientDashboardSession,
} from "@/lib/client-dashboard-session";
import { getGlashDbServiceRoleConfig } from "@/lib/glashdb/env";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";

// "apple" is Sign in with Apple, which only the iPhone app offers
// (/api/mobile/v1/auth/apple); the website cannot start or link it.
export type ClientAuthProvider = "google" | "linkedin" | "apple";

export type ClientAuthConnection = {
  provider: ClientAuthProvider;
  email: string;
  connectedAt: string;
  lastUsedAt: string;
};

type LinkedIdentityRow = {
  client_user_id: string;
  provider_email: string | null;
};

type ClientProfileIdentity = {
  id: string;
  email: string;
  email_verified_at: string | null;
};

type LinkIntent = {
  version: 1;
  provider: ClientAuthProvider;
  clientUserId: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

export type LinkAttempt = {
  provider: ClientAuthProvider;
  ok: boolean;
  next: string;
  message?: string;
};

export const CLIENT_OAUTH_LINK_COOKIE = "cds_client_oauth_link";
const LINK_PURPOSE = "client-oauth-account-link";
const LINK_LIFETIME_SECONDS = 10 * 60;
const PROVIDERS = new Set<ClientAuthProvider>(["google", "linkedin"]);

export function isClientAuthProvider(value: unknown): value is ClientAuthProvider {
  return value === "google" || value === "linkedin" || value === "apple";
}

/** Providers the website can start a sign-in or Account Config link for. */
export function isWebClientAuthProvider(value: unknown): value is "google" | "linkedin" {
  return value === "google" || value === "linkedin";
}

function signingSecret() {
  return getGlashDbServiceRoleConfig().serviceRoleKey;
}

function signLinkPayload(payload: string) {
  return createHmac("sha256", signingSecret()).update(LINK_PURPOSE).update(".").update(payload).digest("base64url");
}

export function createClientOAuthLinkIntent(session: ClientDashboardSessionClaims, provider: ClientAuthProvider) {
  const now = Math.floor(Date.now() / 1000);
  const intent: LinkIntent = {
    version: 1,
    provider,
    clientUserId: session.subject,
    issuedAt: now,
    expiresAt: now + LINK_LIFETIME_SECONDS,
    nonce: randomBytes(18).toString("base64url"),
  };
  const payload = Buffer.from(JSON.stringify(intent)).toString("base64url");
  return `${payload}.${signLinkPayload(payload)}`;
}

function verifyClientOAuthLinkIntent(token: unknown): LinkIntent | null {
  if (typeof token !== "string" || token.length > 4096) return null;
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return null;
  const expected = Buffer.from(signLinkPayload(payload));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const intent = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as LinkIntent;
    const now = Math.floor(Date.now() / 1000);
    if (
      intent.version !== 1
      || !PROVIDERS.has(intent.provider)
      || typeof intent.clientUserId !== "string"
      || !Number.isInteger(intent.issuedAt)
      || !Number.isInteger(intent.expiresAt)
      || intent.issuedAt > now + 60
      || intent.expiresAt <= now
      || intent.expiresAt - intent.issuedAt !== LINK_LIFETIME_SECONDS
      || typeof intent.nonce !== "string"
      || intent.nonce.length < 16
    ) return null;
    return intent;
  } catch {
    return null;
  }
}

export function setClientOAuthLinkCookie(response: NextResponse, token: string) {
  response.cookies.set(CLIENT_OAUTH_LINK_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: LINK_LIFETIME_SECONDS,
  });
  return response;
}

export function clearClientOAuthLinkCookie<T extends NextResponse>(response: T): T {
  response.cookies.set(CLIENT_OAUTH_LINK_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

function identityObject(user: User, provider: ClientAuthProvider) {
  const identities = Array.isArray(user.identities) ? user.identities : [];
  return identities.find((identity) => identity.provider === provider);
}

export function providerSubject(user: User, provider: ClientAuthProvider) {
  const metadataSubject = user.user_metadata?.[`${provider}_sub`];
  if (typeof metadataSubject === "string" && metadataSubject.trim()) return metadataSubject.trim();
  const identity = identityObject(user, provider);
  const providerId = (identity as (typeof identity & { provider_id?: unknown }))?.provider_id;
  const identityData = identity?.identity_data as Record<string, unknown> | undefined;
  const subject = providerId || identityData?.sub;
  if (typeof subject === "string" && subject.trim()) return subject.trim();
  const declaredProvider = user.app_metadata?.provider;
  return declaredProvider === provider ? user.id : "";
}

export function providerEmail(user: User, provider: ClientAuthProvider) {
  const identity = identityObject(user, provider);
  const identityData = identity?.identity_data as Record<string, unknown> | undefined;
  const email = identityData?.email || user.email;
  return typeof email === "string" ? email.trim().toLowerCase().slice(0, 320) : "";
}

export function oauthProviderForUser(user: User): ClientAuthProvider | null {
  const declared = user.app_metadata?.provider;
  if (isClientAuthProvider(declared)) return declared;
  if (providerSubject(user, "linkedin")) return "linkedin";
  if (providerSubject(user, "google")) return "google";
  if (providerSubject(user, "apple")) return "apple";
  return null;
}

export async function findLinkedClientIdentity(provider: ClientAuthProvider, subject: string) {
  if (!subject) return null;
  return glashMaybeOne<LinkedIdentityRow>(
    `select client_user_id, provider_email
       from public.client_auth_identities
      where provider = $1 and provider_subject = $2
      limit 1`,
    [provider, subject],
  );
}

export async function loadClientProfileIdentity(clientUserId: string) {
  return glashMaybeOne<ClientProfileIdentity>(
    `select id, email, email_verified_at
       from public.profiles
      where id = $1::uuid and account_status = 'active'
      limit 1`,
    [clientUserId],
  );
}

/** Register a normal provider login without taking a provider away from another account. */
export async function recordProviderLogin(input: {
  clientUserId: string;
  provider: ClientAuthProvider;
  subject: string;
  email: string;
}) {
  const row = await glashMaybeOne<LinkedIdentityRow>(
    `insert into public.client_auth_identities
       (client_user_id, provider, provider_subject, provider_email, provider_email_verified)
     values ($1::uuid, $2, $3, nullif($4, ''), true)
     on conflict (provider, provider_subject) do update set
       provider_email = coalesce(nullif(excluded.provider_email, ''), client_auth_identities.provider_email),
       provider_email_verified = true,
       last_used_at = now(),
       updated_at = now()
     returning client_user_id, provider_email`,
    [input.clientUserId, input.provider, input.subject, input.email],
  );
  return row;
}

/**
 * Explicit account linking proves both the current CDS session and the social
 * provider. It can therefore move that provider sign-in from a separate,
 * previously-created profile onto the active user ID without merging data.
 */
export async function connectProviderToClient(input: {
  clientUserId: string;
  provider: ClientAuthProvider;
  subject: string;
  email: string;
}) {
  return glashMaybeOne<{ client_user_id: string }>(
    `with active_client as (
       select id from public.profiles
        where id = $1::uuid and account_status = 'active'
     )
     insert into public.client_auth_identities
       (client_user_id, provider, provider_subject, provider_email, provider_email_verified)
     select id, $2, $3, nullif($4, ''), true from active_client
     on conflict (provider, provider_subject) do update set
       client_user_id = excluded.client_user_id,
       provider_email = coalesce(nullif(excluded.provider_email, ''), client_auth_identities.provider_email),
       provider_email_verified = true,
       connected_at = now(),
       last_used_at = now(),
       updated_at = now()
     returning client_user_id`,
    [input.clientUserId, input.provider, input.subject, input.email],
  );
}

function settingsResult(provider: ClientAuthProvider, ok: boolean, message?: string) {
  const query = new URLSearchParams({ connection: ok ? `${provider}_connected` : `${provider}_failed` });
  if (message) query.set("detail", message.slice(0, 140));
  return `/dashboard/settings?${query.toString()}`;
}

/** A non-null result means this callback began as an account-link attempt. */
export async function completeClientOAuthLinkAttempt(
  request: NextRequest,
  user: User,
  callbackProvider: ClientAuthProvider,
): Promise<LinkAttempt | null> {
  const rawIntent = request.cookies.get(CLIENT_OAUTH_LINK_COOKIE)?.value;
  if (!rawIntent) return null;

  const intent = verifyClientOAuthLinkIntent(rawIntent);
  const dashboardSession = verifyClientDashboardSession(
    request.cookies.get(CLIENT_DASHBOARD_SESSION_COOKIE)?.value,
  );
  if (!intent || !dashboardSession || intent.clientUserId !== dashboardSession.subject || intent.provider !== callbackProvider) {
    return {
      provider: callbackProvider,
      ok: false,
      next: settingsResult(callbackProvider, false, "The connection request expired. Start it again from Account Config."),
      message: "The connection request expired.",
    };
  }

  const subject = providerSubject(user, callbackProvider);
  const email = providerEmail(user, callbackProvider);
  if (!subject || !email) {
    return {
      provider: callbackProvider,
      ok: false,
      next: settingsResult(callbackProvider, false, "The provider did not return a verified account identity."),
      message: "The provider did not return a verified account identity.",
    };
  }

  try {
    const connected = await connectProviderToClient({
      clientUserId: intent.clientUserId,
      provider: callbackProvider,
      subject,
      email,
    });
    if (!connected) throw new Error("The active CDS Space account is unavailable.");
    return {
      provider: callbackProvider,
      ok: true,
      next: settingsResult(callbackProvider, true),
    };
  } catch {
    return {
      provider: callbackProvider,
      ok: false,
      next: settingsResult(callbackProvider, false, "This sign-in account could not be connected. Please try again."),
      message: "This sign-in account could not be connected.",
    };
  }
}

export async function listClientAuthConnections(clientUserId: string): Promise<ClientAuthConnection[]> {
  const rows = await glashQuery<{
    provider: ClientAuthProvider;
    provider_email: string | null;
    connected_at: string;
    last_used_at: string;
  }>(
    `select provider, provider_email, connected_at, last_used_at
       from public.client_auth_identities
      where client_user_id = $1::uuid
      order by provider`,
    [clientUserId],
  );
  return rows.map((row) => ({
    provider: row.provider,
    email: row.provider_email || "",
    connectedAt: String(row.connected_at),
    lastUsedAt: String(row.last_used_at),
  }));
}

/** Backfill native identities for an existing profile when Account Config opens. */
export async function syncNativeClientConnections(clientUserId: string) {
  const identities = await glashQuery<{
    provider: ClientAuthProvider;
    provider_id: string;
    email: string | null;
  }>(
    `select provider, provider_id, coalesce(nullif(email, ''), nullif(identity_data ->> 'email', '')) as email
       from auth.identities
      where user_id = $1::uuid
        and provider in ('google', 'linkedin')
        and nullif(provider_id, '') is not null`,
    [clientUserId],
  );
  for (const identity of identities) {
    await recordProviderLogin({
      clientUserId,
      provider: identity.provider,
      subject: identity.provider_id,
      email: identity.email || "",
    });
  }
}
