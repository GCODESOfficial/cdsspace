import "server-only";

import { sendAdminAlert } from "@/lib/admin-alerts";
import { buildCMeetAutoJoinPath, buildCMeetPath } from "@/lib/cmeet-links";

type ClientCMeetStartedInput = {
  roomCode: string;
  title: string;
  audioOnly: boolean;
  clientName: string;
  clientEmail?: string | null;
};

/** Immediately notify the main desk accounts when a client opens a live call. */
export async function notifyClientCMeetStarted(input: ClientCMeetStartedInput): Promise<number> {
  const callType = input.audioOnly ? "Audio call" : "Video call";
  return sendAdminAlert({
    kind: "client_call",
    subject: input.clientName,
    details: [
      ["Call type", callType],
      ["Meeting", input.title],
      ["Room code", input.roomCode],
    ],
    actionPath: buildCMeetAutoJoinPath(buildCMeetPath(input.roomCode, input.title)),
    actionLabel: "Join the live cMeet",
    replyTo: input.clientEmail || undefined,
  });
}
