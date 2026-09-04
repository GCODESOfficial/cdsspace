/**
 * The issues the directory looks for.
 *
 * These five are what CDS Space sells against, so they are what research
 * records and what the list filters on. They are stored as a text[] on the
 * company row rather than being derived from the findings prose at read time,
 * so a filter over millions of rows stays an index lookup.
 *
 * No server imports: the admin page renders the same labels it filters by.
 */

export const PROSPECT_ISSUES = [
  {
    key: "outdated_website",
    label: "Outdated website",
    blurb: "Stale copyright, end-of-life libraries, or markup that has not been touched in years.",
  },
  {
    key: "poor_branding",
    label: "Poor branding",
    blurb: "No readable logo on the site, a missing profile image, or no social presence to brand at all.",
  },
  {
    key: "inconsistent_communications",
    label: "Inconsistent brand communications",
    blurb: "The logo or the company name differs between the website and the social accounts.",
  },
  {
    key: "non_responsive_website",
    label: "Non-responsive website",
    blurb: "No responsive viewport, so the site does not adapt to a phone screen.",
  },
  {
    key: "poorly_designed_website",
    label: "Poorly designed website",
    blurb: "Table layouts, deprecated elements, or a low overall build quality score.",
  },
] as const;

export type ProspectIssue = (typeof PROSPECT_ISSUES)[number]["key"];

const ISSUE_KEYS = new Set<string>(PROSPECT_ISSUES.map((issue) => issue.key));

export function isProspectIssue(value: unknown): value is ProspectIssue {
  return typeof value === "string" && ISSUE_KEYS.has(value);
}

export function issueLabel(key: string): string {
  return PROSPECT_ISSUES.find((issue) => issue.key === key)?.label || key;
}

/**
 * Structured signals read off the homepage. Kept separate from the findings
 * prose so the issue rules never depend on how a sentence is worded.
 */
export interface WebsiteSignals {
  noViewport: boolean;
  tableLayout: boolean;
  deprecatedElements: boolean;
  presentationalAttributes: boolean;
  endOfLifeLibraries: boolean;
  flash: boolean;
  noDoctype: boolean;
  staleCopyrightYears: number;
  imagesNotResponsive: boolean;
}

export const EMPTY_WEBSITE_SIGNALS: WebsiteSignals = {
  noViewport: false,
  tableLayout: false,
  deprecatedElements: false,
  presentationalAttributes: false,
  endOfLifeLibraries: false,
  flash: false,
  noDoctype: false,
  staleCopyrightYears: 0,
  imagesNotResponsive: false,
};

/**
 * Which of the five issues this company has. Only positive evidence counts: a
 * site that could not be read produces no website issues rather than being
 * assumed bad, because the list is used to start sales conversations.
 */
export function detectProspectIssues(input: {
  websiteStatus: string;
  websiteScore: number | null;
  reachable: boolean;
  signals: WebsiteSignals;
  brandFindings: Array<{ area: string; status: string }>;
  socialCount: number;
}): ProspectIssue[] {
  const issues = new Set<ProspectIssue>();
  const score = typeof input.websiteScore === "number" ? input.websiteScore : null;

  if (input.reachable) {
    if (
      input.websiteStatus === "outdated"
      || input.signals.staleCopyrightYears >= 2
      || input.signals.endOfLifeLibraries
      || input.signals.flash
    ) issues.add("outdated_website");

    if (input.signals.noViewport) issues.add("non_responsive_website");

    if (
      input.signals.tableLayout
      || input.signals.deprecatedElements
      || input.signals.presentationalAttributes
      || (score !== null && score < 55)
    ) issues.add("poorly_designed_website");
  }

  // Brand marks. A profile the platform would not let us read is "unchecked"
  // and never counts against the company.
  const missingBrandAsset = input.brandFindings.some((finding) => (
    finding.status === "missing"
    && /brand image|logo|profile|social presence/i.test(finding.area)
  ));
  if (missingBrandAsset || input.socialCount === 0) issues.add("poor_branding");

  if (input.brandFindings.some((finding) => finding.status === "differs")) {
    issues.add("inconsistent_communications");
  }

  return PROSPECT_ISSUES.map((issue) => issue.key).filter((key) => issues.has(key));
}
