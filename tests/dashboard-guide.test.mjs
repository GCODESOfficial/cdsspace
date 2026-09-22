import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const guide = readFileSync("src/components/assistant/DashboardGuide.tsx", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");
const navbar = readFileSync("src/components/layout/NavbarDashboard.tsx", "utf8");
const sidebar = readFileSync("src/components/layout/Sidebar.tsx", "utf8");
const createApp = readFileSync("src/components/create/CreateApp.tsx", "utf8");
const clientOverview = readFileSync("src/app/(dashboard)/dashboard/page.tsx", "utf8");

test("the page guide is mounted once in the shared application shell", () => {
  assert.match(layout, /<DashboardGuide \/>/);
});

test("all five dashboard portals are recognised", () => {
  for (const portal of ["client", "create", "marketer", "team", "admin"]) {
    assert.match(guide, new RegExp(`portal: \\\"${portal}\\\"|${portal}: \\\"`));
  }
});

test("guidance is local and does not make a network or OpenAI request", () => {
  assert.doesNotMatch(guide, /fetch\s*\(/);
  assert.doesNotMatch(guide, /api\.openai\.com|OPENAI_API_KEY|\/api\/.*assistant/i);
  assert.match(guide, /answerLocally/);
});

test("typed and browser speech input are available", () => {
  assert.match(guide, /<textarea/);
  assert.match(guide, /SpeechRecognition/);
  assert.match(guide, /webkitSpeechRecognition/);
});

test("only launcher position is persisted by the guide", () => {
  const writes = [...guide.matchAll(/localStorage\.setItem\(([^,]+)/g)].map((match) => match[1]);
  assert.deepEqual(writes, ["POSITION_KEY"]);
});

test("quick questions and instructions are derived from the current page actions and sections", () => {
  assert.match(guide, /discoverPageActions/);
  assert.match(guide, /quickQuestions\(effectiveContext\)/);
  assert.match(guide, /What does \$\{context\.actions\[0\]\.label\} do\?/);
  assert.match(guide, /Steps:\\n1\./);
});

test("mobile dashboard chrome keeps notifications by the menu and links both logos home", () => {
  assert.match(navbar, /href=\{dashboardPath\("\/dashboard"\)\}[\s\S]*aria-label="Return to dashboard home"/);
  assert.match(navbar, /flex shrink-0 items-center gap-1\.5[\s\S]*<NotificationBell \/>[\s\S]*aria-label="Open navigation"/);
  assert.match(sidebar, /href=\{dashboardPath\("\/dashboard"\)\}[\s\S]*aria-label="Return to dashboard home"/);
});

test("client Create Studio opens with its rail collapsed by default", () => {
  assert.match(clientOverview, /href: "\/create\?workspace=client"/);
  assert.match(createApp, /useState\(workspaceKind === "client"\)/);
  assert.match(createApp, /create_rail_collapsed_\$\{workspaceKind\}/);
});

test("page guidance covers floating launchers and uses only the dotted launcher icon", () => {
  assert.match(guide, /bottom-3 left-3 right-3 z-10/);
  assert.match(guide, /\{position && !open && \(/);
  assert.match(guide, /<Grip size=\{23\}/);
  assert.doesNotMatch(guide, />AI<\/span>/);
});
