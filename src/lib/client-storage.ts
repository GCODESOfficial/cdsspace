import "server-only";

import { getGlashPoolClient, glashQuery } from "@/lib/glashdb/postgres";

export const CLIENT_STORAGE_DEFAULT_LIMIT_BYTES = 2 * 1024 * 1024 * 1024;
export const CLIENT_STORAGE_FULL_CODE = "CLIENT_STORAGE_FULL";
export const CLIENT_STORAGE_FULL_MESSAGE = "Your storage space is full. Request more space from CDS Space to continue.";

export class ClientStorageFullError extends Error {
  readonly code = CLIENT_STORAGE_FULL_CODE;

  constructor() {
    super(CLIENT_STORAGE_FULL_MESSAGE);
    this.name = "ClientStorageFullError";
  }
}

export function isClientStorageFullError(error: unknown): error is ClientStorageFullError {
  return error instanceof ClientStorageFullError
    || (error instanceof Error && (error as Error & { code?: string }).code === CLIENT_STORAGE_FULL_CODE);
}

type StorageTotals = { used_bytes: string; limit_bytes: string; reserved_bytes: string };

const CLIENT_USAGE_SQL = `
  with creation_usage as (
    select coalesce(sum(coalesce(file_size_bytes, 0)), 0)::bigint as bytes
      from public.create_creations
     where owner_kind = 'client' and owner_id = $1 and deleted_at is null
  ), drive_usage as (
    select coalesce(sum(file_size), 0)::bigint as bytes
      from public.client_drive_files
     where uploaded_by_kind = 'client' and uploaded_by_id = $1
  ), letterhead_assets as (
    select first_page_path as path, max(first_page_size_bytes)::bigint as bytes
      from public.create_letterheads
     where owner_kind = 'client' and owner_id = $1 and deleted_at is null and first_page_path is not null
     group by first_page_path
    union
    select second_page_path as path, max(second_page_size_bytes)::bigint as bytes
      from public.create_letterheads
     where owner_kind = 'client' and owner_id = $1 and deleted_at is null and second_page_path is not null
     group by second_page_path
    union
    select signature_path as path, max(signature_size_bytes)::bigint as bytes
      from public.create_letterheads
     where owner_kind = 'client' and owner_id = $1 and deleted_at is null and signature_path is not null
     group by signature_path
  ), letterhead_usage as (
    select coalesce(sum(bytes), 0)::bigint as bytes from letterhead_assets
  )
  select ((select bytes from creation_usage) + (select bytes from drive_usage) + (select bytes from letterhead_usage))::text as used_bytes,
         account.storage_limit_bytes::text as limit_bytes,
         coalesce((select sum(bytes) from public.client_storage_reservations
                    where client_user_id = $1::uuid and expires_at > now()), 0)::text as reserved_bytes
    from public.create_credit_accounts account
   where account.owner_kind = 'client' and account.owner_id = $1
`;

/**
 * Reserve quota before a storage/database write. The short-lived reservation
 * closes the concurrent-upload race and is released once the durable row is in
 * place. Expired reservations are ignored and cleaned on the next request.
 */
export async function reserveClientStorage(clientUserId: string, incomingBytes: number, replacingBytes = 0) {
  const bytes = Math.max(0, Math.ceil(incomingBytes) - Math.max(0, Math.ceil(replacingBytes)));
  if (!bytes) return null;

  const client = await getGlashPoolClient();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`client-storage:${clientUserId}`]);
    await client.query(
      `insert into public.create_credit_accounts (owner_kind, owner_id, monthly_credit_limit, storage_limit_bytes)
       values ('client', $1, 50, $2)
       on conflict (owner_kind, owner_id) do nothing`,
      [clientUserId, CLIENT_STORAGE_DEFAULT_LIMIT_BYTES],
    );
    await client.query(
      `delete from public.client_storage_reservations
        where client_user_id = $1::uuid and expires_at <= now()`,
      [clientUserId],
    );
    const totals = (await client.query<StorageTotals>(CLIENT_USAGE_SQL, [clientUserId])).rows[0];
    const used = Number(totals?.used_bytes || 0);
    const reserved = Number(totals?.reserved_bytes || 0);
    const limit = Number(totals?.limit_bytes || CLIENT_STORAGE_DEFAULT_LIMIT_BYTES);
    if (used + reserved + bytes > limit) {
      await client.query("rollback");
      throw new ClientStorageFullError();
    }
    const reservation = await client.query<{ id: string }>(
      `insert into public.client_storage_reservations (client_user_id, bytes)
       values ($1::uuid, $2) returning id`,
      [clientUserId, bytes],
    );
    await client.query("commit");
    return reservation.rows[0]?.id || null;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function releaseClientStorageReservation(reservationId: string | null | undefined) {
  if (!reservationId) return;
  await glashQuery(`delete from public.client_storage_reservations where id = $1::uuid`, [reservationId]);
}
