/**
 * The admin-only deal tag that sits on a client conversation.
 *
 * Sales Hub chat and the Deals workspace hold the same people under different
 * roofs: a prospect on the checklist, a proposal in the funnel, and a person
 * writing into chat are matched on email. This turns that match into one short
 * badge so whoever answers the message knows they are talking to a live deal
 * before they type. It is never sent to the client; only admin surfaces read it.
 */
import { glashQuery } from "@/lib/glashdb/postgres";

export type DealClientTag = {
  label: string;
  tone: "hot" | "warm" | "cool" | "won" | "lost";
  detail: string;
  prospect_id: string | null;
  proposal_id: string | null;
  stage: string | null;
};

/** A proposal in the funnel outranks a checklist entry, and a later stage outranks an earlier one. */
const STAGE_RANK: Record<string, number> = {
  won: 90, negotiation: 80, viewed: 70, sent: 60, ready: 50, draft: 40, lost: 10, archived: 0,
};
const STAGE_TAG: Record<string, { label: string; tone: DealClientTag["tone"] }> = {
  won: { label: "Won", tone: "won" },
  negotiation: { label: "In negotiation", tone: "hot" },
  viewed: { label: "Proposal viewed", tone: "hot" },
  sent: { label: "Proposal sent", tone: "warm" },
  ready: { label: "Proposal ready", tone: "warm" },
  draft: { label: "Proposal drafting", tone: "cool" },
  lost: { label: "Lost", tone: "lost" },
};

/** A prospect nobody has written a proposal for yet is still worth flagging. */
const PROSPECT_TAG: Record<string, { label: string; tone: DealClientTag["tone"] }> = {
  follow_up: { label: "High prospect", tone: "hot" },
  contacted: { label: "High prospect", tone: "warm" },
  ready: { label: "Prospect", tone: "warm" },
  to_research: { label: "Prospect", tone: "cool" },
  converted: { label: "Converted prospect", tone: "won" },
};

function normalise(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

/**
 * Tags for a batch of client emails, keyed by the lowercased email. Written as
 * one query per table rather than one per room so a busy inbox stays two reads.
 */
export async function dealTagsForEmails(emails: Array<string | null | undefined>): Promise<Map<string, DealClientTag>> {
  const wanted = Array.from(new Set(emails.map(normalise).filter(Boolean)));
  const tags = new Map<string, DealClientTag>();
  if (!wanted.length) return tags;

  const [proposals, prospects] = await Promise.all([
    glashQuery<{ id: string; prospect_id: string | null; recipient_email: string; stage: string; brand_name: string; title: string; last_sent_at: string | null }>(
      `select id, prospect_id, lower(recipient_email) recipient_email, stage, brand_name, title, last_sent_at
         from public.deal_proposals
        where lower(recipient_email) = any($1::text[])`,
      [wanted],
    ),
    glashQuery<{ id: string; email: string; display_name: string; company_name: string | null; status: string; category: string }>(
      `select id, lower(email) email, display_name, company_name, status, category
         from public.deal_prospects
        where lower(email) = any($1::text[])`,
      [wanted],
    ),
  ]);

  for (const prospect of prospects) {
    const shape = PROSPECT_TAG[prospect.status];
    if (!shape || prospect.status === "not_relevant") continue;
    const current = tags.get(prospect.email);
    if (current && current.stage) continue;
    tags.set(prospect.email, {
      ...shape,
      detail: `On the prospect checklist as ${prospect.company_name || prospect.display_name}`,
      prospect_id: prospect.id,
      proposal_id: null,
      stage: null,
    });
  }

  const best = new Map<string, typeof proposals[number]>();
  for (const proposal of proposals) {
    const rank = STAGE_RANK[proposal.stage] ?? 0;
    const held = best.get(proposal.recipient_email);
    if (!held || (STAGE_RANK[held.stage] ?? 0) < rank) best.set(proposal.recipient_email, proposal);
  }
  for (const [email, proposal] of best) {
    const shape = STAGE_TAG[proposal.stage];
    if (!shape) continue;
    tags.set(email, {
      ...shape,
      detail: `${proposal.brand_name}: ${proposal.title}`,
      prospect_id: proposal.prospect_id,
      proposal_id: proposal.id,
      stage: proposal.stage,
    });
  }

  return tags;
}
