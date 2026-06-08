import { NextResponse } from "next/server";
import { getChatViewer } from "@/lib/team-chat-auth";
import {
  canViewTeamThread,
  getViewerReactionKey,
  hydrateTeamMessages,
  TEAM_CHAT_MESSAGE_COLUMNS,
  type TeamChatMessageRecord,
} from "@/lib/team-chat-server";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { buildMessages } from "@/lib/ai/prompts";
import { chatComplete } from "@/lib/ai/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function toggleKey(value: unknown, key: string, force?: boolean) {
  const next = new Set(asStringArray(value));
  const shouldHave = typeof force === "boolean" ? force : !next.has(key);
  if (shouldHave) next.add(key);
  else next.delete(key);
  return Array.from(next);
}

async function loadMessage(id: string) {
  return glashMaybeOne<TeamChatMessageRecord>(
    `select ${TEAM_CHAT_MESSAGE_COLUMNS}
     from public.team_chat_messages
     where id = $1
     limit 1`,
    [id],
  );
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getChatViewer();
  if (!viewer) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const message = await loadMessage(id);
  if (!message) return NextResponse.json({ ok: false, error: "Message not found" }, { status: 404 });
  if (!(await canViewTeamThread(viewer, message.thread_id))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (message.deleted_at) {
    return NextResponse.json({ ok: false, error: "Deleted messages cannot be modified" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");
  const viewerKey = getViewerReactionKey(viewer);
  const actorKind = viewer.kind;
  const now = new Date().toISOString();

  try {
    if (action === "pin" || action === "unpin") {
      const shouldPin = action === "pin" ? body?.value !== false : false;
      if (shouldPin) {
        await glashQuery(
          `update public.team_chat_messages
           set pinned_at = now(), pinned_by = $2
           where id = $1`,
          [id, viewerKey],
        );
        await glashQuery(
          `insert into public.team_chat_pins (thread_id, message_id, pinned_by)
           values ($1, $2, $3)
           on conflict (thread_id, message_id)
           do update set pinned_by = excluded.pinned_by, pinned_at = now()`,
          [message.thread_id, id, viewerKey],
        );
        await glashQuery(`update public.team_chat_threads set pinned_message_id = $1, updated_at = now() where id = $2`, [
          id,
          message.thread_id,
        ]);
      } else {
        await glashQuery(
          `update public.team_chat_messages
           set pinned_at = null, pinned_by = null
           where id = $1`,
          [id],
        );
        await glashQuery(`delete from public.team_chat_pins where thread_id = $1 and message_id = $2`, [message.thread_id, id]);
        await glashQuery(
          `update public.team_chat_threads
           set pinned_message_id = null, updated_at = now()
           where id = $1 and pinned_message_id = $2`,
          [message.thread_id, id],
        );
      }
    } else if (action === "star" || action === "unstar") {
      const starred = toggleKey(message.starred_by, viewerKey, action === "star" ? body?.value !== false : false);
      await glashQuery(`update public.team_chat_messages set starred_by = $2::jsonb where id = $1`, [
        id,
        JSON.stringify(starred),
      ]);
    } else if (action === "bookmark" || action === "unbookmark") {
      const bookmarked = toggleKey(message.bookmarked_by, viewerKey, action === "bookmark" ? body?.value !== false : false);
      await glashQuery(`update public.team_chat_messages set bookmarked_by = $2::jsonb where id = $1`, [
        id,
        JSON.stringify(bookmarked),
      ]);
      if (bookmarked.includes(viewerKey)) {
        await glashQuery(
          `insert into public.team_chat_message_bookmarks (message_id, thread_id, viewer_key, note)
           values ($1, $2, $3, $4)
           on conflict (message_id, viewer_key)
           do update set note = excluded.note`,
          [id, message.thread_id, viewerKey, typeof body?.note === "string" ? body.note : null],
        );
      } else {
        await glashQuery(`delete from public.team_chat_message_bookmarks where message_id = $1 and viewer_key = $2`, [
          id,
          viewerKey,
        ]);
      }
    } else if (action === "schedule") {
      const scheduledFor = body?.scheduledFor ? new Date(body.scheduledFor) : null;
      if (!scheduledFor || Number.isNaN(scheduledFor.getTime())) {
        return NextResponse.json({ ok: false, error: "scheduledFor must be a valid date" }, { status: 400 });
      }
      await glashQuery(
        `update public.team_chat_messages
         set scheduled_for = $2::timestamptz,
             delivery_status = case when $2::timestamptz > now() then 'scheduled' else 'sent' end,
             sent_at = case when $2::timestamptz > now() then null else now() end
         where id = $1`,
        [id, scheduledFor.toISOString()],
      );
    } else if (action === "translate") {
      const language = String(body?.language || "English").trim().slice(0, 60);
      if (!message.body?.trim()) {
        return NextResponse.json({ ok: false, error: "Only text messages can be translated" }, { status: 400 });
      }
      const result = await chatComplete(buildMessages("chat_translate", { language, text: message.body }), {
        temperature: 0.2,
        max_tokens: 500,
      });
      const translated = {
        ...(message.translated || {}),
        [language]: result.text.trim(),
      };
      await glashQuery(`update public.team_chat_messages set translated = $2::jsonb where id = $1`, [
        id,
        JSON.stringify(translated),
      ]);
    } else {
      return NextResponse.json({ ok: false, error: "Unsupported action" }, { status: 400 });
    }

    await glashQuery(
      `insert into public.team_chat_audit_logs
        (actor_key, actor_kind, action, resource_type, resource_id, thread_id, metadata)
       values ($1, $2, $3, 'team_chat_message', $4, $5, $6::jsonb)`,
      [viewerKey, actorKind, `message.${action}`, id, message.thread_id, JSON.stringify({ at: now })],
    );

    const updated = await loadMessage(id);
    const [hydrated] = updated ? await hydrateTeamMessages([updated]) : [null];
    return NextResponse.json({ ok: true, message: hydrated });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Message action failed" },
      { status: 500 },
    );
  }
}
