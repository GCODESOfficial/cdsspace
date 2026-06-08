/**
 * Small helper for enqueueing team_notifications rows. Most call sites
 * just need: recipient, kind, title, body, and a link. This centralises
 * the shape so we don't spray raw inserts everywhere.
 *
 * Known kinds (free text, validated by convention):
 *   chat_message, chat_mention, work_assigned, cdocs_tag, csign_request,
 *   payroll, cmeet_invite, doc_shared, sub_admin_granted, project_assigned
 */
import { glashQuery } from "@/lib/glashdb/postgres";

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
    try {
        await glashQuery(
            `insert into public.team_notifications
              (recipient_id, kind, title, body, link, actor_member_id, actor_is_admin,
               thread_id, meeting_id, document_id, work_id)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
                input.recipient_id,
                input.kind,
                input.title,
                input.body ?? null,
                input.link ?? null,
                input.actor_member_id ?? null,
                input.actor_is_admin ?? false,
                input.thread_id ?? null,
                input.meeting_id ?? null,
                input.document_id ?? null,
                input.work_id ?? null,
            ],
        );
    } catch (err) {
        console.error("[notify-team] insert failed:", err);
    }
}

export async function notifyMany(inputs: NotifyInput[]): Promise<void> {
    if (inputs.length === 0) return;
    try {
        await glashQuery(
            `insert into public.team_notifications
              (recipient_id, kind, title, body, link, actor_member_id, actor_is_admin,
               thread_id, meeting_id, document_id, work_id)
             select *
               from unnest(
                 $1::uuid[], $2::text[], $3::text[], $4::text[], $5::text[],
                 $6::uuid[], $7::boolean[], $8::uuid[], $9::uuid[], $10::uuid[], $11::integer[]
               )`,
            [
                inputs.map((input) => input.recipient_id),
                inputs.map((input) => input.kind),
                inputs.map((input) => input.title),
                inputs.map((input) => input.body ?? null),
                inputs.map((input) => input.link ?? null),
                inputs.map((input) => input.actor_member_id ?? null),
                inputs.map((input) => input.actor_is_admin ?? false),
                inputs.map((input) => input.thread_id ?? null),
                inputs.map((input) => input.meeting_id ?? null),
                inputs.map((input) => input.document_id ?? null),
                inputs.map((input) => input.work_id ? Number(input.work_id) : null),
            ],
        );
    } catch (err) {
        console.error("[notify-team] bulk insert failed:", err);
    }
}
