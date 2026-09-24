import "server-only";

import { createHash, randomBytes } from "crypto";
import { glashMaybeOne, glashPool, glashQuery } from "@/lib/glashdb/postgres";
import { publishClientDelivery } from "@/lib/client-deliveries-server";

export interface PlatformProfileOption {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  phone_number: string | null;
  billing_currency: string | null;
}

export interface UnifiedClientRecord {
  id: string;
  manual_client_id: string | null;
  platform_user_id: string | null;
  has_platform_account: boolean;
  source: "manual" | "platform";
  name: string;
  brand_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  industry: string | null;
  industries: string[];
  contact_person: string | null;
  address: string | null;
  notes: string | null;
  status: string;
  birthday: string | null;
  birthday_reminder_enabled: boolean;
  birthday_reminder_days: number;
  preferred_contact_method: "email" | "whatsapp" | "phone" | null;
  last_birthday_wish_at: string | null;
  birthday_wished_for_year: number | null;
  created_at: string;
  account_linked_at: string | null;
  duplicate_profiles: PlatformProfileOption[];
}

interface ManualClientRow {
  id: string;
  name: string;
  brand_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  industry: string | null;
  industries: string[];
  contact_person: string | null;
  address: string | null;
  notes: string | null;
  status: string | null;
  birthday: string | null;
  birthday_reminder_enabled: boolean;
  birthday_reminder_days: number;
  preferred_contact_method: "email" | "whatsapp" | "phone" | null;
  last_birthday_wish_at: string | null;
  birthday_wished_for_year: number | null;
  created_at: string;
  platform_user_id: string | null;
  account_linked_at: string | null;
}

function normalizedEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function normalizedPhone(value: unknown) {
  return String(value || "").replace(/\D/g, "").slice(-12);
}

function normalizedWords(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function profileMatchesClient(client: ManualClientRow, profile: PlatformProfileOption) {
  const email = normalizedEmail(client.email);
  const phone = normalizedPhone(client.phone || client.whatsapp);
  const names = new Set([
    normalizedWords(client.name),
    normalizedWords(client.brand_name),
    normalizedWords(client.contact_person),
  ].filter(Boolean));
  return Boolean(
    (email && email === normalizedEmail(profile.email))
    || (phone.length >= 7 && phone === normalizedPhone(profile.phone_number))
    || (names.size && (
      names.has(normalizedWords(profile.full_name))
      || names.has(normalizedWords(profile.company_name))
    ))
  );
}

export async function getUnifiedClientDirectory() {
  const [manualClients, platformProfiles] = await Promise.all([
    glashQuery<ManualClientRow>(
      `select id, name, brand_name, email, phone, whatsapp, industry, industries,
              contact_person, address, notes, status, birthday,
              birthday_reminder_enabled, birthday_reminder_days,
              preferred_contact_method, last_birthday_wish_at,
              birthday_wished_for_year, created_at,
              platform_user_id, account_linked_at
         from public.clients
        order by created_at desc`,
    ),
    glashQuery<PlatformProfileOption>(
      `select id, email, full_name, company_name, phone_number, billing_currency
         from public.profiles
        where email_verified_at is not null
          and account_status = 'active'
          and coalesce(lower(trim(email)), '') <> 'ceo@cdsspace.pro'
        order by coalesce(nullif(company_name, ''), nullif(full_name, ''), email) asc`,
    ),
  ]);

  const linkedProfiles = new Set(manualClients.map((client) => client.platform_user_id).filter(Boolean));
  const profileById = new Map(platformProfiles.map((profile) => [profile.id, profile]));
  const clients: UnifiedClientRecord[] = manualClients.map((client) => {
    const linked = client.platform_user_id ? profileById.get(client.platform_user_id) : null;
    const duplicateProfiles = client.platform_user_id
      ? []
      : platformProfiles.filter((profile) => profileMatchesClient(client, profile));
    return {
      ...client,
      id: client.id,
      manual_client_id: client.id,
      platform_user_id: client.platform_user_id,
      has_platform_account: Boolean(linked),
      source: "manual",
      name: client.name || linked?.full_name || linked?.company_name || linked?.email || "Unnamed client",
      brand_name: client.brand_name || linked?.company_name || null,
      email: client.email || linked?.email || null,
      phone: client.phone || linked?.phone_number || null,
      status: client.status || "active",
      birthday_reminder_enabled: client.birthday_reminder_enabled !== false,
      birthday_reminder_days: Number(client.birthday_reminder_days || 30),
      duplicate_profiles: duplicateProfiles,
    };
  });

  for (const profile of platformProfiles) {
    if (linkedProfiles.has(profile.id)) continue;
    clients.push({
      id: `profile:${profile.id}`,
      manual_client_id: null,
      platform_user_id: profile.id,
      has_platform_account: true,
      source: "platform",
      name: profile.full_name || profile.company_name || profile.email,
      brand_name: profile.company_name || null,
      email: profile.email || null,
      phone: profile.phone_number || null,
      whatsapp: null,
      industry: null,
      industries: [],
      contact_person: profile.full_name || null,
      address: null,
      notes: null,
      status: "active",
      birthday: null,
      birthday_reminder_enabled: true,
      birthday_reminder_days: 30,
      preferred_contact_method: profile.email ? "email" : null,
      last_birthday_wish_at: null,
      birthday_wished_for_year: null,
      created_at: new Date(0).toISOString(),
      account_linked_at: null,
      duplicate_profiles: [],
    });
  }

  return { clients, platformProfiles };
}

export async function findClientDuplicates(input: {
  name?: unknown;
  brand_name?: unknown;
  email?: unknown;
  phone?: unknown;
  whatsapp?: unknown;
  excludeManualId?: string | null;
  intendedPlatformUserId?: string | null;
}) {
  const email = normalizedEmail(input.email);
  const phone = normalizedPhone(input.phone || input.whatsapp);
  const name = normalizedWords(input.name);
  const brand = normalizedWords(input.brand_name);
  const manual = await glashQuery<{
    id: string; name: string; brand_name: string | null; email: string | null; phone: string | null;
  }>(
    `select id, name, brand_name, email, phone
       from public.clients
      where ($1::uuid is null or id <> $1::uuid)
        and (
          ($2 <> '' and lower(trim(coalesce(email, ''))) = $2)
          or ($3 <> '' and right(regexp_replace(coalesce(phone, whatsapp, ''), '[^0-9]', '', 'g'), 12) = $3)
          or ($4 <> '' and lower(trim(name)) = $4)
          or ($5 <> '' and lower(trim(coalesce(brand_name, ''))) = $5)
        )
      limit 12`,
    [input.excludeManualId || null, email, phone, name, brand],
  );
  const profiles = await glashQuery<PlatformProfileOption>(
    `select id, email, full_name, company_name, phone_number, billing_currency
      from public.profiles
      where ($1::uuid is null or id <> $1::uuid)
        and email_verified_at is not null
        and account_status = 'active'
        and coalesce(lower(trim(email)), '') <> 'ceo@cdsspace.pro'
        and (
          ($2 <> '' and lower(trim(email)) = $2)
          or ($3 <> '' and right(regexp_replace(coalesce(phone_number, ''), '[^0-9]', '', 'g'), 12) = $3)
          or ($4 <> '' and lower(trim(coalesce(full_name, ''))) = $4)
          or ($5 <> '' and lower(trim(coalesce(company_name, ''))) = $5)
        )
      limit 12`,
    [input.intendedPlatformUserId || null, email, phone, name, brand],
  );
  return { manual, profiles };
}

function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createClientAccountInvite(clientId: string, invitedBy: string) {
  const client = await glashMaybeOne<{
    id: string; name: string; brand_name: string | null; email: string | null; platform_user_id: string | null;
  }>(
    "select id, name, brand_name, email, platform_user_id from public.clients where id = $1 limit 1",
    [clientId],
  );
  if (!client) throw new Error("Client was not found.");
  if (client.platform_user_id) throw new Error("This client already has a linked platform account.");
  const email = normalizedEmail(client.email);
  if (!email) throw new Error("Add the client's email address before sending an invite.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) {
    throw new Error("Add a valid client email address before sending an invite.");
  }
  const existingProfile = await glashMaybeOne<{ id: string }>(
    "select id from public.profiles where lower(trim(email)) = $1 limit 1",
    [email],
  );
  if (existingProfile) {
    throw new Error("A CDS Space account already exists for this email. Use Merge instead of sending another sign-up invite.");
  }

  await glashQuery(
    `update public.client_account_invites
        set revoked_at = now()
      where client_id = $1 and accepted_at is null and revoked_at is null`,
    [clientId],
  );
  const rawToken = randomBytes(32).toString("base64url");
  const [invite] = await glashQuery<{ id: string; expires_at: string }>(
    `insert into public.client_account_invites
      (client_id, email, token_hash, invited_by, expires_at)
     values ($1,$2,$3,$4,now() + interval '14 days')
     returning id, expires_at`,
    [clientId, email, hashInviteToken(rawToken), invitedBy],
  );
  return { client, invite, rawToken };
}

export async function validateClientAccountInvite(rawToken: string, email: string) {
  if (!rawToken || rawToken.length < 20) return null;
  return glashMaybeOne<{ id: string; client_id: string; email: string }>(
    `select id, client_id, email
       from public.client_account_invites
      where token_hash = $1
        and lower(email) = lower($2)
        and accepted_at is null
        and revoked_at is null
        and expires_at > now()
      limit 1`,
    [hashInviteToken(rawToken), normalizedEmail(email)],
  );
}

export async function mergeClientIntoProfile(input: {
  manualClientId: string;
  platformUserId: string;
  actor: string;
  inviteId?: string | null;
}) {
  const connection = await glashPool.connect();
  let waitingIds: string[] = [];
  try {
    await connection.query("begin");
    const clientResult = await connection.query<ManualClientRow>(
      "select * from public.clients where id = $1 for update",
      [input.manualClientId],
    );
    const manual = clientResult.rows[0];
    if (!manual) throw new Error("Manual client was not found.");
    if (manual.platform_user_id && manual.platform_user_id !== input.platformUserId) {
      throw new Error("This client is already linked to another platform account.");
    }
    const profileResult = await connection.query<PlatformProfileOption>(
      "select id, email, full_name, company_name, phone_number, billing_currency from public.profiles where id = $1 for update",
      [input.platformUserId],
    );
    const profile = profileResult.rows[0];
    if (!profile) throw new Error("Platform client account was not found.");
    const occupied = await connection.query<{ id: string }>(
      "select id from public.clients where platform_user_id = $1 and id <> $2 limit 1",
      [input.platformUserId, input.manualClientId],
    );
    if (occupied.rows[0]) throw new Error("That platform account is already linked to another CRM client.");

    await connection.query(
      `update public.profiles
          set full_name = coalesce(nullif(full_name, ''), nullif($2, ''), nullif($3, '')),
              company_name = coalesce(nullif(company_name, ''), nullif($4, '')),
              phone_number = coalesce(nullif(phone_number, ''), nullif($5, ''), nullif($6, '')),
              updated_at = now()
        where id = $1`,
      [profile.id, manual.contact_person, manual.name, manual.brand_name, manual.phone, manual.whatsapp],
    );
    await connection.query(
      `update public.clients
          set platform_user_id = $2, account_linked_at = now(), account_linked_by = $3,
              merged_at = now(), updated_at = now()
        where id = $1`,
      [manual.id, profile.id, input.actor],
    );
    await connection.query(
      `update public.finance_projects
          set user_id = $2, updated_at = now()
        where manual_client_id = $1`,
      [manual.id, profile.id],
    );
    const deliveries = await connection.query<{ id: string }>(
      `update public.client_deliveries
          set client_user_id = $2, updated_at = now()
        where manual_client_id = $1
        returning id`,
      [manual.id, profile.id],
    );
    waitingIds = deliveries.rows.map((delivery) => delivery.id);
    if (input.inviteId) {
      await connection.query(
        `update public.client_account_invites
            set accepted_at = now(), accepted_user_id = $2
          where id = $1 and accepted_at is null`,
        [input.inviteId, profile.id],
      );
      await connection.query(
        `update public.client_account_invites
            set revoked_at = now()
          where client_id = $1 and id <> $2
            and accepted_at is null and revoked_at is null`,
        [manual.id, input.inviteId],
      );
    } else {
      await connection.query(
        `update public.client_account_invites
            set revoked_at = now()
          where client_id = $1 and accepted_at is null and revoked_at is null`,
        [manual.id],
      );
    }
    await connection.query("commit");
  } catch (error) {
    await connection.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }

  for (const deliveryId of waitingIds) {
    const waiting = await glashMaybeOne<{ status: string }>(
      "select status from public.client_deliveries where id = $1",
      [deliveryId],
    );
    if (waiting?.status !== "awaiting_account") continue;
    await glashQuery(
      `update public.client_deliveries
          set status = 'submitted', submitted_by_admin = null,
              submitted_at = coalesce(submitted_at, now()), updated_at = now()
        where id = $1`,
      [deliveryId],
    );
    await publishClientDelivery({
      id: deliveryId,
      clientUserId: input.platformUserId,
      approverEmail: input.actor || "system@cdsspace.pro",
    });
  }
  return { manualClientId: input.manualClientId, platformUserId: input.platformUserId };
}

export async function acceptClientAccountInvite(input: {
  inviteId?: unknown;
  platformUserId: string;
  email: string;
}) {
  const inviteId = String(input.inviteId || "").trim();
  if (!inviteId) return false;
  const invite = await glashMaybeOne<{ id: string; client_id: string; email: string }>(
    `select id, client_id, email
       from public.client_account_invites
      where id = $1 and accepted_at is null and revoked_at is null
        and expires_at > now() and lower(email) = lower($2)
      limit 1`,
    [inviteId, normalizedEmail(input.email)],
  );
  if (!invite) return false;
  await mergeClientIntoProfile({
    manualClientId: invite.client_id,
    platformUserId: input.platformUserId,
    actor: input.email,
    inviteId: invite.id,
  });
  return true;
}
