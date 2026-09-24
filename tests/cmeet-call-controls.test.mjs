import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [meetClient, rtcClient, signalClient, signalRoute, roomRoute, globals, agendaRoute, createRoute, legacyCreateRoute, clientCallRoute, meetingModeModal, cmeetList, embeddedPanel] = await Promise.all([
  readFile(new URL("../src/app/meet/[code]/MeetClient.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/cmeet-rtc.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/cmeet-signal.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/cmeet/[code]/signal/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/cmeet/[code]/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/team/meetings/[code]/agenda/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/cmeet/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/team/meetings/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/client/chat/call/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/components/chat/MeetingModeModal.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/team/CMeetList.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/chat/EmbeddedMeetingPanel.tsx", import.meta.url), "utf8"),
]);

test("mobile controls stay on one row and expose the complete More modal", () => {
  assert.match(meetClient, /grid w-full grid-cols-5 gap-2 sm:hidden/);
  assert.match(meetClient, /aria-label="More meeting controls"/);
  assert.match(meetClient, /<MoreControlsModal/);
  assert.match(meetClient, /All call actions in one place/);
});

test("live translation remains editable after joining", () => {
  assert.doesNotMatch(meetClient, /Audio choices are locked during this meeting/);
  assert.doesNotMatch(meetClient, /disabled=\{locked\}/);
  assert.match(meetClient, /setShowTranslation\(true\)/);
  assert.match(meetClient, /translation\.enabled, translation\.heardLanguage/);
});

test("captions are attached to participant tiles instead of the page footer", () => {
  assert.match(meetClient, /caption=\{translation\.enabled && translation\.captions/);
  assert.match(meetClient, /function ParticipantCaption/);
  assert.match(meetClient, /absolute inset-x-2 bottom-20/);
  assert.doesNotMatch(meetClient, /fixed inset-x-3 bottom-\[82px\]/);
});

test("tag-teammates is removed from the in-call controls", () => {
  assert.doesNotMatch(meetClient, /TagMembersModal|Tag teammates|setShowTag/);
});

test("raised hands and host mute-all travel over room signaling", () => {
  assert.match(rtcClient, /setHandRaised\(raised: boolean\)/);
  assert.match(rtcClient, /type: "hand-state"/);
  assert.match(rtcClient, /case "hand-state"/);
  assert.match(rtcClient, /hostMuteAll\(\)/);
  assert.match(rtcClient, /if \(this\.hostRole !== "host"\) return/);
  assert.match(rtcClient, /case "host-mute-all"/);
  assert.match(meetClient, /onHostMuteAll:/);
  assert.match(signalRoute, /hostControlTypes = new Set\(\["host-mute", "host-mute-all", "host-set-mode", "host-end", "host-kick"\]\)/);
  assert.match(signalRoute, /meeting\?\.created_by === actorMemberId/);
  assert.match(signalRoute, /Only the meeting host can use this control/);
  assert.match(meetClient, /cmeet-hand-attention absolute -right-[^\n]+-top-3/);
  assert.match(globals, /\.cmeet-hand-attention[\s\S]*animation: cmeet-hand-attention/);
});

test("active speakers use animated profile waves and the admin logo fills its circle", () => {
  assert.match(meetClient, /function SpeakingWaves/);
  assert.match(meetClient, /speaking=\{localSpeaking\}/);
  assert.match(meetClient, /cmeet-speaking-wave absolute -inset-2/);
  assert.match(globals, /\.cmeet-speaking-wave[\s\S]*animation: cmeet-speaking-wave/);
  assert.match(meetClient, /isAdmin \? "scale-\[1\.18\] object-contain"/);
});

test("super admins get the full participant list while hosts can remove peers", () => {
  assert.match(roomRoute, /is_super_admin: actor\.role === "super_admin"/);
  assert.match(meetClient, /isSuperAdmin && showParticipantList/);
  assert.match(meetClient, /function ParticipantListDropdown/);
  assert.match(meetClient, /onRemove=\{isHost \? \(peer\) => void removeParticipant\(peer\)/);
  assert.match(meetClient, /clientRef\.current\?\.hostKick\(\[peer\.peerId\]\)/);
  assert.match(rtcClient, /hostKick\(targetPeerIds: string\[\]\)/);
});

test("host end is flushed immediately and every participant follows ended room state", () => {
  assert.match(rtcClient, /async hostEnd\(\)[\s\S]*await this\.transport\?\.flush\(\)/);
  assert.match(signalClient, /\["leave", "host-end", "host-kick", "host-mute", "host-mute-all", "host-set-mode"\]/);
  assert.match(meetClient, /await clientRef\.current\?\.hostEnd\(\)/);
  assert.match(meetClient, /payload\.meeting\.status === "ended"[\s\S]*The host has ended this meeting/);
});

test("participant grid adapts to desktop, phone and tablet orientation", () => {
  assert.match(meetClient, /"mobile-portrait" \| "mobile-landscape" \| "tablet-portrait" \| "tablet-landscape" \| "desktop"/);
  assert.match(meetClient, /data-viewport-layout=\{viewportLayout\}/);
  assert.match(meetClient, /viewportLayout === "mobile-portrait" \? 1/);
  assert.match(meetClient, /viewportLayout === "mobile-portrait" && slots > 1/);
  assert.match(meetClient, /gridTemplateColumns: `repeat\(\$\{columns\}, minmax\(0, \$\{tileWidth\}px\)\)`/);
});

test("recording and screenshots are host-only and meeting events have distinct sounds", () => {
  assert.match(meetClient, /if \(meetingRole !== "host"\)[\s\S]*Only the meeting host can record this call/);
  assert.match(meetClient, /if \(meetingRole !== "host"\)[\s\S]*Only the meeting host can take meeting screenshots/);
  assert.match(meetClient, /\{isHost && <MoreControlButton[^\n]+Record call/);
  assert.match(meetClient, /"participant-joined": \[\[523/);
  assert.match(meetClient, /"hand-raised": \[\[659/);
  assert.match(meetClient, /"host-action": \[\[294/);
});

test("screen sharing keeps the host camera beside a dedicated presentation stream", () => {
  assert.match(rtcClient, /screenStream: MediaStream/);
  assert.match(rtcClient, /replaceScreenTrack\(newTrack: MediaStreamTrack \| null/);
  assert.match(rtcClient, /screen: RTCRtpSender \| null/);
  assert.match(meetClient, /stream=\{presenter\.peer\.screenStream\}/);
  assert.match(meetClient, /key="local-thumb"[\s\S]*stream=\{localStream\}/);
  assert.doesNotMatch(meetClient, /filter\(\(p\) => presenter === "local"/);
});

test("only hosts add agenda items while joined participants can mark them discussed", () => {
  assert.match(agendaRoute, /actorMemberId === meeting\.created_by/);
  assert.match(agendaRoute, /Only the meeting host can add agenda items/);
  assert.match(agendaRoute, /canParticipate\(meeting, body\)/);
  assert.match(agendaRoute, /completed_at: body\.completed/);
  assert.match(createRoute, /creatorMemberId/);
  assert.match(createRoute, /team_meeting_agenda_items/);
  assert.match(legacyCreateRoute, /creatorMemberId/);
  assert.match(legacyCreateRoute, /team_meeting_agenda_items/);
  assert.match(clientCallRoute, /created_by_client: account\.user\.id/);
  assert.match(clientCallRoute, /team_meeting_agenda_items/);
  assert.match(meetClient, /canAdd=\{isHost\}/);
  assert.match(meetClient, /placeholder="Add an agenda item"/);
  assert.match(meetingModeModal, /requiresApproval \? \[\] : normalizeCMeetAgendaItems/);
  assert.match(cmeetList, /requiresApproval \? \[\] : normalizeCMeetAgendaItems/);
});

test("the main grid fills its cells and minimize opens a floating browser player", () => {
  assert.match(meetClient, /place-content-center overflow-hidden/);
  assert.match(meetClient, /fit \? "h-full min-h-0 w-full min-w-0"/);
  assert.match(meetClient, /requestPictureInPicture/);
  assert.match(meetClient, /webkitSetPresentationMode/);
  assert.match(embeddedPanel, /router\.push\(destination\)/);
  assert.match(embeddedPanel, /buildCMeetAutoJoinPath\(url\)/);
  assert.doesNotMatch(embeddedPanel, /<iframe/);
});

test("voice-only calls use compact profile circles and the CDS favicon for admins", () => {
  assert.match(meetClient, /meeting\.audio_only \? \(/);
  assert.match(meetClient, /function AudioParticipantGrid/);
  assert.match(meetClient, /rounded-full border-2/);
  assert.match(meetClient, /participant\.participantKind === "admin" \? "\/favicon\.png"/);
  assert.match(rtcClient, /avatarUrl: this\.avatarUrl/);
  assert.match(rtcClient, /participantKind: this\.participantKind/);
});

test("mic and camera state stays synchronized and hosts can mute one participant", () => {
  assert.match(rtcClient, /updateMediaState\(hasAudio: boolean, hasVideo: boolean\)/);
  assert.match(rtcClient, /type: "media-state"/);
  assert.match(rtcClient, /case "media-state"/);
  assert.match(rtcClient, /hostMuteParticipant\(targetPeerId: string\)/);
  assert.match(rtcClient, /type: "host-mute"/);
  assert.match(rtcClient, /case "host-mute"/);
  assert.match(meetClient, /function MediaStatusBadges/);
  assert.match(meetClient, /clientRef\.current\?\.updateMediaState\(next, camOnRef\.current\)/);
  assert.match(meetClient, /clientRef\.current\?\.hostMuteParticipant\(peer\.peerId\)/);
  assert.match(meetClient, /Microphone on\. Click to mute this participant/);
});

test("speech capture requests browser echo, noise and gain processing", () => {
  assert.match(meetClient, /function buildCMeetSpeechAudioConstraints/);
  assert.match(meetClient, /constraints\.echoCancellation = \{ ideal: true \}/);
  assert.match(meetClient, /constraints\.noiseSuppression = \{ ideal: true \}/);
  assert.match(meetClient, /constraints\.autoGainControl = \{ ideal: true \}/);
  assert.match(meetClient, /constraints\.voiceIsolation = \{ ideal: true \}/);
  assert.match(rtcClient, /useinbandfec=1;usedtx=1;stereo=0/);
});

test("minimize has a non-blocking fallback on every device", () => {
  assert.match(meetClient, /aria-label="Minimized cMeet call"/);
  assert.match(meetClient, /target="_blank".*Continue working/);
  assert.doesNotMatch(meetClient, /browser could not open the floating meeting window/);
  assert.match(meetClient, /setMinimized\(true\)/);
});

test("participant actions are centered in one line", () => {
  assert.match(meetClient, /className="-bottom-3 left-1\/2 -translate-x-1\/2"/);
  assert.match(meetClient, /className="bottom-2 left-1\/2 -translate-x-1\/2"/);
  assert.match(meetClient, /onRemove=\{onRemove\}/);
});

test("hosts can switch the whole room between audio and video with cameras off", () => {
  assert.match(roomRoute, /export async function PATCH/);
  assert.match(roomRoute, /audio_only: body\.audioOnly/);
  assert.match(rtcClient, /hostSetMeetingMode\(audioOnly: boolean\)/);
  assert.match(rtcClient, /type: "host-set-mode"/);
  assert.match(rtcClient, /case "host-set-mode"/);
  assert.match(meetClient, /async function switchMeetingMode/);
  assert.match(meetClient, /await clientRef\.current\?\.replaceVideoTrack\(null\)/);
  assert.match(meetClient, /camOnRef\.current = false/);
  assert.match(meetClient, /Video mode will open for everyone with every camera off/);
});
