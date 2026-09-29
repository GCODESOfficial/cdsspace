import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("leave clarifications are threaded, ownership checked, and kept pending", () => {
  const migration = read("glashdb/migrations/20261004_leave_clarification_threads.sql");
  const adminApi = read("src/app/api/admin/timebook/route.ts");
  const teamApi = read("src/app/api/team/timebook/route.ts");

  assert.match(migration, /team_leave_clarification_messages/);
  assert.match(migration, /sender_type in \('admin', 'team_member'\)/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all .* from anon, authenticated/s);
  assert.match(adminApi, /action === "ask_leave_clarification"/);
  assert.match(adminApi, /leave\.status !== "pending"/);
  assert.match(teamApi, /action === "reply_leave_clarification"/);
  assert.match(teamApi, /\.eq\("team_member_id", session\.id\)/);
  assert.match(teamApi, /\.eq\("sender_type", "admin"\)/);
});

test("admin and team leave views render safe clickable links and reply controls", () => {
  const hrm = read("src/app/admin/hrm/page.tsx");
  const adminTimebook = read("src/app/admin/timebook/page.tsx");
  const teamTimebook = read("src/app/team/timebook/page.tsx");
  const linkRenderer = read("src/components/chat/message-links.tsx");

  for (const source of [hrm, adminTimebook, teamTimebook]) {
    assert.match(source, /<Linkified/);
  }
  assert.match(hrm, /Ask/);
  assert.match(adminTimebook, /Ask a question/);
  assert.match(teamTimebook, /Send response/);
  assert.match(linkRenderer, /target="_blank"/);
  assert.match(linkRenderer, /rel="noopener noreferrer"/);
  assert.match(linkRenderer, /https\?:\\\/\\\//);
});
