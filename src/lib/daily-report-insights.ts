import "server-only";

import type { AuditReportPayload } from "@/lib/audit-report";
import type { MetricResult } from "@/lib/daily-report";

/**
 * The reading of the day, not just the counting of it.
 *
 * The figures alone do not tell anyone what to do on Monday morning, so this
 * turns them into three plain lists: what went well and who earned the credit,
 * what needs attention and the specific action to take, and the one-line
 * verdict at the top. Every line is derived from a figure in the report - there
 * is no advice here that the numbers do not support.
 */

export type Insight = {
  /** What to do about it, in one sentence. */
  action: string;
  headline: string;
  /** The figure this was read from, so nobody has to take it on trust. */
  evidence: string;
};

export type DailyInsights = {
  verdict: string;
  /** A one-line summary of the day's shape, for the subject line and preheader. */
  summary: string;
  wins: Insight[];
  concerns: Insight[];
  /** Named people worth thanking, most active first. */
  recognise: Array<{ name: string; role: string; events: number; note: string }>;
};

const number = (value: number) => Math.round(value).toLocaleString();

function pct(today: number, yesterday: number): number | null {
  if (yesterday === 0) return today > 0 ? 100 : null;
  return Math.round(((today - yesterday) / yesterday) * 100);
}

function metric(metrics: MetricResult[], key: string) {
  return metrics.find((entry) => entry.key === key);
}

/**
 * Reads today's audit figures against yesterday's and the day's metric rows.
 * `previous` may be null on the first day a deployment has data.
 */
export function buildDailyInsights(input: {
  today: AuditReportPayload;
  previous: AuditReportPayload | null;
  metrics: MetricResult[];
}): DailyInsights {
  const { today, previous, metrics } = input;
  const wins: Insight[] = [];
  const concerns: Insight[] = [];

  const stats = today.stats;
  const before = previous?.stats;
  const change = (key: keyof typeof stats) => before ? pct(stats[key], before[key]) : null;

  /* ----------------------------------------------------------- commercial */

  const consultations = metric(metrics, "consultations");
  const invoiceValue = metric(metrics, "invoice_value");
  const receipts = metric(metrics, "receipts");
  const signups = metric(metrics, "signups");

  if (stats.invoices > 0) {
    wins.push({
      headline: `${number(stats.invoices)} invoice${stats.invoices === 1 ? "" : "s"} raised`,
      evidence: invoiceValue ? `Invoice value ${number(invoiceValue.today)}` : `${number(stats.invoices)} today`,
      action: "Confirm each one has actually been sent to the client, not left sitting as a draft.",
    });
  } else {
    concerns.push({
      headline: "No invoices were raised today",
      evidence: "Invoices created: 0",
      action: "Check whether any completed work is waiting to be billed. Unbilled delivered work is the most common cash leak.",
    });
  }

  if (receipts && receipts.today === 0 && invoiceValue && invoiceValue.today > 0) {
    concerns.push({
      headline: "Money went out on paper but none came in",
      evidence: `Invoices ${number(invoiceValue.today)} raised, payments received 0`,
      action: "Run the overdue list and chase the oldest unpaid invoice first.",
    });
  }
  if (receipts && receipts.today > 0) {
    wins.push({
      headline: `Payments received: ${number(receipts.today)}`,
      evidence: `Against ${number(receipts.yesterday)} the day before`,
      action: "Reconcile these against open invoices so the ledger closes cleanly.",
    });
  }

  if (consultations && consultations.today > 0) {
    wins.push({
      headline: `${number(consultations.today)} consultation request${consultations.today === 1 ? "" : "s"}`,
      evidence: `Consultation requests today: ${number(consultations.today)}`,
      action: "Every one needs a reply and a confirmed slot today; a booking that goes quiet for 24 hours usually goes cold.",
    });
  }

  if (signups && signups.today > 0) {
    wins.push({
      headline: `${number(signups.today)} new client account${signups.today === 1 ? "" : "s"}`,
      evidence: `New sign-ups: ${number(signups.today)}`,
      action: "Check the welcome message actually went out and the account has a brand brief started.",
    });
  }

  /* ------------------------------------------------------------ responsiveness */

  if (stats.messages > 0 && stats.conversations > 0) {
    const perConversation = stats.messages / stats.conversations;
    if (perConversation < 2) {
      concerns.push({
        headline: "Conversations are getting one message and no more",
        evidence: `${number(stats.messages)} messages across ${number(stats.conversations)} conversations`,
        action: "Open Sales Hub chat and check nothing is sitting unanswered overnight.",
      });
    } else {
      wins.push({
        headline: "Conversations are two-way",
        evidence: `${number(stats.messages)} messages across ${number(stats.conversations)} conversations`,
        action: "Keep it up; note any thread still open at close of business.",
      });
    }
  } else if (stats.conversations === 0) {
    concerns.push({
      headline: "No client conversations at all today",
      evidence: "Conversations: 0",
      action: "If this repeats, the enquiry routes are worth testing end to end - a broken form is silent by nature.",
    });
  }

  /* --------------------------------------------------------------- delivery */

  const worksChange = change("works");
  if (stats.works > 0) {
    wins.push({
      headline: `${number(stats.works)} work item${stats.works === 1 ? "" : "s"} moved`,
      evidence: worksChange === null ? `${number(stats.works)} today` : `${worksChange >= 0 ? "+" : ""}${worksChange}% on yesterday`,
      action: "Confirm each is assigned and has a delivery date the client has been told about.",
    });
  } else {
    concerns.push({
      headline: "No works, designs or requests moved today",
      evidence: "Works & requests: 0",
      action: "Check the taskboard for blocked items. A day with no delivery output is either a quiet day or a stuck one, and the difference matters.",
    });
  }

  /* ------------------------------------------------------------- attendance */

  const checkins = metric(metrics, "checkins");
  if (checkins && checkins.today === 0 && stats.activeActors > 0) {
    concerns.push({
      headline: "People worked but nobody checked in",
      evidence: `${number(stats.activeActors)} active on the platform, 0 attendance check-ins`,
      action: "Attendance is not being recorded. Remind the team, or check the biometric device is online.",
    });
  }

  if (stats.activeActors === 0) {
    concerns.push({
      headline: "No recorded activity from anyone today",
      evidence: "Active actors: 0",
      action: "If this is not a holiday, something is wrong with logging rather than with the team.",
    });
  }

  /* ------------------------------------------------------------ recognition */

  const recognise = today.actors
    .filter((actor) => actor.events > 0)
    .slice(0, 5)
    .map((actor, index) => ({
      name: actor.name,
      role: actor.isAdmin ? "Admin" : actor.kind === "team" ? "Team" : "System",
      events: actor.events,
      note: index === 0
        ? "Most active on the platform today - worth acknowledging by name."
        : "Consistent contribution worth noting.",
    }));

  /* --------------------------------------------------------------- verdict */

  const trackedChange = change("totalTrackedEvents");
  const direction = trackedChange === null
    ? "with no previous day to compare against"
    : trackedChange >= 15 ? `up ${trackedChange}% on yesterday`
    : trackedChange <= -15 ? `down ${Math.abs(trackedChange)}% on yesterday`
    : "roughly level with yesterday";

  const verdict = concerns.length === 0
    ? `A clean day: ${number(stats.totalTrackedEvents)} tracked events, ${direction}, with nothing needing attention.`
    : concerns.length <= 2
      ? `A working day: ${number(stats.totalTrackedEvents)} tracked events, ${direction}. ${concerns.length} thing${concerns.length === 1 ? "" : "s"} to pick up tomorrow.`
      : `Needs attention: ${number(stats.totalTrackedEvents)} tracked events, ${direction}, and ${concerns.length} issues worth acting on.`;

  const summary = `${number(stats.totalTrackedEvents)} events, ${number(stats.logins)} logins, ${number(stats.messages)} messages, ${number(stats.works)} works, ${number(stats.invoices)} invoices`;

  return { verdict, summary, wins, concerns, recognise };
}
