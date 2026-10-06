import "server-only";

import { chatComplete } from "@/lib/ai/openai";
import {
  CDS_SENDER,
  CDS_VOICE,
  FIRST_EMAIL_PRINCIPLES,
  JARGON,
  MATERIALITY_RULE,
  WRITING_MODEL,
  cleanCopy,
  findBannedPhrases,
  friendlyCompanyName,
} from "@/lib/ai/cds-voice";

export { friendlyCompanyName };

/**
 * Writes the first email to a company we have never spoken to.
 *
 * The model is made to understand the company before it is allowed to say
 * anything about it: what the business is, who it serves, what its website
 * and channels are for, and which findings actually matter to that. Only then
 * does it write, and it writes a diagnosis rather than a pitch, ending on a
 * small question that is easy to say yes to.
 */

export type OutreachFinding = { title: string; detail?: string; severity?: string; area?: string; evidence?: string };

export interface OutreachCompany {
  company_name: string;
  website?: string | null;
  industry?: string | null;
  country?: string | null;
  brief?: string | null;
  employee_range?: string | null;
  is_public?: boolean | null;
  website_findings?: string[];
  pain_points?: string[];
  brand_findings?: string[];
}

export interface FirstEmail {
  subject: string;
  message: string;
  /** The reasoning behind the email, kept for the reader of the audit panel. */
  essence: string;
  observation: string;
  why_it_matters: string;
}

function wordCount(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function parse(text: string): Record<string, unknown> {
  try { return JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "")); } catch { return {}; }
}

/** The finished email: our greeting, the written body, our sign-off. */
export function composeFirstEmail(input: { displayName: string; body: string; sender?: { name: string; title: string } }) {
  const sender = input.sender || CDS_SENDER;
  // Strip any greeting or sign-off the model added despite being told not to.
  const body = cleanCopy(input.body)
    .replace(/^(?:hello|hi|dear|good (?:morning|afternoon|day))\b[^\n]*\n+/i, "")
    .replace(/\n+(?:best regards|kind regards|regards|warm regards|best|sincerely|thank you|thanks)[\s,]*\n[\s\S]*$/i, "")
    .trim();
  return `Hello ${input.displayName} team,\n\n${body}\n\nBest regards,\n${sender.name}\n${sender.title}`;
}

export async function writeFirstEmail(input: {
  company: OutreachCompany;
  findings?: OutreachFinding[];
  strengths?: string[];
  sender?: { name: string; title: string };
}): Promise<FirstEmail> {
  const company = input.company;
  const displayName = friendlyCompanyName(company.company_name);
  const sender = input.sender || CDS_SENDER;

  const evidence = [
    `Company: ${displayName} (registered as ${company.company_name})`,
    company.website ? `Website: ${company.website}` : "Website: none found",
    company.industry ? `Industry: ${company.industry}` : "",
    company.country ? `Country: ${company.country}` : "",
    company.employee_range ? `Size: ${company.employee_range}` : "",
    company.is_public ? "Publicly listed company." : "",
    company.brief ? `What we know about them: ${company.brief.slice(0, 1500)}` : "",
    input.findings?.length
      ? `Findings observed on their properties:\n${input.findings.slice(0, 12).map((finding, index) => `${index + 1}. ${finding.title}${finding.detail ? `: ${finding.detail}` : ""}${finding.evidence ? ` (seen at ${finding.evidence})` : ""}`).join("\n")}`
      : "",
    company.website_findings?.length ? `Website review notes:\n- ${company.website_findings.slice(0, 8).join("\n- ")}` : "",
    company.brand_findings?.length ? `Brand consistency notes:\n- ${company.brand_findings.slice(0, 6).join("\n- ")}` : "",
    input.strengths?.length ? `What they already do well:\n- ${input.strengths.slice(0, 6).join("\n- ")}` : "",
  ].filter(Boolean).join("\n");

  const system = [
    CDS_VOICE,
    MATERIALITY_RULE,
    FIRST_EMAIL_PRINCIPLES,
    `You are writing as ${sender.name}, ${sender.title}, in the first person singular.`,
    "Everything you say about the company must come from the supplied evidence. Never invent a statistic, a client, a result, or a finding.",
    "Write the body only: no greeting line and no sign-off. They are added for you.",
    "Work in this order and return every field:",
    "essence: two sentences on what the company is, who it serves, and what makes it distinctive.",
    "purpose: what its website and channels need to achieve for a business like this.",
    "material_findings: the findings that genuinely affect that purpose, each in a few words. Leave out the rest.",
    "observation: the single most useful observation, phrased as an opportunity.",
    "why_it_matters: one sentence linking it to their purpose.",
    "subject and body: the email itself.",
    'Return only JSON: {"essence":"","purpose":"","material_findings":[],"observation":"","why_it_matters":"","subject":"","body":""}',
  ].join("\n");

  const ask = async (extra?: string) => {
    const { text } = await chatComplete([
      { role: "system", content: system },
      { role: "user", content: evidence },
      ...(extra ? [{ role: "user" as const, content: extra }] : []),
    ], { model: WRITING_MODEL, temperature: 0.55, max_tokens: 1100, response_format: { type: "json_object" } });
    return parse(text);
  };

  let draft = await ask();
  const problems = (candidate: Record<string, unknown>) => {
    const body = String(candidate.body || "");
    const issues: string[] = [];
    const banned = findBannedPhrases(`${candidate.subject || ""}\n${body}`);
    if (banned.length) issues.push(`It uses phrases that read as a template: ${banned.join(", ")}. Say the same thing in your own words.`);
    const words = wordCount(body);
    if (words < 80 || words > 160) issues.push(`The body is ${words} words; keep it between 90 and 150.`);
    if (/\b(call|meeting|schedule|calendar)\b/i.test(body)) issues.push("It asks for a call or meeting. End instead on a small permission question, such as whether it would be useful if you sent the observations.");
    if (String(candidate.subject || "").length > 60) issues.push("The subject is longer than 60 characters.");
    const jargon = `${candidate.subject || ""} ${body}`.match(JARGON);
    if (jargon) issues.push(`It mentions "${jargon[0]}", which is technical language. Describe only what a visitor sees or experiences, or choose a different observation.`);
    return issues;
  };

  // Up to two corrections: a rewrite can fix one problem and bring back another.
  for (let round = 0; round < 2; round += 1) {
    const issues = problems(draft);
    if (!issues.length) break;
    const revised = await ask(`Revise the email. ${issues.join(" ")} Keep everything else that works. Return the full JSON again.`);
    if (String(revised.body || "").trim()) draft = revised;
  }

  const body = String(draft.body || "").trim();
  if (!body) throw new Error("The email could not be written. Try again.");
  return {
    subject: cleanCopy(String(draft.subject || `A few observations on ${displayName}`)).slice(0, 120),
    message: composeFirstEmail({ displayName, body, sender }),
    essence: cleanCopy(String(draft.essence || "")),
    observation: cleanCopy(String(draft.observation || "")),
    why_it_matters: cleanCopy(String(draft.why_it_matters || "")),
  };
}
