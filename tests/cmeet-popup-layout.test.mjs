import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [meetClient, shareButton, viewportPortal] = await Promise.all([
  readFile(new URL("../src/app/meet/[code]/MeetClient.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/share/UniversalShareButton.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/ui/ViewportPortal.tsx", import.meta.url), "utf8"),
]);

test("control dialogs escape the scrolling meeting toolbar", () => {
  assert.match(shareButton, /<ViewportPortal>[\s\S]*\{open && \(/);
  assert.match(viewportPortal, /createPortal\(children, document\.body\)/);
  assert.match(meetClient, /<ViewportPortal>[\s\S]*showMoreControls[\s\S]*showTranslation[\s\S]*showAgenda[\s\S]*showEndConfirm/);
  assert.match(meetClient, /showParticipantList[\s\S]*<ParticipantListDropdown/);
});

test("compact-screen dialogs remain centered and internally scrollable", () => {
  assert.match(shareButton, /items-center justify-center overflow-y-auto overscroll-contain/);
  assert.match(shareButton, /max-h-\[calc\(100dvh-1\.5rem\)\]/);
  assert.match(meetClient, /z-\[180\] flex items-center justify-center overflow-y-auto overscroll-contain/);
  assert.match(meetClient, /max-h-\[calc\(100dvh-1\.5rem\)\]/);
});

test("participant name tags keep strong contrast in both meeting themes", () => {
  assert.match(meetClient, /bg-\[#071225\]\/90[^\n]+text-white[^\n]+backdrop-blur-sm/);
  assert.doesNotMatch(meetClient, /bottom-2 left-2[^\n]+bg-black\/60/);
});
