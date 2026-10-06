/**
 * End-of-day platform report.
 *
 * Point a scheduler at GET /api/cron/daily-report once a day at 23:59 WAT
 * (cron "59 22 * * *" in UTC), Authorization: Bearer CRON_SECRET. Emails a
 * detailed report of the COMPLETED Africa/Lagos day - clients, team, work,
 * tasks, posts, finance, attendance, applications, engagement - with
 * day-vs-previous-day deltas and HTML charts to the super-admin and CEO.
 *
 * Resends: ?day=YYYY-MM-DD reports one specific Lagos day, ?offset=N reports N
 * days before the day that would normally be reported. ?dry=1 renders without
 * sending.
 */
import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email-from";
import {
  collectDailyReport,
  renderDailyReportHtml,
  renderDailyReportText,
  resolveReportDay,
} from "@/lib/daily-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const RECIPIENTS = (process.env.DAILY_REPORT_RECIPIENTS || "contact.cdsspace@gmail.com,christian.john161@gmail.com")
  .split(",").map((e) => e.trim()).filter(Boolean);

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const dayParam = url.searchParams.get("day");
  const offset = Number(url.searchParams.get("offset") || 0);
  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam)
    ? dayParam
    : resolveReportDay(new Date(), Number.isFinite(offset) ? offset : 0);

  const report = await collectDailyReport(day);
  const html = renderDailyReportHtml(report);
  const text = renderDailyReportText(report);

  if (url.searchParams.get("dry")) {
    return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  const results = await Promise.allSettled(
    RECIPIENTS.map((to) => sendEmail({
      to,
      // The subject carries the day's shape so the inbox is readable without
      // opening anything.
      subject: `CDS Space daily report - ${report.dateLabel} (${report.insights.summary})`,
      html,
      text,
      fromName: "CDS Space Reports",
      dailyThread: true,
    })),
  );
  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - sent;
  if (failed) console.error(`[daily-report] ${failed} recipient(s) failed`);

  return NextResponse.json({
    ok: true, day, date: report.dateLabel, recipients: RECIPIENTS.length, sent, failed,
    metrics: report.metrics.length,
    trackedEvents: report.audit.stats.totalTrackedEvents,
    concerns: report.insights.concerns.length,
    wins: report.insights.wins.length,
  });
}
