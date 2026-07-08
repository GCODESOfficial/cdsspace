/**
 * Admin-editable office geofence for team attendance check-in.
 *
 * Reads/writes the single-row `team_timebook_office` table (see migration
 * 20260704_timebook_office_geofence.sql). Falls back to the hardcoded
 * TIMEBOOK_OFFICE default when the table is missing/empty, so clock-in keeps
 * working before the migration is applied.
 */
import "server-only";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { TIMEBOOK_OFFICE } from "@/lib/timebook";

export interface TimebookOffice {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export async function getTimebookOffice(): Promise<TimebookOffice> {
  try {
    const row = await glashMaybeOne<{
      name: string | null;
      address: string | null;
      latitude: number;
      longitude: number;
      radius_meters: number;
    }>(`select name, address, latitude, longitude, radius_meters from public.team_timebook_office where id = 1`);
    if (row && Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude))) {
      return {
        name: row.name || TIMEBOOK_OFFICE.name,
        address: row.address || TIMEBOOK_OFFICE.address,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        radiusMeters: Number(row.radius_meters) > 0 ? Number(row.radius_meters) : TIMEBOOK_OFFICE.radiusMeters,
      };
    }
  } catch {
    // Table not migrated yet — use the default.
  }
  return { ...TIMEBOOK_OFFICE };
}

export async function saveTimebookOffice(
  input: Partial<TimebookOffice>,
  updatedBy?: string | null,
): Promise<TimebookOffice> {
  const cur = await getTimebookOffice();
  const next: TimebookOffice = {
    name: (input.name ?? "").toString().trim() || cur.name,
    address: (input.address ?? "").toString().trim() || cur.address,
    latitude: Number.isFinite(Number(input.latitude)) ? Number(input.latitude) : cur.latitude,
    longitude: Number.isFinite(Number(input.longitude)) ? Number(input.longitude) : cur.longitude,
    radiusMeters: Number(input.radiusMeters) > 0 ? Math.round(Number(input.radiusMeters)) : cur.radiusMeters,
  };
  await glashQuery(
    `insert into public.team_timebook_office (id, name, address, latitude, longitude, radius_meters, updated_by, updated_at)
     values (1, $1, $2, $3, $4, $5, $6, now())
     on conflict (id) do update
        set name = excluded.name, address = excluded.address, latitude = excluded.latitude,
            longitude = excluded.longitude, radius_meters = excluded.radius_meters,
            updated_by = excluded.updated_by, updated_at = now()`,
    [next.name, next.address, next.latitude, next.longitude, next.radiusMeters, updatedBy ?? null],
  );
  return next;
}
