import { getSupabaseAdmin } from "@/lib/supabase";
import { graphGet } from "./graph";
import { ingestMetaMessage } from "./inbox";
import type { MetaIntegration, MetaPlatform } from "./config";

const STEP_BUDGET_MS = 45_000;          // stop this invocation before Vercel serverless timeout
const CONVERSATIONS_PAGE_SIZE = 25;
const MESSAGES_PAGE_SIZE = 50;

interface ConversationNode {
  id: string;
  updated_time: string;
  participants?: { data: { id: string; name?: string; username?: string }[] };
}

interface MessageNode {
  id: string;
  created_time: string;
  message?: string;
  from?: { id: string; name?: string; username?: string };
  to?: { data: { id: string; name?: string; username?: string }[] };
  attachments?: { data: { type?: string; payload?: { url?: string } }[] };
}

/**
 * Run a single step of the backfill job. Paginates through conversations using the stored cursor,
 * pulls each conversation's messages, and ingests any that fall within [since, until].
 *
 * Returns `{ done }` so the admin UI can keep calling until it finishes.
 */
export async function runBackfillStep(integ: MetaIntegration) {
  if (!integ.page_access_token) throw new Error("Missing page access token");
  if (integ.platform === "instagram" && !integ.ig_business_id) {
    throw new Error("Missing Instagram business ID — link your IG account to the Page first");
  }

  const container =
    integ.platform === "instagram"
      ? integ.ig_business_id!
      : integ.page_id;
  if (!container) throw new Error("Missing page_id");

  const sinceIso = integ.backfill_since ?? new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
  const sinceMs = new Date(sinceIso).getTime();
  const untilMs = integ.backfill_until ? new Date(integ.backfill_until).getTime() : Date.now();

  const supabase = getSupabaseAdmin();
  const deadline = Date.now() + STEP_BUDGET_MS;

  let cursor = integ.backfill_cursor ?? undefined;
  let conversationsSeen = integ.backfill_conversations_seen;
  let messagesIngested = integ.backfill_messages_ingested;

  const platformParam = integ.platform === "instagram" ? "instagram" : "messenger";

  while (Date.now() < deadline) {
    const params: Record<string, string | number | undefined> = {
      platform: platformParam,
      fields: "id,updated_time,participants",
      limit: CONVERSATIONS_PAGE_SIZE,
    };
    if (cursor) params.after = cursor;

    const page = await graphGet<{
      data: ConversationNode[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>(`/${container}/conversations`, integ.page_access_token, params);

    const conversations = page.data || [];
    if (!conversations.length) {
      cursor = undefined;
      break;
    }

    for (const conv of conversations) {
      conversationsSeen += 1;
      const convUpdatedMs = new Date(conv.updated_time).getTime();

      // Conversations are ordered by updated_time DESC — once we pass the cutoff we can stop.
      if (convUpdatedMs < sinceMs) {
        cursor = undefined;
        await persist({
          cursor: null,
          conversationsSeen,
          messagesIngested,
          status: "done",
          finished: true,
        });
        return { done: true, conversationsSeen, messagesIngested };
      }

      const otherParticipant = conv.participants?.data?.find((p) => p.id !== container);
      if (!otherParticipant) continue;

      // Pull messages in this conversation, paging until we drop below sinceMs.
      await ingestConversationMessages({
        conversationId: conv.id,
        platform: integ.platform,
        externalUserId: otherParticipant.id,
        displayName: otherParticipant.name ?? null,
        username: otherParticipant.username ?? null,
        accessToken: integ.page_access_token,
        sinceMs,
        untilMs,
        onIngested: () => {
          messagesIngested += 1;
        },
      });

      if (Date.now() > deadline) break;
    }

    cursor = page.paging?.cursors?.after ?? undefined;
    if (!cursor) break;
  }

  const isDone = !cursor;
  await persist({
    cursor: cursor ?? null,
    conversationsSeen,
    messagesIngested,
    status: isDone ? "done" : "running",
    finished: isDone,
  });

  return { done: isDone, conversationsSeen, messagesIngested };

  async function persist(p: {
    cursor: string | null;
    conversationsSeen: number;
    messagesIngested: number;
    status: "running" | "done";
    finished: boolean;
  }) {
    const patch: Record<string, unknown> = {
      backfill_cursor: p.cursor,
      backfill_conversations_seen: p.conversationsSeen,
      backfill_messages_ingested: p.messagesIngested,
      backfill_status: p.status,
      updated_at: new Date().toISOString(),
    };
    if (p.finished) patch.backfill_finished_at = new Date().toISOString();
    await supabase.from("meta_integrations").update(patch).eq("id", integ.id);
  }
}

async function ingestConversationMessages(opts: {
  conversationId: string;
  platform: MetaPlatform;
  externalUserId: string;
  displayName: string | null;
  username: string | null;
  accessToken: string;
  sinceMs: number;
  untilMs: number;
  onIngested: () => void;
}) {
  let after: string | undefined;
  while (true) {
    const params: Record<string, string | number | undefined> = {
      fields: "id,created_time,message,from,to,attachments",
      limit: MESSAGES_PAGE_SIZE,
    };
    if (after) params.after = after;

    const page = await graphGet<{
      data: MessageNode[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>(`/${opts.conversationId}/messages`, opts.accessToken, params);

    const msgs = page.data || [];
    if (!msgs.length) return;

    for (const m of msgs) {
      const ms = new Date(m.created_time).getTime();
      if (ms < opts.sinceMs) return;
      if (ms > opts.untilMs) continue;

      const fromPage = m.from?.id && m.from.id !== opts.externalUserId ? true : false;
      const body = m.message ?? "";
      const media = m.attachments?.data?.[0]?.payload?.url ?? null;

      await ingestMetaMessage({
        platform: opts.platform,
        externalUserId: opts.externalUserId,
        displayName: opts.displayName,
        username: opts.username,
        body,
        externalId: m.id,
        externalThreadId: opts.conversationId,
        createdAtIso: new Date(m.created_time).toISOString(),
        fromPage,
        mediaUrl: media,
      });
      opts.onIngested();
    }

    after = page.paging?.cursors?.after;
    if (!after) return;
  }
}
