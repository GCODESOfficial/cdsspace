import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("floating platform helpers stay hidden on every chat route", async () => {
  const [accessibility, guide] = await Promise.all([
    read("src/components/a11y/AccessibilityWidget.tsx"),
    read("src/components/assistant/DashboardGuide.tsx"),
  ]);
  for (const route of [
    "/team/chat",
    "/admin/chat",
    "/admin/messages",
    "/dashboard/messages",
  ]) {
    assert.match(accessibility, new RegExp(route.replaceAll("/", "\\/")));
    assert.match(guide, new RegExp(route.replaceAll("/", "\\/")));
  }
  assert.match(accessibility, /isChatPage/);
  assert.match(guide, /isChatPage/);
});

test("team composer places tools above the full-width message row", async () => {
  const source = await read("src/components/chat/team-chat-panel.tsx");
  assert.match(source, /flex flex-col gap-1 px-1\.5 py-1\.5/);
  assert.match(source, /flex min-h-9 items-center gap-1 overflow-x-auto/);
  assert.match(source, /relative flex w-full items-end/);
  assert.match(source, /Create a task post/);
});

test("client and admin client composers use separate tool and message rows", async () => {
  const [client, admin] = await Promise.all([
    read("src/app/(dashboard)/dashboard/messages/page.tsx"),
    read("src/components/chat/admin-chat-panel.tsx"),
  ]);
  for (const source of [client, admin]) {
    assert.match(source, /flex min-h-9 items-center gap-1 overflow-x-auto/);
    assert.match(source, /flex w-full items-center gap-2/);
    assert.match(source, /h-11 min-w-0 flex-1 rounded-2xl/);
  }
});
