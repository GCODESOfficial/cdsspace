import "server-only";

import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { getProvider, isPlatformImplemented } from "@/lib/social/providers";
import {
  SOCIAL_LABELS,
  SOCIAL_PLATFORMS,
  type SocialConnection,
  type SocialPlatform,
  type StoredConnectionInput,
} from "@/lib/social/types";

interface ConnectionRow {
  platform: SocialPlatform;
  status: "connected" | "expired" | "revoked";
  account_name: string | null;
  account_urn: string | null;
  scope: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  metadata: Record<string, unknown> | null;
}

function toConnection(row: ConnectionRow): SocialConnection {
  return {
    platform: row.platform,
    status: row.status,
    accountName: row.account_name,
    accountUrn: row.account_urn,
    scope: row.scope,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    tokenExpiresAt: row.token_expires_at,
    metadata: row.metadata || {},
  };
}

/** Full connection incl. token - server-only, never send to the browser. */
export async function getConnection(platform: SocialPlatform): Promise<SocialConnection | null> {
  const row = await glashMaybeOne<ConnectionRow>(
    `select platform, status, account_name, account_urn, scope, access_token,
            refresh_token, token_expires_at, metadata
       from public.social_connections where platform = $1 limit 1`,
    [platform],
  );
  return row ? toConnection(row) : null;
}

export function isConnectionUsable(connection: SocialConnection): boolean {
  if (connection.status !== "connected") return false;
  if (connection.tokenExpiresAt && new Date(connection.tokenExpiresAt).getTime() <= Date.now()) return false;
  return true;
}

export async function saveConnection(platform: SocialPlatform, input: StoredConnectionInput, connectedBy: string) {
  await glashQuery(
    `insert into public.social_connections
       (platform, status, account_name, account_urn, scope, access_token, refresh_token, token_expires_at, metadata, connected_by, connected_at, updated_at)
     values ($1,'connected',$2,$3,$4,$5,$6,$7,$8,$9, now(), now())
     on conflict (platform) do update set
       status='connected', account_name=excluded.account_name, account_urn=excluded.account_urn,
       scope=excluded.scope, access_token=excluded.access_token, refresh_token=excluded.refresh_token,
       token_expires_at=excluded.token_expires_at, metadata=excluded.metadata,
       connected_by=excluded.connected_by, connected_at=now(), updated_at=now()`,
    [
      platform,
      input.accountName,
      input.accountUrn,
      input.scope,
      input.accessToken,
      input.refreshToken,
      input.tokenExpiresAt,
      JSON.stringify(input.metadata || {}),
      connectedBy,
    ],
  );
}

export async function deleteConnection(platform: SocialPlatform) {
  await glashQuery(`delete from public.social_connections where platform = $1`, [platform]);
}

export async function markConnectionStatus(platform: SocialPlatform, status: "expired" | "revoked") {
  await glashQuery(`update public.social_connections set status=$2, updated_at=now() where platform=$1`, [platform, status]);
}

export interface ConnectionSummary {
  platform: SocialPlatform;
  label: string;
  configured: boolean;   // env credentials present
  implemented: boolean;  // posting flow actually built
  connected: boolean;
  status: string | null;
  accountName: string | null;
  tokenExpiresAt: string | null;
}

/** Browser-safe channel list for the settings UI (no tokens). */
export async function listConnectionSummaries(): Promise<ConnectionSummary[]> {
  const rows = await glashQuery<{
    platform: SocialPlatform; status: string; account_name: string | null; token_expires_at: string | null;
  }>(`select platform, status, account_name, token_expires_at from public.social_connections`);
  const byPlatform = new Map(rows.map((row) => [row.platform, row]));
  return SOCIAL_PLATFORMS.map((platform) => {
    const row = byPlatform.get(platform);
    return {
      platform,
      label: SOCIAL_LABELS[platform],
      configured: getProvider(platform).isConfigured(),
      implemented: isPlatformImplemented(platform),
      connected: Boolean(row) && row!.status === "connected",
      status: row?.status || null,
      accountName: row?.account_name || null,
      tokenExpiresAt: row?.token_expires_at || null,
    };
  });
}
