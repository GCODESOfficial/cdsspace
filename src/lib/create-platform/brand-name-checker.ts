import "server-only";

import type { EngineResult } from "@/lib/create-platform/engines/types";

export type AvailabilityState = "available" | "used" | "uncertain";

type DomainSignal = {
  domain: string;
  status: AvailabilityState;
  evidence: string;
  url: string;
};

type SocialSignal = {
  platform: string;
  handle: string;
  status: AvailabilityState;
  evidence: string;
  url: string;
};

type CompanySignal = {
  name: string;
  jurisdiction: string;
  status: "exact" | "similar";
  evidence: string;
  url: string;
};

type SearchAnalysis = {
  summary?: string;
  companies?: CompanySignal[];
  risks?: string[];
  alternatives?: string[];
  sources?: Array<{ title?: string; url?: string }>;
};

const COMMON_TLDS = ["com", "co", "io", "africa", "ng", "org"];

function text(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function handleFor(name: string) {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30);
}

function domainLabel(name: string) {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "").slice(0, 55);
}

function requestedTlds(value: unknown) {
  const candidates = text(value, 160).split(/[\s,]+/).map((item) => item.toLowerCase().replace(/^\./, "").replace(/[^a-z0-9-]/g, "")).filter(Boolean);
  return [...new Set([...COMMON_TLDS, ...candidates])].slice(0, 10);
}

async function checkDomain(domain: string): Promise<DomainSignal> {
  const url = `https://rdap.org/domain/${encodeURIComponent(domain)}`;
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { Accept: "application/rdap+json, application/json" },
      signal: AbortSignal.timeout(6500),
      cache: "no-store",
    });
    if (response.status === 404) return { domain, status: "available", evidence: "No registration was returned by RDAP. Confirm with a registrar before purchase.", url };
    if (response.ok) return { domain, status: "used", evidence: "A current registration record was returned by RDAP.", url };
    return { domain, status: "uncertain", evidence: `The registry could not confirm availability (HTTP ${response.status}).`, url };
  } catch {
    return { domain, status: "uncertain", evidence: "The registry check timed out or was unavailable.", url };
  }
}

const socialUrls = (handle: string) => [
  ["Instagram", `https://www.instagram.com/${handle}/`],
  ["Facebook", `https://www.facebook.com/${handle}`],
  ["X", `https://x.com/${handle}`],
  ["LinkedIn", `https://www.linkedin.com/company/${handle}`],
  ["TikTok", `https://www.tiktok.com/@${handle}`],
  ["YouTube", `https://www.youtube.com/@${handle}`],
  ["Threads", `https://www.threads.net/@${handle}`],
  ["Pinterest", `https://www.pinterest.com/${handle}/`],
  ["GitHub", `https://github.com/${handle}`],
] as const;

async function checkSocial(platform: string, url: string, handle: string): Promise<SocialSignal> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      headers: { "User-Agent": "CDS-Space-Brand-Name-Checker/1.0" },
      signal: AbortSignal.timeout(4500),
      cache: "no-store",
    });
    if (response.status === 404 || response.status === 410) {
      return { platform, handle: `@${handle}`, status: "available", evidence: "The public profile endpoint returned not found. Recheck inside the platform before claiming it.", url };
    }
    if ((response.status >= 200 && response.status < 400)) {
      return { platform, handle: `@${handle}`, status: "used", evidence: "The public profile endpoint responded or redirected, so the handle may already be in use.", url };
    }
    return { platform, handle: `@${handle}`, status: "uncertain", evidence: `The platform restricted the public check (HTTP ${response.status}).`, url };
  } catch {
    return { platform, handle: `@${handle}`, status: "uncertain", evidence: "The platform did not answer the public availability check.", url };
  }
}

function responseText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output as Array<Record<string, unknown>>) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const part of item.content as Array<Record<string, unknown>>) {
      if (part.type === "output_text" && typeof part.text === "string") return part.text;
    }
  }
  return "";
}

function webSources(payload: Record<string, unknown>) {
  const found = new Map<string, string>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const object = value as Record<string, unknown>;
    if (typeof object.url === "string" && /^https?:\/\//i.test(object.url)) {
      found.set(object.url, typeof object.title === "string" ? object.title : new URL(object.url).hostname);
    }
    Object.values(object).forEach(visit);
  };
  visit(payload.output);
  return [...found].slice(0, 20).map(([url, title]) => ({ title, url }));
}

async function searchCompanyAndBrand(name: string, industry: string, markets: string): Promise<SearchAnalysis> {
  const key = process.env.OPENAI_API_KEY || "";
  if (!key) return {};
  const model = process.env.OPENAI_SEARCH_MODEL || process.env.OPENAI_DEFAULT_MODEL || "gpt-4.1-mini";
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(35_000),
      body: JSON.stringify({
        model,
        store: false,
        tools: [{ type: "web_search_preview", search_context_size: "medium" }],
        tool_choice: "auto",
        include: ["web_search_call.action.sources"],
        instructions: "You are a careful global brand-clearance research assistant. Search current public sources. Never claim a name is legally available. Distinguish exact company-name matches from similar names. Do not invent registrations, jurisdictions, or URLs. Return JSON only.",
        input: `Research the proposed brand name "${name}" for the ${industry || "general business"} industry. Priority markets: ${markets || "global"}. Search company registries, corporate directories, business websites, app stores, and major social networks for exact or confusingly similar commercial use. Return a concise risk summary, company matches, risks, and six alternative names.`,
        text: {
          format: {
            type: "json_schema",
            name: "brand_name_research",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                summary: { type: "string" },
                companies: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      name: { type: "string" },
                      jurisdiction: { type: "string" },
                      status: { type: "string", enum: ["exact", "similar"] },
                      evidence: { type: "string" },
                      url: { type: "string" },
                    },
                    required: ["name", "jurisdiction", "status", "evidence", "url"],
                  },
                },
                risks: { type: "array", items: { type: "string" } },
                alternatives: { type: "array", items: { type: "string" } },
                sources: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: { title: { type: "string" }, url: { type: "string" } },
                    required: ["title", "url"],
                  },
                },
              },
              required: ["summary", "companies", "risks", "alternatives", "sources"],
            },
          },
        },
      }),
    });
    if (!response.ok) return {};
    const payload = await response.json() as Record<string, unknown>;
    const parsed = JSON.parse(responseText(payload) || "{}") as SearchAnalysis;
    const sources = [...(parsed.sources || []), ...webSources(payload)].filter((source) => source.url && /^https?:\/\//i.test(source.url));
    return { ...parsed, sources: [...new Map(sources.map((source) => [source.url!, source])).values()].slice(0, 20) };
  } catch {
    return {};
  }
}

function createDownloadText(result: {
  brandName: string;
  summary: string;
  domains: DomainSignal[];
  social: SocialSignal[];
  companies: CompanySignal[];
  risks: string[];
  alternatives: string[];
  sources: Array<{ title?: string; url?: string }>;
}) {
  const lines = [
    `${result.brandName} brand name availability report`,
    "",
    result.summary,
    "",
    "Domains",
    ...result.domains.map((item) => `${item.domain}: ${item.status}. ${item.evidence}`),
    "",
    "Social handles",
    ...result.social.map((item) => `${item.platform} ${item.handle}: ${item.status}. ${item.evidence}`),
    "",
    "Company and commercial-name matches",
    ...(result.companies.length ? result.companies.map((item) => `${item.name} (${item.jurisdiction}): ${item.status}. ${item.evidence}`) : ["No reliable public match was returned. This is not proof of legal availability."]),
    "",
    "Risks",
    ...result.risks.map((risk) => `- ${risk}`),
    "",
    "Alternative names",
    ...result.alternatives.map((name) => `- ${name}`),
    "",
    "Sources",
    ...result.sources.map((source) => `${source.title || "Source"}: ${source.url}`),
    "",
    "Important: This report is a preliminary public-source search, not a trademark opinion or reservation. Confirm social handles inside each platform, buy domains through a registrar, and complete formal trademark and company-registry clearance in every target jurisdiction.",
  ];
  return lines.join("\n");
}

export async function runLiveBrandNameCheck(input: Record<string, unknown>): Promise<EngineResult> {
  const brandName = text(input.brandName, 120);
  if (brandName.length < 2) throw new Error("Enter a brand name with at least two characters.");
  const industry = text(input.industry, 100);
  const markets = text(input.markets, 180);
  const handle = handleFor(brandName);
  const domainBase = domainLabel(brandName);
  if (!handle || !domainBase) throw new Error("Enter a brand name that contains letters or numbers.");

  const [domains, social, research] = await Promise.all([
    Promise.all(requestedTlds(input.domainExtensions).map((tld) => checkDomain(`${domainBase}.${tld}`))),
    Promise.all(socialUrls(handle).map(([platform, url]) => checkSocial(platform, url, handle))),
    searchCompanyAndBrand(brandName, industry, markets),
  ]);

  const companies = (research.companies || []).filter((item) => item.name && item.evidence).slice(0, 20);
  const usedCount = domains.filter((item) => item.status === "used").length + social.filter((item) => item.status === "used").length + companies.length;
  const overallStatus = usedCount > 0 ? "conflicts_found" : "needs_confirmation";
  const summary = research.summary || (usedCount > 0
    ? "Public signals show one or more existing uses. Review every match before adopting this name."
    : "No decisive conflict was returned, but registry, trademark, and in-platform confirmation are still required.");
  const risks = (research.risks || []).filter(Boolean).slice(0, 10);
  if (!risks.length) risks.push("Public availability checks can miss private registrations, unindexed companies, and pending trademark applications.");
  const alternatives = (research.alternatives || []).filter(Boolean).slice(0, 8);
  const sources = (research.sources || []).filter((source) => source.url).slice(0, 20);
  const report = { brandName, industry, markets: markets || "Global", checkedAt: new Date().toISOString(), overallStatus, summary, domains, social, companies, risks, alternatives, sources };
  const downloadText = createDownloadText(report);

  return {
    title: `Name check: ${brandName}`,
    fileName: `${domainBase}-brand-name-check.txt`,
    outputFormat: "TXT",
    fileSizeBytes: Buffer.byteLength(downloadText),
    costCents: process.env.OPENAI_API_KEY ? 2 : 0,
    output: {
      kind: "brand_name_report",
      ...report,
      text: downloadText,
      downloadText,
      mimeType: "text/plain",
      engine: process.env.OPENAI_API_KEY ? "openai-web-search" : "live-public-checks",
      disclaimer: "Preliminary research only. This is not legal clearance, a reservation, or a guarantee of availability.",
    },
  };
}
