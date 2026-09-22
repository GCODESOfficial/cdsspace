import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [meetClient, rtcClient, translationClient] = await Promise.all([
  readFile(new URL("../src/app/meet/[code]/MeetClient.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/cmeet-rtc.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/cmeet-translation.ts", import.meta.url), "utf8"),
]);

test("listening language remains private to the current meeting tab", () => {
  assert.doesNotMatch(rtcClient, /heardLanguage/);
  assert.match(rtcClient, /updateSpokenLanguage/);
  // The site language may be read as the listener's initial default, but the
  // meeting-specific choice is only read from and written to sessionStorage.
  assert.match(translationClient, /localStorage\.getItem\("cds\.lang"\)/);
  assert.doesNotMatch(translationClient, /localStorage\.(?:setItem|removeItem)\(/);
  assert.match(translationClient, /sessionStorage\.getItem\(preferenceStorageKey\(roomCode\)\)/);
  assert.match(translationClient, /sessionStorage\.setItem\(preferenceStorageKey\(roomCode\)/);
});

test("translation uses an exclusive translated-audio route", () => {
  assert.doesNotMatch(meetClient, /originalAudio/);
  assert.match(meetClient, /enabled=\{!translatedPeerIds\.has\(peer\.peerId\)\}/);
  assert.match(meetClient, /setTranslatedPeerIds/);
  assert.match(meetClient, /listenerPeerId: localPeerId/);
  assert.match(translationClient, /gpt-realtime-translate|realtime\/translations\/calls/);
});

test("translation playback is pre-warmed and uses an interactive audio sink", () => {
  assert.match(meetClient, /warmCMeetTranslation/);
  assert.match(meetClient, /primeCMeetTranslationPlayback/);
  assert.match(translationClient, /latencyHint: "interactive"/);
  assert.match(translationClient, /translationSecretCache/);
  assert.match(translationClient, /createMediaStreamSource/);
});

test("translation waits for a playable remote track and recovers transient failures", () => {
  assert.match(translationClient, /streams\[0\] \|\| new MediaStream\(\[track\]\)/);
  assert.match(translationClient, /translatedTrackReady/);
  assert.match(translationClient, /audio\.play\(\)\.then/);
  assert.match(translationClient, /if \(!this\.stopped\) this\.options\.onState\?\.\("live"\)/);
  assert.match(translationClient, /body: connection\.localDescription\?\.sdp \|\| offer\.sdp/);
  assert.match(meetClient, /translationRetryCountRef/);
  assert.match(meetClient, /scheduleRetry/);
});

test("the meeting mesh has one initial offer path", () => {
  assert.match(rtcClient, /initialHandshakeComplete/);
  assert.match(rtcClient, /if \(!initiator \|\| state\.initialHandshakeComplete\) return/);
  assert.match(rtcClient, /if \(initiator\) \{\s*await negotiate\(\)/);
  assert.doesNotMatch(rtcClient, /if \(initiator\) \{\s*const offer = await pc\.createOffer/);
});

test("remote media survives browsers that omit track-event streams", () => {
  assert.match(rtcClient, /attachRemoteTracks\(peerId, \[e\.track\], isScreen\)/);
  assert.match(rtcClient, /syncReceiverTracks\(msg\.from\)/);
  assert.match(rtcClient, /peer\.connection\.getTransceivers\(\)/);
});

test("the answerer publishes through the incoming offer transceivers", () => {
  assert.match(rtcClient, /bindAnswerSenders\(msg\.from, pc\)/);
  assert.match(rtcClient, /tx\.receiver\.track\.kind === "audio"/);
  assert.match(rtcClient, /audioTx\.sender\.replaceTrack\(audioTrack\)/);
  assert.match(rtcClient, /videoTx\.sender\.replaceTrack\(videoTrack\)/);
  assert.match(rtcClient, /if \(initiator\) \{\s*const audioTrack/);
});
