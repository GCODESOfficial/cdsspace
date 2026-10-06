import "server-only";

import { getClientAccountState } from "@/lib/client-account";
import { getGlashDbAdmin } from "@/lib/glashdb";

export async function getClientChatContext() {
  const account = await getClientAccountState();
  const db = getGlashDbAdmin() as any;
  if (!account || !db) return null;
  return { account, db };
}

export async function getClientProjectThread(
  db: any,
  clientUserId: string,
  threadId: string,
) {
  const [{ data: participant }, { data: thread }] = await Promise.all([
    db
      .from("team_chat_client_participants")
      .select("thread_id, client_user_id, last_read_at, joined_at")
      .eq("thread_id", threadId)
      .eq("client_user_id", clientUserId)
      .maybeSingle(),
    db
      .from("team_chat_threads")
      .select("id, name, kind, project_id, includes_admin, is_announcement_only, created_at, archived_at")
      .eq("id", threadId)
      .maybeSingle(),
  ]);

  if (!participant || !thread?.project_id) return null;
  return { participant, thread };
}

