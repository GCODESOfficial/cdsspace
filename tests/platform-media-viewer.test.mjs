import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("the platform media viewer never navigates to its storage URL", async () => {
  const viewer = await read("src/components/media/PlatformMediaViewer.tsx");
  assert.match(viewer, /role="dialog"/);
  assert.match(viewer, /<img[\s\S]*src=\{url\}/);
  assert.doesNotMatch(viewer, /<a[^>]+href=\{url\}/);
  assert.doesNotMatch(viewer, /window\.open\(/);
});

test("chat image thumbnails use the in-platform viewer", async () => {
  const paths = [
    "src/components/chat/admin-chat-panel.tsx",
    "src/components/chat/team-chat-panel.tsx",
    "src/components/chat/chat-widget.tsx",
    "src/app/(dashboard)/dashboard/messages/page.tsx",
  ];
  for (const path of paths) {
    const source = await read(path);
    assert.match(source, /PlatformMediaViewer/, `${path} should render image previews inside the platform`);
  }
});

test("work, delivery and drive images use the same viewer", async () => {
  const paths = [
    "src/app/team/work/page.tsx",
    "src/app/team/work-tracking/page.tsx",
    "src/components/taskboard/Taskboard.tsx",
    "src/components/deliveries/DeliveryAssetBrowser.tsx",
    "src/app/(dashboard)/dashboard/documents/page.tsx",
    "src/app/drive/[token]/page.tsx",
    "src/app/admin/team-reports/page.tsx",
  ];
  for (const path of paths) {
    const source = await read(path);
    assert.match(source, /PlatformMediaViewer/, `${path} should render image previews inside the platform`);
  }
});
