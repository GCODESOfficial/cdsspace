import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("reading a direct chat clears its matching bell notifications", async () => {
  const route = await read("src/app/api/chat/read/route.ts");
  assert.match(route, /from\("notifications"\)/);
  assert.match(route, /eq\("type", "new_message"\)/);
  assert.match(route, /CLIENT_MESSAGE_LINK_PREFIX = "\/dashboard\/messages"/);
  assert.match(route, /like\("link", `\$\{CLIENT_MESSAGE_LINK_PREFIX\}%`\)/);
  assert.match(route, /eq\("link", `\/chat\?room=\$\{roomId\}`\)/);
});

test("chat and notification bells refresh immediately after a read", async () => {
  const [messages, clientBell, adminBell] = await Promise.all([
    read("src/app/(dashboard)/dashboard/messages/page.tsx"),
    read("src/components/notifications/notification-bell.tsx"),
    read("src/components/notifications/admin-notification-bell.tsx"),
  ]);
  assert.match(messages, /hasUnreadAdminMessage \|\| !quiet/);
  assert.match(messages, /dispatchEvent\(new Event\("cds:notification-pulse"\)\)/);
  assert.match(clientBell, /addEventListener\("cds:notification-pulse", fetchNotifications\)/);
  assert.match(adminBell, /addEventListener\("cds:notification-pulse", fetchNotifications\)/);
});

test("nested authentication controls inherit their outer corner radius", async () => {
  const [signup, confirmation, login, phone] = await Promise.all([
    read("src/components/marketing/SignUpForm.tsx"),
    read("src/components/marketing/EmailConfirmationModal.tsx"),
    read("src/components/marketing/LoginForm.tsx"),
    read("src/components/shared/PhoneInput.tsx"),
  ]);
  assert.ok((signup.match(/style=\{\{ borderRadius: "inherit" \}\}/g) || []).length >= 5);
  assert.match(confirmation, /style=\{\{ borderRadius: "inherit" \}\}/);
  assert.ok((login.match(/style=\{\{ borderRadius: "inherit" \}\}/g) || []).length >= 3);
  assert.ok((phone.match(/style=\{\{ borderRadius: "inherit" \}\}/g) || []).length >= 2);
});
