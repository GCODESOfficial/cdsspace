/**
 * Which automatic notification emails are allowed to go out.
 *
 * Inboxes were crowded with a mail for every chat message, cMeet call and
 * task update. Bell notifications now reach people through push and the
 * in-app bell only, except invoices, which are still emailed.
 *
 * Emails sent directly with sendEmail (sign-in codes, invoices, desk alerts,
 * leave decisions, reports) are not affected by this policy.
 */
export function isEmailableNotificationKind(kind: string | null | undefined) {
  return /invoice/i.test(String(kind || ""));
}
