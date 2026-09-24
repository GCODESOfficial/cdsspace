import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const taskboardSource = await readFile(
  new URL("../src/components/taskboard/Taskboard.tsx", import.meta.url),
  "utf8",
);

test("mobile taskboard keeps page scrolling separate from horizontal board navigation", () => {
  assert.match(taskboardSource, /data-testid="taskboard-scroll-area"/);
  assert.match(
    taskboardSource,
    /snap-x snap-proximity scroll-smooth[\s\S]*overflow-x-auto overflow-y-hidden overscroll-x-contain/,
  );
  assert.match(taskboardSource, /overflow-x-hidden bg-\[#F4F7FD\]/);
  assert.match(taskboardSource, /scroll-mx-4 snap-start/);
});

test("mobile users can jump directly to a board list", () => {
  assert.match(taskboardSource, /function taskListElementId/);
  assert.match(taskboardSource, /scrollIntoView\(\{/);
  assert.match(taskboardSource, /behavior: "smooth"/);
  assert.match(taskboardSource, />Jump to a list</);
  assert.match(taskboardSource, />Swipe sideways or tap</);
});

test("touch scrolling is not mistaken for immediate drag and drop", () => {
  assert.match(taskboardSource, /useSensor\(MouseSensor/);
  assert.match(
    taskboardSource,
    /useSensor\(TouchSensor, \{ activationConstraint: \{ delay: 220, tolerance: 8 \} \}\)/,
  );
  assert.doesNotMatch(taskboardSource, /useSensor\(PointerSensor/);
  assert.ok(
    taskboardSource.match(/touch-none cursor-grab/g)?.length >= 2,
    "task and list drag handles should opt out of browser panning only on the handle",
  );
});

