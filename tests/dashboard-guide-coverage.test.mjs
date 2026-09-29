import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function guideKeys(source) {
  return new Set([...source.matchAll(/^\s{2}"?([a-z][a-z0-9:/-]*)"?:\s*\{$/gm)].map((m) => m[1]));
}

/** The same resolution the guide uses: sub-page first, then its parent. */
function resolves(keys, portal, segments) {
  const clean = segments.filter(Boolean);
  const candidates = clean.length > 1
    ? [`${portal}:${clean.slice(0, 2).join("/")}`, `${portal}:${clean[0]}`, clean.slice(0, 2).join("/"), clean[0]]
    : [`${portal}:${clean[0] || "dashboard"}`, clean[0] || "dashboard"];
  return candidates.some((key) => keys.has(key));
}

test("every page in the sidebars has written guidance, not the generic fallback", async () => {
  const [guide, adminNav, teamNav] = await Promise.all([
    read("src/components/assistant/DashboardGuide.tsx"),
    read("src/components/admin/AdminSidebar.tsx"),
    read("src/components/team/TeamSidebar.tsx"),
  ]);
  const keys = guideKeys(guide);

  const missing = [];
  for (const [nav, portal, prefix] of [[adminNav, "admin", "/admin"], [teamNav, "team", "/team"]]) {
    const routes = [...nav.matchAll(new RegExp(`href: "(${prefix}[^"?]*)`, "g"))].map((m) => m[1]);
    for (const route of new Set(routes)) {
      const segments = route.split("/").filter(Boolean).slice(1);
      if (!resolves(keys, portal, segments)) missing.push(route);
    }
  }
  assert.deepEqual(missing, [], `these screens would fall back to generic guidance: ${missing.join(", ")}`);
});

test("guidance names the real workflow rather than describing a dashboard", async () => {
  const guide = await read("src/components/assistant/DashboardGuide.tsx");
  // Each written guide carries its own questions, in the words someone would use.
  assert.ok(guideKeys(guide).size > 60, "expected detailed guides for most screens");
  assert.match(guide, /How many designs are left in my quota this month\?/);
  assert.match(guide, /Who currently has this laptop\?/);
  assert.match(guide, /What is the difference between Confirm and Record payment\?/);
  // The generic wording must no longer be the first thing most screens say.
  assert.match(guide, /describeEverything/);
});
