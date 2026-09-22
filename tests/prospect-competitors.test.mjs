import assert from "node:assert/strict";
import test from "node:test";

import {
  competitorsFromSearch,
  sanitizeCompanyCompetitors,
  sanitizeCompetitors,
} from "../src/lib/prospect-competitors.ts";

const davita = { companyName: "DAVITA INC", domain: "davita.com", website: "https://davita.com" };

test("removes the target brand and retains real direct and indirect companies", () => {
  const competitors = sanitizeCompetitors([
    { name: "DaVita Kidney Care", url: "https://www.davita.com/", note: "Own site", type: "direct" },
    { name: "About DaVita Kidney Care", url: "https://davita.com/about", note: "Own about page", type: "direct" },
    { name: "DaVita Careers", url: "https://careers.davita.com", note: "Own careers site", type: "direct" },
    { name: "Fresenius Medical Care", url: "https://freseniusmedicalcare.com/", note: "Dialysis provider", type: "direct" },
    { name: "CVS Health Kidney Care", url: "https://cvshealth.com/services/kidney-care", note: "Alternative care model", type: "indirect" },
    { name: "Fresenius Medical Care", url: "https://www.freseniusmedicalcare.com/about", note: "Duplicate", type: "direct" },
  ], davita);

  assert.deepEqual(competitors.map(({ name, type }) => ({ name, type })), [
    { name: "Fresenius Medical Care", type: "direct" },
    { name: "CVS Health Kidney Care", type: "indirect" },
  ]);
});

test("does not turn articles, directories or page titles into fallback competitors", () => {
  const competitors = competitorsFromSearch([
    { title: "DaVita Kidney Care: DaVita delivers dialysis services", url: "https://davita.com", description: "Target site", type: "direct" },
    { title: "Top 10 DaVita Competitors and Alternatives", url: "https://craft.co/davita/competitors", description: "Comparison list", type: "direct" },
    { title: "Fresenius Medical Care | Global dialysis services", url: "https://freseniusmedicalcare.com/en/home", description: "Dialysis services", type: "direct" },
    { title: "CVS Health - Kidney care", url: "https://cvshealth.com/services/kidney-care", description: "Alternative care model", type: "indirect" },
  ], davita);

  assert.deepEqual(competitors.map(({ name, type }) => ({ name, type })), [
    { name: "Fresenius Medical Care", type: "direct" },
    { name: "CVS Health", type: "indirect" },
  ]);
});

test("keeps geography and relationship while removing repeats across scopes", () => {
  const company = sanitizeCompanyCompetitors({
    company_name: "DaVita Inc",
    domain: "davita.com",
    website: "https://davita.com",
    competitors_local: [
      { name: "Fresenius Medical Care", url: "https://freseniusmedicalcare.com", note: "Same dialysis service", type: "direct" },
      { name: "CVS Health", url: "https://cvshealth.com", note: "Different care model", type: "indirect" },
    ],
    competitors_global: [
      { name: "Fresenius Medical Care", url: "https://www.freseniusmedicalcare.com/about", note: "Repeated", type: "direct" },
      { name: "Baxter International", url: "https://baxter.com", note: "Alternative", relationship: "indirect" },
    ],
  });

  assert.deepEqual(company.competitors_local, [
    { name: "Fresenius Medical Care", url: "https://freseniusmedicalcare.com/", note: "Same dialysis service", type: "direct" },
    { name: "CVS Health", url: "https://cvshealth.com/", note: "Different care model", type: "indirect" },
  ]);
  assert.deepEqual(company.competitors_global, [
    { name: "Baxter International", url: "https://baxter.com/", note: "Alternative", type: "indirect" },
  ]);
});
