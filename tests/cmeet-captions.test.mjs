import { strict as assert } from "node:assert";
import test from "node:test";

/**
 * The caption reducer from MeetClient's onTranscript, in isolation.
 *
 * The bug this pins down: a delta arriving after an utterance was marked done
 * used to be appended to that finished sentence, so the line grew without end
 * and the same phrases stacked up on screen for the whole call.
 */
const CAPTION_MAX_CHARS = 180;

function trimCaption(text) {
  const clean = text.replace(/\s+/g, " ").trimStart();
  if (clean.length <= CAPTION_MAX_CHARS) return clean;
  const tail = clean.slice(clean.length - CAPTION_MAX_CHARS);
  const boundary = tail.indexOf(" ");
  return (boundary === -1 ? tail : tail.slice(boundary + 1)).trimStart();
}

function applyTranscript(previous, text, final) {
  const base = previous && !previous.done ? previous.text : "";
  const merged = final ? (text || base) : `${base}${text}`;
  return { text: trimCaption(merged), done: final };
}

test("deltas build up the sentence being spoken", () => {
  let caption;
  caption = applyTranscript(caption, "Hello ", false);
  caption = applyTranscript(caption, "there, ", false);
  caption = applyTranscript(caption, "how are you?", false);
  assert.equal(caption.text, "Hello there, how are you?");
  assert.equal(caption.done, false);
});

test("a new sentence replaces the finished one instead of extending it", () => {
  let caption = applyTranscript(undefined, "First sentence.", true);
  assert.equal(caption.done, true);
  // The next thing the speaker says must start from nothing.
  caption = applyTranscript(caption, "Second", false);
  assert.equal(caption.text, "Second");
  caption = applyTranscript(caption, " sentence.", false);
  assert.equal(caption.text, "Second sentence.");
});

test("the run-on line from the screenshot cannot happen again", () => {
  // Ten finished utterances in a row: each replaces the last, none accumulate.
  let caption;
  for (let index = 0; index < 10; index += 1) {
    caption = applyTranscript(caption, `wacht even, wat is dat ook alweer? ${index}`, true);
    caption = applyTranscript(caption, "Hallootjes, ", false);
    caption = applyTranscript(caption, "hallo YouTube!", false);
  }
  assert.equal(caption.text, "Hallootjes, hallo YouTube!");
  assert.ok(caption.text.length < 40, "the caption must not grow with the call");
});

test("a final event with no transcript keeps what was already shown", () => {
  let caption = applyTranscript(undefined, "Half a thought", false);
  caption = applyTranscript(caption, "", true);
  assert.equal(caption.text, "Half a thought");
  assert.equal(caption.done, true);
});

test("a long utterance is cut to the words just said, never mid-word", () => {
  const long = "supercalifragilistic ".repeat(30).trim();
  const caption = applyTranscript(undefined, long, true);
  assert.ok(caption.text.length <= CAPTION_MAX_CHARS);
  assert.ok(long.endsWith(caption.text), "it keeps the tail, which is what was just said");
  assert.equal(caption.text.startsWith("supercalifragilistic"), true, "no partial leading word");
});

test("whitespace from the delta stream is normalised", () => {
  const caption = applyTranscript(undefined, "too    many\n\nspaces", true);
  assert.equal(caption.text, "too many spaces");
});
