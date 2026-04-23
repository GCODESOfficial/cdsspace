/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Small helper for enqueueing team_notifications rows. Most call sites
 * just need: recipient, kind, title, body, and a link. This centralises
 * the shape so we don't spray raw inserts everywhere.
 *
 * Known kinds (free text, validated by convention):
 *   chat_message, chat_mention, work_assigned, cdocs_tag, csign_request,
 *   payroll, cmeet_invite, doc_shared, sub_admin_granted, project_assigned
 */
import { supabaseAdmin } from "@/lib/supabase";

export interface NotifyInput {
    recipient_id: string;
    kind: string;
    title: string;
    body?: string | null;
    link?: string | null;
    actor_member_id?: string | null;
    actor_is_admin?: boolean;
    thread_id?: string | null;
    meeting_id?: string | null;
    document_id?: string | null;
    work_id?: string | null;
}

export async function notifyTeamMember(input: NotifyInput): Promise<void> {
    if (!supabaseAdmin) return;
    try {
        await (supabaseAdmin as any).from("team_notifications").insert({
            recipient_id: input.recipient_id,
            kind: input.kind,
            title: input.title,
            body: input.body ?? null,
            link: input.link ?? null,
            actor_member_id: input.actor_member_id ?? null,
            actor_is_admin: input.actor_is_admin ?? false,
            thread_id: input.thread_id ?? null,
            meeting_id: input.meeting_id ?? null,
            document_id: input.document_id ?? null,
            work_id: input.work_id ?? null,
        });
    } catch (err) {
        console.error("[notify-team] insert failed:", err);
    }
}

export async function notifyMany(inputs: NotifyInput[]): Promise<void> {
    if (!supabaseAdmin || inputs.length === 0) return;
    try {
        await (supabaseAdmin as any).from("team_notifications").insert(
            inputs.map((input) => ({
                recipient_id: input.recipient_id,
                kind: input.kind,
                title: input.title,
                body: input.body ?? null,
                link: input.link ?? null,
                actor_member_id: input.actor_member_id ?? null,
                actor_is_admin: input.actor_is_admin ?? false,
                thread_id: input.thread_id ?? null,
                meeting_id: input.meeting_id ?? null,
                document_id: input.document_id ?? null,
                work_id: input.work_id ?? null,
            })),
        );
    } catch (err) {
        console.error("[notify-team] bulk insert failed:", err);
    }
}
