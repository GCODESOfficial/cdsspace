import { strict as assert } from "node:assert";
import test from "node:test";

/**
 * Which speakers get translated, mirroring the filter in MeetClient.
 *
 * Translation replaces the remote voice for this listener. It must therefore
 * be opt-in: changing a site language must never start a paid microphone relay
 * or alter call audio without the listener explicitly enabling S2S.
 */
function needsTranslation(peer, { explicitTranslation, heardLanguage }) {
  const hasLiveAudio = peer.hasLiveAudio !== false;
  if (!hasLiveAudio) return false;
  return explicitTranslation;
}

const listener = { explicitTranslation: false, heardLanguage: "fr" };

test("no speaker is translated until this listener enables live translation", () => {
  assert.equal(needsTranslation({ spokenLanguage: "nl" }, listener), false);
  assert.equal(needsTranslation({ spokenLanguage: "en" }, listener), false);
});

test("a speaker already in my language keeps their real voice", () => {
  assert.equal(needsTranslation({ spokenLanguage: "fr" }, listener), false);
  assert.equal(needsTranslation({ spokenLanguage: "FR" }, listener), false, "case must not matter");
});

test("a speaker whose language is unknown is left alone rather than guessed at", () => {
  // "Auto-detect" is the default, so this is the common case for anyone who has
  // not opened the translation settings.
  assert.equal(needsTranslation({ spokenLanguage: "auto" }, listener), false);
  assert.equal(needsTranslation({ spokenLanguage: "" }, listener), false);
  assert.equal(needsTranslation({}, listener), false);
});

test("enabling S2S translates every remote speaker for this listener", () => {
  const ticked = { explicitTranslation: true, heardLanguage: "fr" };
  assert.equal(needsTranslation({ spokenLanguage: "fr" }, ticked), true);
  assert.equal(needsTranslation({ spokenLanguage: "auto" }, ticked), true);
  assert.equal(needsTranslation({ spokenLanguage: "nl" }, ticked), true);
});

test("a speaker with no live audio is never translated", () => {
  assert.equal(needsTranslation({ spokenLanguage: "nl", hasLiveAudio: false }, listener), false);
  assert.equal(
    needsTranslation({ spokenLanguage: "nl", hasLiveAudio: false }, { explicitTranslation: true, heardLanguage: "fr" }),
    false,
    "not even when the box is ticked",
  );
});

test("the selected listening language does not implicitly activate S2S", () => {
  const english = { explicitTranslation: false, heardLanguage: "en" };
  assert.equal(needsTranslation({ spokenLanguage: "en" }, english), false);
  assert.equal(needsTranslation({ spokenLanguage: "auto" }, english), false);
  assert.equal(needsTranslation({ spokenLanguage: "nl" }, english), false);
});

test("a mixed room translates nobody while S2S is disabled", () => {
  const room = [
    { peerId: "a", spokenLanguage: "fr" },
    { peerId: "b", spokenLanguage: "nl" },
    { peerId: "c", spokenLanguage: "auto" },
    { peerId: "d", spokenLanguage: "ar" },
  ];
  const translated = room.filter((peer) => needsTranslation(peer, listener)).map((peer) => peer.peerId);
  assert.deepEqual(translated, []);
});
