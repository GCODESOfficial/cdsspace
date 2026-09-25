import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("expansion budgets use the responsive Executive Board table layout", async () => {
  const source = await read("src/components/admin/executive-board/ExecutiveBoardApp.tsx");
  const section = source.slice(source.indexOf("function ExpansionBudgets"), source.indexOf("function Targets"));

  assert.match(section, /overflow-x-auto rounded-2xl border border-slate-200 bg-white/);
  assert.match(section, /<table className="w-full min-w-\[1180px\] text-sm">/);
  for (const heading of ["Plan", "Timeline", "Requirement", "Committed", "Funding gap", "Readiness", "Stage"]) {
    assert.match(section, new RegExp(`>${heading}<`));
  }
  assert.doesNotMatch(section, /grid gap-4 xl:grid-cols-2/);
  assert.match(section, /expansionBudgetPdf\(budget, view\)/);
  assert.match(section, /edit\(budget\)/);
  assert.match(section, /remove\(budget\)/);
});
