import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";

/**
 * Single-use codes between the mobile app and a browser (see the
 * client_mobile_handoffs migration). A code proves one thing once, for one
 * client, for a few minutes; only its hash is stored.
 */

export type HandoffPurpose = "app_signin" | "web_session";

const TTL_SECONDS: Record<HandoffPurpose, number> = {
  app_signin: 5 * 60, // the app has to come back from the browser and exchange it
  web_session: 2 * 60, // opened immediately after it is issued
};

const hashCode = (code: string) => createHash("sha256").update(`cds-mobile-handoff:${code}`).digest("hex");

export async function createHandoffCode(input: {
  purpose: HandoffPurpose;
  userId: string;
  email?: string | null;
  targetPath?: string | null;
}) {
  const code = randomBytes(32).toString("base64url");
  await glashQuery(
    `insert into public.client_mobile_handoffs (purpose, code_hash, user_id, email, target_path, expires_at)
     values ($1, $2, $3::uuid, $4, $5, now() + make_interval(secs => $6::int))`,
    [input.purpose, hashCode(code), input.userId, String(input.email || "").slice(0, 320), input.targetPath || null, TTL_SECONDS[input.purpose]],
  );
  // Old rows are useless once expired; keep the table small.
  glashQuery("delete from public.client_mobile_handoffs where expires_at < now() - interval '1 day'").catch(() => undefined);
  return code;
}

/** Spend a code atomically. Returns its owner and target, or null if invalid, expired or used. */
export async function consumeHandoffCode(purpose: HandoffPurpose, code: unknown) {
  if (typeof code !== "string" || code.length < 20 || code.length > 200) return null;
  return glashMaybeOne<{ user_id: string; email: string; target_path: string | null }>(
    `update public.client_mobile_handoffs
        set used_at = now()
      where code_hash = $1 and purpose = $2 and used_at is null and expires_at > now()
      returning user_id, email, target_path`,
    [hashCode(code), purpose],
  );
}
