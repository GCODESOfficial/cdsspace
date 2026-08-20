import "server-only";

import { chatComplete } from "@/lib/ai/openai";
import { CDS_SERVICE_LINES } from "@/lib/sales-growth-shared";

export interface CompanyIntelligence {
  company_summary: string;
  positioning: string;
  services: string[];
  markets: string[];
  differentiators: string[];
  research_note: string;
}

export interface CampaignPlan {
  name: string;
  service_niche: string;
  audience: string;
  geography: string;
  pain_points: string[];
  value_proposition: string;
  opening_hook: string;
}

export interface OutreachPack {
  subject: string;
  body_text: string;
  follow_up_subject: string;
  follow_up_text: string;
  hook: { eyebrow: string; headline: string; subline: string; cta: string };
  proposal: {
    title: string;
    executive_line: string;
    problem: string;
    solution: string;
    deliverables: string[];
    process: string[];
    timeline: string;
    investment: string;
    call_to_action: string;
  };
}

function cleanArray(value: unknown, max = 8) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, max) : [];
}

function jsonObject(text: string): Record<string, unknown> {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("AI returned an invalid object.");
  return parsed as Record<string, unknown>;
}

function canUseAi() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function buildCompanyIntelligence(input: {
  companyName: string;
  domain: string;
  headquarters: string;
  services: string[];
  markets: string[];
  siteText: string;
}): Promise<CompanyIntelligence> {
  const fallback: CompanyIntelligence = {
    company_summary: `${input.companyName} is a brand infrastructure partner combining strategy, design, digital products, and physical brand experiences in one coordinated practice.`,
    positioning: "A structured creative company for ambitious organisations that need strategy and shipped output without the handoff loss of a fragmented agency stack.",
    services: input.services.length ? input.services : [...CDS_SERVICE_LINES],
    markets: input.markets.length ? input.markets : [input.headquarters || "Global"],
    differentiators: ["Strategy and execution under one roof", "Africa-rooted and globally aimed", "Fast delivery with independent strategy and craft review"],
    research_note: "Built from the supplied company profile and public website. Review before campaign launch.",
  };
  if (!canUseAi()) return fallback;

  const system = [
    "You are the market-intelligence lead for CDS Space Branding Agency.",
    "Return strict JSON with company_summary, positioning, services[], markets[], differentiators[], research_note.",
    "Use only the supplied public website evidence and operator inputs. Do not invent customers, results, awards, locations, prices, or statistics.",
    "The voice is direct, intelligent, concise, globally ambitious, and commercially useful. Avoid generic agency language.",
    "If evidence is incomplete, say so in research_note.",
  ].join("\n");
  const user = JSON.stringify({ ...input, siteText: input.siteText.slice(0, 18_000) });
  try {
    const { text } = await chatComplete(
      [{ role: "system", content: system }, { role: "user", content: user }],
      { response_format: { type: "json_object" }, temperature: 0.35, max_tokens: 1300 },
    );
    const data = jsonObject(text);
    return {
      company_summary: String(data.company_summary || fallback.company_summary).trim(),
      positioning: String(data.positioning || fallback.positioning).trim(),
      services: cleanArray(data.services, 12).length ? cleanArray(data.services, 12) : fallback.services,
      markets: cleanArray(data.markets, 12).length ? cleanArray(data.markets, 12) : fallback.markets,
      differentiators: cleanArray(data.differentiators, 8).length ? cleanArray(data.differentiators, 8) : fallback.differentiators,
      research_note: String(data.research_note || fallback.research_note).trim(),
    };
  } catch {
    return fallback;
  }
}

function fallbackCampaigns(services: string[], markets: string[]): CampaignPlan[] {
  const geography = markets.join(", ") || "Global growth markets";
  const available = new Set(services.map((service) => service.toLowerCase()));
  const plans: CampaignPlan[] = [
    {
      name: "Category Reset",
      service_niche: "Brand strategy and identity",
      audience: "Scaling companies whose market perception has fallen behind the quality of their offer",
      geography,
      pain_points: ["The company has outgrown its identity", "Sales material tells different stories", "A new market or funding moment is approaching"],
      value_proposition: "Build one recognisable brand system that makes the company easier to trust, sell, and scale.",
      opening_hook: "Your business has moved. Has the brand caught up?",
    },
    {
      name: "Digital Trust Gap",
      service_niche: "Web and digital products",
      audience: "Established service and technology businesses with credible operations but an underperforming digital front door",
      geography,
      pain_points: ["Website undersells capability", "Leads cannot understand the offer quickly", "Product and brand experience feel disconnected"],
      value_proposition: "Turn the website into a clear, conversion-ready expression of the business, not a digital brochure.",
      opening_hook: "The first sales meeting is already happening on your website.",
    },
    {
      name: "Physical Brand Pressure",
      service_niche: "Print, packaging and environmental branding",
      audience: "Retail, hospitality, events, education, and industrial brands with high-volume physical touchpoints",
      geography,
      pain_points: ["Production assets drift off-brand", "Campaign rollouts are fragmented", "Physical environments do not match digital quality"],
      value_proposition: "Unify design and production so every physical touchpoint behaves like the same brand.",
      opening_hook: "If the brand only works on screen, it is not finished.",
    },
    {
      name: "Always-On Brand Desk",
      service_niche: "Embedded brand support retainer",
      audience: "Lean marketing teams that need senior creative output without building a full internal studio",
      geography,
      pain_points: ["Campaign requests queue for weeks", "Freelancer handoffs dilute consistency", "The internal team is buried in production"],
      value_proposition: "Add a coordinated strategy, design, and delivery team that moves at the speed of the business.",
      opening_hook: "Not another agency. The brand team your roadmap is missing.",
    },
  ];
  if (!services.length) return plans;
  return plans.filter((plan) => {
    const words = plan.service_niche.toLowerCase().split(/\W+/).filter((word) => word.length > 4);
    return words.some((word) => Array.from(available).some((service) => service.includes(word)));
  }).concat(plans).slice(0, 6);
}

export async function buildCampaignPlans(input: {
  companyName: string;
  companySummary: string;
  positioning: string;
  services: string[];
  markets: string[];
  competitorContext: string;
}): Promise<CampaignPlan[]> {
  const fallback = fallbackCampaigns(input.services, input.markets);
  if (!canUseAi()) return fallback;
  const system = [
    "You are the GTM strategist for CDS Space. Build exactly six sharp outbound campaign theses across different service niches.",
    "Return strict JSON: { campaigns: [{name, service_niche, audience, geography, pain_points: string[], value_proposition, opening_hook}] }.",
    "Each campaign must target a recognisable buying moment, not a vague industry. Use the supplied competitor context only as strategic contrast.",
    "Opening hooks must be short, specific, and nonconventional without being gimmicky. No invented proof or claims.",
  ].join("\n");
  try {
    const { text } = await chatComplete(
      [{ role: "system", content: system }, { role: "user", content: JSON.stringify(input).slice(0, 18_000) }],
      { response_format: { type: "json_object" }, temperature: 0.65, max_tokens: 2200 },
    );
    const data = jsonObject(text);
    const campaigns = Array.isArray(data.campaigns) ? data.campaigns : [];
    const cleaned = campaigns.map((entry) => {
      const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      return {
        name: String(item.name || "").trim(),
        service_niche: String(item.service_niche || "").trim(),
        audience: String(item.audience || "").trim(),
        geography: String(item.geography || input.markets.join(", ")).trim(),
        pain_points: cleanArray(item.pain_points, 5),
        value_proposition: String(item.value_proposition || "").trim(),
        opening_hook: String(item.opening_hook || "").trim(),
      };
    }).filter((entry) => entry.name && entry.service_niche && entry.audience && entry.value_proposition);
    return cleaned.length ? cleaned.slice(0, 6) : fallback;
  } catch {
    return fallback;
  }
}

export async function buildOutreachPack(input: {
  companyName: string;
  positioning: string;
  campaignName: string;
  serviceNiche: string;
  valueProposition: string;
  prospectCompany: string;
  prospectDescription: string;
  prospectEvidence: string;
  contactName: string;
  contactTitle: string;
}): Promise<OutreachPack> {
  const firstName = input.contactName.split(/\s+/)[0] || "there";
  const observed = input.prospectEvidence || input.prospectDescription || `${input.prospectCompany} is operating in a market where clarity and trust compound.`;
  const fallback: OutreachPack = {
    subject: `${input.prospectCompany}: one sharp brand question`,
    body_text: `Hi ${firstName},\n\nI spent a little time with ${input.prospectCompany}. ${observed.slice(0, 240)}\n\nThe opportunity I see is not “more design.” It is a clearer system between what the business has become and what the market sees.\n\nCDS Space combines strategy, brand, digital, and physical execution in one team. For ${input.prospectCompany}, we would start with a focused diagnostic and show the three changes most likely to improve recognition and commercial trust.\n\nWould a 20-minute working session next week be useful?\n\nBest,\nCDS Space`,
    follow_up_subject: `A practical idea for ${input.prospectCompany}`,
    follow_up_text: `Hi ${firstName},\n\nOne concrete thought to make the earlier note useful: turn the strongest business advantage at ${input.prospectCompany} into one repeatable message and make every major touchpoint prove it.\n\nIf helpful, we can map that on one page before any project conversation.\n\nBest,\nCDS Space`,
    hook: {
      eyebrow: input.serviceNiche.toUpperCase().slice(0, 44),
      headline: "The business moved. The brand should move with it.",
      subline: `A focused growth direction for ${input.prospectCompany}.`,
      cta: "See the three moves",
    },
    proposal: {
      title: `${input.prospectCompany} Brand Growth Direction`,
      executive_line: "Build the brand infrastructure required for the next stage of the business.",
      problem: `${input.prospectCompany} has an opportunity to make its market-facing experience as strong and coherent as the business behind it. The current gap is not simply visual; it is the distance between offer, perception, and conversion.`,
      solution: `${input.valueProposition} CDS Space will connect research, strategy, design, and implementation in one accountable team.`,
      deliverables: ["Focused market and competitor scan", "Positioning and message direction", input.serviceNiche, "Implementation-ready system and handover"],
      process: ["Research", "Strategy", "System", "Execution", "Documentation"],
      timeline: "A focused first phase can be scoped and quoted within 48 hours of a working session.",
      investment: "Final investment is scoped to the agreed outcomes, markets, and delivery depth.",
      call_to_action: "Book a 20-minute working session to choose the highest-leverage starting point.",
    },
  };
  if (!canUseAi()) return fallback;

  const system = [
    "You are CDS Space's senior growth strategist and proposal writer.",
    "Return strict JSON matching {subject, body_text, follow_up_subject, follow_up_text, hook:{eyebrow,headline,subline,cta}, proposal:{title,executive_line,problem,solution,deliverables[],process[],timeline,investment,call_to_action}}.",
    "Write a deeply personalised, concise email from source-backed evidence. Never invent results, relationships, budgets, urgency, or private facts.",
    "Do not flatter. Do not say 'I hope this email finds you well'. Do not use hype, em dashes, or fake familiarity. The ask is one low-friction working session.",
    "CDS Space voice: clear, intelligent, useful, commercially brave, Africa-rooted and globally aimed. Permanently abnormal means the idea is distinctive, not loud.",
    "Proposal content must be simple, unique, brief, and structured as problem, solution, deliverables, five-stage process, timeline, investment framing, and next step.",
  ].join("\n");
  try {
    const { text } = await chatComplete(
      [{ role: "system", content: system }, { role: "user", content: JSON.stringify(input).slice(0, 16_000) }],
      { response_format: { type: "json_object" }, temperature: 0.55, max_tokens: 2400 },
    );
    const data = jsonObject(text);
    const hook = data.hook && typeof data.hook === "object" ? data.hook as Record<string, unknown> : {};
    const proposal = data.proposal && typeof data.proposal === "object" ? data.proposal as Record<string, unknown> : {};
    return {
      subject: String(data.subject || fallback.subject).trim(),
      body_text: String(data.body_text || fallback.body_text).trim(),
      follow_up_subject: String(data.follow_up_subject || fallback.follow_up_subject).trim(),
      follow_up_text: String(data.follow_up_text || fallback.follow_up_text).trim(),
      hook: {
        eyebrow: String(hook.eyebrow || fallback.hook.eyebrow).trim(),
        headline: String(hook.headline || fallback.hook.headline).trim(),
        subline: String(hook.subline || fallback.hook.subline).trim(),
        cta: String(hook.cta || fallback.hook.cta).trim(),
      },
      proposal: {
        title: String(proposal.title || fallback.proposal.title).trim(),
        executive_line: String(proposal.executive_line || fallback.proposal.executive_line).trim(),
        problem: String(proposal.problem || fallback.proposal.problem).trim(),
        solution: String(proposal.solution || fallback.proposal.solution).trim(),
        deliverables: cleanArray(proposal.deliverables, 8).length ? cleanArray(proposal.deliverables, 8) : fallback.proposal.deliverables,
        process: cleanArray(proposal.process, 6).length ? cleanArray(proposal.process, 6) : fallback.proposal.process,
        timeline: String(proposal.timeline || fallback.proposal.timeline).trim(),
        investment: String(proposal.investment || fallback.proposal.investment).trim(),
        call_to_action: String(proposal.call_to_action || fallback.proposal.call_to_action).trim(),
      },
    };
  } catch {
    return fallback;
  }
}
