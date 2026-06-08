import { NextResponse } from "next/server";
import { verifyAdmin, verifyUser } from "@/lib/admin-auth";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { buildMessages } from "@/lib/ai/prompts";
import { chatComplete } from "@/lib/ai/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMessage = {
  id: string;
  room_id: string;
  sender_id: string | null;
  sender_role: "admin" | "client";
  message: string;
  file_url: string | null;
  deleted_at: string | null;
  pinned_at: string | null;
  starred_by: string[];
  bookmarked_by: string[];
  translated: Record<string, string>;
};

function keyFor(admin: Awaited<ReturnType<typeof verifyAdmin>>, user: Awaited<ReturnType<typeof verifyUser>>) {
  if (admin) return `admin:${admin.email || admin.id}`;
  return `client:${user?.user.id}`;
}

function asArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function toggle(value: unknown, key: string, force?: boolean) {
  const set = new Set(asArray(value));
  const next = typeof force === "boolean" ? force : !set.has(key);
  if (next) set.add(key);
  else set.delete(key);
  return Array.from(set);
}

async function loadMessage(id: string) {
  return glashMaybeOne<ChatMessage>(
    `select id, room_id, sender_id, sender_role, message, file_url, deleted_at, pinned_at,
            starred_by, bookmarked_by, translated
     from public.chat_messages
     where id = $1
     limit 1`,
    [id],
  );
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin();
  const user = await verifyUser();
  if (!admin && !user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const message = await loadMessage(id);
  if (!message) return NextResponse.json({ ok: false, error: "Message not found" }, { status: 404 });
  if (!admin && user && message.room_id !== `client_${user.user.id}`) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (message.deleted_at) return NextResponse.json({ ok: false, error: "Deleted message" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");
  const viewerKey = keyFor(admin, user);

  try {
    if (action === "pin" || action === "unpin") {
      const shouldPin = action === "pin" ? body?.value !== false : false;
      if (shouldPin) {
        await glashQuery(`update public.chat_messages set pinned_at = now(), pinned_by = $2 where id = $1`, [
          id,
          viewerKey,
        ]);
        await glashQuery(
          `insert into public.chat_message_pins (room_id, message_id, pinned_by)
           values ($1, $2, $3)
           on conflict (room_id, message_id)
           do update set pinned_by = excluded.pinned_by, pinned_at = now()`,
          [message.room_id, id, viewerKey],
        );
      } else {
        await glashQuery(`update public.chat_messages set pinned_at = null, pinned_by = null where id = $1`, [id]);
        await glashQuery(`delete from public.chat_message_pins where room_id = $1 and message_id = $2`, [
          message.room_id,
          id,
        ]);
      }
    } else if (action === "star" || action === "unstar") {
      const starred = toggle(message.starred_by, viewerKey, action === "star" ? body?.value !== false : false);
      await glashQuery(`update public.chat_messages set starred_by = $2::jsonb where id = $1`, [
        id,
        JSON.stringify(starred),
      ]);
    } else if (action === "bookmark" || action === "unbookmark") {
      const bookmarked = toggle(message.bookmarked_by, viewerKey, action === "bookmark" ? body?.value !== false : false);
      await glashQuery(`update public.chat_messages set bookmarked_by = $2::jsonb where id = $1`, [
        id,
        JSON.stringify(bookmarked),
      ]);
      if (bookmarked.includes(viewerKey)) {
        await glashQuery(
          `insert into public.chat_message_bookmarks (message_id, room_id, viewer_key, note)
           values ($1, $2, $3, $4)
           on conflict (message_id, viewer_key)
           do update set note = excluded.note`,
          [id, message.room_id, viewerKey, typeof body?.note === "string" ? body.note : null],
        );
      } else {
        await glashQuery(`delete from public.chat_message_bookmarks where message_id = $1 and viewer_key = $2`, [
          id,
          viewerKey,
        ]);
      }
    } else if (action === "edit") {
      const next = typeof body?.message === "string" ? body.message.trim() : "";
      if (!next) return NextResponse.json({ ok: false, error: "Message body required" }, { status: 400 });
      const ownsMessage = admin ? message.sender_role === "admin" : message.sender_id === user?.user.id;
      if (!ownsMessage) return NextResponse.json({ ok: false, error: "You cannot edit this message" }, { status: 403 });
      await glashQuery(`update public.chat_messages set message = $2, edited_at = now() where id = $1`, [id, next]);
    } else if (action === "delete") {
      const ownsMessage = admin ? true : message.sender_id === user?.user.id;
      if (!ownsMessage) return NextResponse.json({ ok: false, error: "You cannot delete this message" }, { status: 403 });
      await glashQuery(`update public.chat_messages set deleted_at = now(), message = '', file_url = null where id = $1`, [id]);
    } else if (action === "translate") {
      const language = String(body?.language || "English").trim().slice(0, 60);
      if (!message.message?.trim()) return NextResponse.json({ ok: false, error: "No text to translate" }, { status: 400 });
      const result = await chatComplete(buildMessages("chat_translate", { language, text: message.message }), {
        temperature: 0.2,
        max_tokens: 500,
      });
      await glashQuery(`update public.chat_messages set translated = $2::jsonb where id = $1`, [
        id,
        JSON.stringify({ ...(message.translated || {}), [language]: result.text.trim() }),
      ]);
    } else {
      return NextResponse.json({ ok: false, error: "Unsupported action" }, { status: 400 });
    }

    const updated = await loadMessage(id);
    await glashQuery(
      `insert into public.team_chat_audit_logs
        (actor_key, actor_kind, action, resource_type, resource_id, room_id, metadata)
       values ($1, $2, $3, 'chat_message', $4, $5, '{}'::jsonb)`,
      [viewerKey, admin ? "admin" : "client", `client_message.${action}`, id, message.room_id],
    );
    return NextResponse.json({ ok: true, message: updated });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Message action failed" },
      { status: 500 },
    );
  }
}
