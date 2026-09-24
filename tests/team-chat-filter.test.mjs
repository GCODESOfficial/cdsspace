import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../src/components/chat/team-chat-panel.tsx", import.meta.url), "utf8");

test("team chat separates direct conversations from group spaces", () => {
  assert.match(panel, /type ThreadFilter = "team" \| "groups"/);
  assert.match(panel, /threadFilter === "team" \? thread\.kind === "direct" : thread\.kind !== "direct"/);
  assert.match(panel, /\["team", "Team", directThreadCount\]/);
  assert.match(panel, /\["groups", "Groups", groupThreadCount\]/);
  assert.match(panel, /Departments, projects and groups/);
  assert.match(panel, /filteredThreads\.map\(\(thread\)/);
});

test("changing tabs closes a conversation that is outside the selected filter", () => {
  assert.match(panel, /function changeThreadFilter\(nextFilter: ThreadFilter\)/);
  assert.match(panel, /setSelectedThread\(null\)/);
  assert.match(panel, /setMessages\(\[\]\)/);
  assert.match(panel, /setMobileShowThread\(false\)/);
});

test("conversation rows and message stacks use compact spacing", () => {
  assert.match(panel, /gap-2\.5 px-4 py-2\.5 text-left/);
  assert.match(panel, /<ul className="space-y-1">/);
  assert.match(panel, /reactionEntries\.length === 0 && "h-0 mt-0"/);
  assert.match(panel, /absolute -top-9 hidden items-center gap-1/);
});
