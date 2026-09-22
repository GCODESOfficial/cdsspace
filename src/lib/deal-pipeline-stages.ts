/**
 * The pipeline vocabulary, with no server imports, so the admin page can read
 * the same stage list the server derives from without pulling `pg` into the
 * browser bundle. The deriving logic lives in `deal-pipeline.ts`.
 */
export const PIPELINE_STAGES = [
  { key: "shortlisted", label: "Shortlisted", hint: "On the checklist, not yet contacted" },
  { key: "contacted", label: "Emailed", hint: "First outreach has gone out" },
  { key: "audit_shared", label: "Audit shared", hint: "A brand audit link is with them" },
  { key: "proposal_sent", label: "Proposal sent", hint: "The deck is with them" },
  { key: "proposal_viewed", label: "Proposal opened", hint: "They have read it" },
  { key: "meeting_scheduled", label: "Meeting booked", hint: "A consultation is in the diary" },
  { key: "invoice_sent", label: "Invoice sent", hint: "Billed, waiting on payment" },
  { key: "paid", label: "Paid", hint: "Money received" },
  { key: "project_started", label: "Project running", hint: "Work is under way" },
  { key: "project_completed", label: "Project delivered", hint: "Closed out" },
] as const;

export type PipelineStage = typeof PIPELINE_STAGES[number]["key"] | "lost";

export type PipelineEvent = {
  stage: PipelineStage | null;
  event_type: string;
  detail: string;
  source: string;
  occurred_at: string;
};

export type PipelineProspect = {
  id: string;
  display_name: string;
  company_name: string | null;
  email: string | null;
  website: string | null;
  category: string;
  status: string;
  next_action: string | null;
  follow_up_at: string | null;
  updated_at: string;
  stage: PipelineStage;
  stage_reached_at: string | null;
  /** Every stage proved so far, so a row can show progress rather than one dot. */
  reached: PipelineStage[];
  last_touch_at: string | null;
  /** Days since anything at all happened. Drives the "gone quiet" warning. */
  idle_days: number | null;
  /** The exact prospect-generation record this checklist entry came from. */
  company_id: string | null;
  proposal_id: string | null;
  audit_id: string | null;
  events: PipelineEvent[];
};
