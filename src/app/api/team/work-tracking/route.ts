/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { getTeamSession } from "@/lib/team-auth";
import { lagosDate, lagosMinutes, TIMEBOOK_SCHEDULE } from "@/lib/timebook";
import {
  DEFAULT_CAPTURE_INTERVAL_SECONDS,
  DEFAULT_IDLE_THRESHOLD_SECONDS,
  DEFAULT_SCREENSHOT_RETENTION_DAYS,
  WORK_TRACKING_BUCKET,
  normalizeText,
  weekRange,
} from "@/lib/work-tracking";
import { analyzeSnapshotWithAi } from "@/lib/work-tracking-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isOfficialBreak() {
  const minutes = lagosMinutes();
  return minutes >= TIMEBOOK_SCHEDULE.breakStartMinutes && minutes < TIMEBOOK_SCHEDULE.breakEndMinutes;
}

async function getSettings(db: any) {
  const { data } = await db
    .from("team_work_tracking_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  return data || {
    enabled: true,
    capture_interval_seconds: DEFAULT_CAPTURE_INTERVAL_SECONDS,
    screenshot_retention_days: DEFAULT_SCREENSHOT_RETENTION_DAYS,
    idle_threshold_seconds: DEFAULT_IDLE_THRESHOLD_SECONDS,
    privacy_notice:
      "Screen tracking requires team member consent and browser screen-sharing permission. Raw screenshots are retained for 7 days; summaries and logs remain available to management.",
  };
}

async function getTodayEntry(db: any, memberId: string, workDate = lagosDate()) {
  const { data, error } = await db
    .from("team_time_entries")
    .select("*")
    .eq("team_member_id", memberId)
    .eq("work_date", workDate)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function getActiveSession(db: any, memberId: string, workDate = lagosDate()) {
  const { data, error } = await db
    .from("team_work_tracking_sessions")
    .select("*")
    .eq("team_member_id", memberId)
    .eq("work_date", workDate)
    .in("status", ["active", "paused"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([\s\S]+)$/i);
  if (!match) throw new Error("Screenshot must be a jpeg, png, or webp data URL.");
  const contentType = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.byteLength > 5 * 1024 * 1024) throw new Error("Screenshot is larger than 5MB.");
  return { buffer, contentType };
}

async function ensureBucket(db: any) {
  try {
    await db.storage.createBucket(WORK_TRACKING_BUCKET, {
      public: false,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    });
  } catch {
    // Bucket may already exist or storage may be managed separately.
  }
}

async function signedSnapshotUrl(db: any, path: string | null) {
  if (!path) return null;
  try {
    const { data } = await db.storage.from(WORK_TRACKING_BUCKET).createSignedUrl(path, 60 * 10);
    return data?.signedUrl || null;
  } catch {
    return null;
  }
}

export async function GET() {
  const session = await getTeamSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    const db = getGlashDbAdmin() as any;
    const workDate = lagosDate();
    const settings = await getSettings(db);
    const [entry, activeSession, daily, snapshots, weeklyReport, selfReport, comparison] = await Promise.all([
      getTodayEntry(db, session.id, workDate),
      getActiveSession(db, session.id, workDate),
      db
        .from("team_work_tracking_daily_reports")
        .select("*")
        .eq("team_member_id", session.id)
        .eq("work_date", workDate)
        .maybeSingle(),
      db
        .from("team_work_tracking_snapshots")
        .select("id, captured_at, active_app, page_title, page_url, project_hint, activity_state, idle_seconds, ai_status, ai_summary, ai_categories, detected_apps, detected_websites, detected_projects, detected_deliverables, productivity_score, focus_score, confidence, screenshot_storage_path, expires_at")
        .eq("team_member_id", session.id)
        .eq("work_date", workDate)
        .order("captured_at", { ascending: false })
        .limit(18),
      db
        .from("team_work_tracking_weekly_reports")
        .select("*")
        .eq("team_member_id", session.id)
        .eq("week_start", weekRange(workDate).week_start)
        .maybeSingle(),
      db
        .from("team_work_tracking_self_reports")
        .select("*")
        .eq("team_member_id", session.id)
        .eq("week_start", weekRange(workDate).week_start)
        .maybeSingle(),
      db
        .from("team_work_tracking_report_comparisons")
        .select("*")
        .eq("team_member_id", session.id)
        .eq("week_start", weekRange(workDate).week_start)
        .maybeSingle(),
    ]);

    const rows = await Promise.all((snapshots.data || []).map(async (snapshot: any) => ({
      ...snapshot,
      screenshot_url: await signedSnapshotUrl(db, snapshot.screenshot_storage_path),
    })));

    return NextResponse.json({
      ok: true,
      work_date: workDate,
      settings,
      today: entry,
      active_session: activeSession,
      daily_report: daily.data || null,
      snapshots: rows,
      weekly_report: weeklyReport.data || null,
      self_report: selfReport.data || null,
      comparison: comparison.data || null,
      week: weekRange(workDate),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Work tracking is not ready." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getTeamSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = getGlashDbAdmin() as any;
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");
  const workDate = lagosDate();

  try {
    const settings = await getSettings(db);
    if (!settings.enabled) {
      return NextResponse.json({ ok: false, error: "Work tracking is currently disabled." }, { status: 403 });
    }

    const entry = await getTodayEntry(db, session.id, workDate);

    if (action === "start_session") {
      if (!entry?.clock_in_at || entry.clock_out_at) {
        return NextResponse.json({ ok: false, error: "Clock in on the timebook before starting work tracking." }, { status: 400 });
      }
      if (entry.current_status === "on_break" || isOfficialBreak()) {
        return NextResponse.json({ ok: false, error: "Work tracking pauses during break time." }, { status: 409 });
      }

      const existing = await getActiveSession(db, session.id, workDate);
      if (existing) return NextResponse.json({ ok: true, session: existing, settings });

      const { data, error } = await db
        .from("team_work_tracking_sessions")
        .insert({
          team_member_id: session.id,
          time_entry_id: entry.id,
          work_date: workDate,
          status: "active",
          capture_interval_seconds: settings.capture_interval_seconds || DEFAULT_CAPTURE_INTERVAL_SECONDS,
          metadata: {
            started_from: "team_portal",
            user_agent: req.headers.get("user-agent"),
          },
        })
        .select("*")
        .single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, session: data, settings });
    }

    if (action === "stop_session") {
      const sessionId = body.session_id;
      if (!sessionId) return NextResponse.json({ ok: false, error: "session_id is required." }, { status: 400 });
      const { data, error } = await db
        .from("team_work_tracking_sessions")
        .update({ status: "stopped", ended_at: new Date().toISOString(), pause_reason: normalizeText(body.reason) })
        .eq("id", sessionId)
        .eq("team_member_id", session.id)
        .select("*")
        .single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, session: data });
    }

    if (action === "pause_session" || action === "resume_session") {
      const sessionId = body.session_id;
      if (!sessionId) return NextResponse.json({ ok: false, error: "session_id is required." }, { status: 400 });
      if (action === "resume_session" && (!entry?.clock_in_at || entry.clock_out_at)) {
        return NextResponse.json({ ok: false, error: "Clock in first." }, { status: 400 });
      }
      const { data, error } = await db
        .from("team_work_tracking_sessions")
        .update({
          status: action === "pause_session" ? "paused" : "active",
          pause_reason: action === "pause_session" ? normalizeText(body.reason) || "manual_pause" : null,
        })
        .eq("id", sessionId)
        .eq("team_member_id", session.id)
        .select("*")
        .single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, session: data });
    }

    if (action === "submit_self_report") {
      const range = weekRange(body.week_start || workDate);
      const payload = {
        team_member_id: session.id,
        week_start: range.week_start,
        week_end: range.week_end,
        tasks_completed: normalizeText(body.tasks_completed),
        challenges: normalizeText(body.challenges),
        wins: normalizeText(body.wins),
        goals_next_week: normalizeText(body.goals_next_week),
        submitted_at: new Date().toISOString(),
      };
      const { data, error } = await db
        .from("team_work_tracking_self_reports")
        .upsert(payload, { onConflict: "team_member_id,week_start" })
        .select("*")
        .single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, self_report: data });
    }

    if (action === "capture_snapshot") {
      const sessionId = body.session_id;
      const screenshotDataUrl = String(body.screenshot_data_url || "");
      if (!sessionId || !screenshotDataUrl) {
        return NextResponse.json({ ok: false, error: "session_id and screenshot_data_url are required." }, { status: 400 });
      }
      if (!entry?.clock_in_at || entry.clock_out_at) {
        return NextResponse.json({ ok: false, error: "Tracking stopped because you are not clocked in." }, { status: 409 });
      }
      if (entry.current_status === "on_break" || isOfficialBreak()) {
        await db
          .from("team_work_tracking_sessions")
          .update({ status: "paused", pause_reason: "break_time" })
          .eq("id", sessionId)
          .eq("team_member_id", session.id);
        return NextResponse.json({ ok: false, error: "Tracking pauses during break time." }, { status: 409 });
      }

      const { data: trackingSession, error: sessionError } = await db
        .from("team_work_tracking_sessions")
        .select("*")
        .eq("id", sessionId)
        .eq("team_member_id", session.id)
        .maybeSingle();
      if (sessionError) return NextResponse.json({ ok: false, error: sessionError.message }, { status: 500 });
      if (!trackingSession || trackingSession.status !== "active") {
        return NextResponse.json({ ok: false, error: "Tracking session is not active." }, { status: 409 });
      }

      const snapshotId = crypto.randomUUID();
      const { buffer, contentType } = parseDataUrl(screenshotDataUrl);
      const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
      const storagePath = `${session.id}/${workDate}/${snapshotId}.${ext}`;
      let storedPath: string | null = storagePath;
      let storageWarning: string | null = null;
      await ensureBucket(db);
      const upload = await db.storage.from(WORK_TRACKING_BUCKET).upload(storagePath, buffer, {
        contentType,
        upsert: true,
      });
      if (upload.error) {
        storedPath = null;
        storageWarning = upload.error.message;
      }

      const analysis = await analyzeSnapshotWithAi({
        screenshot_data_url: screenshotDataUrl,
        active_app: normalizeText(body.active_app) || "Browser",
        page_title: normalizeText(body.page_title),
        page_url: normalizeText(body.page_url),
        project_hint: normalizeText(body.project_hint),
        activity_state: normalizeText(body.activity_state) || "active",
        idle_seconds: Number(body.idle_seconds || 0),
      });
      const now = new Date().toISOString();
      const retentionDays = Number(settings.screenshot_retention_days || DEFAULT_SCREENSHOT_RETENTION_DAYS);
      const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString();
      const idleSeconds = Math.max(0, Number(body.idle_seconds || 0));
      const activeSeconds = Number(settings.capture_interval_seconds || DEFAULT_CAPTURE_INTERVAL_SECONDS);

      const { data: snapshot, error: insertError } = await db
        .from("team_work_tracking_snapshots")
        .insert({
          id: snapshotId,
          session_id: sessionId,
          team_member_id: session.id,
          time_entry_id: entry.id,
          work_date: workDate,
          captured_at: now,
          local_captured_at: body.local_captured_at || null,
          active_app: normalizeText(body.active_app) || "Browser",
          page_title: normalizeText(body.page_title),
          page_url: normalizeText(body.page_url),
          project_hint: normalizeText(body.project_hint),
          activity_state: ["active", "idle", "break"].includes(String(body.activity_state)) ? body.activity_state : "active",
          idle_seconds: idleSeconds,
          screenshot_storage_path: storedPath,
          screenshot_sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
          expires_at: expiresAt,
          ai_status: analysis.model === "local-fallback" ? "analyzed" : "analyzed",
          ai_summary: analysis.summary,
          ai_categories: analysis.categories,
          detected_apps: analysis.detected_apps,
          detected_websites: analysis.detected_websites,
          detected_projects: analysis.detected_projects,
          detected_deliverables: analysis.detected_deliverables,
          productivity_score: analysis.productivity_score,
          focus_score: analysis.focus_score,
          confidence: analysis.confidence,
          metadata: {
            ai_model: analysis.model,
            storage_warning: storageWarning,
            viewport: body.viewport || null,
            device_pixel_ratio: body.device_pixel_ratio || null,
          },
        })
        .select("*")
        .single();
      if (insertError) return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });

      await db
        .from("team_work_tracking_sessions")
        .update({
          screenshot_count: Number(trackingSession.screenshot_count || 0) + 1,
          last_capture_at: now,
          idle_seconds: Number(trackingSession.idle_seconds || 0) + idleSeconds,
          active_seconds: Number(trackingSession.active_seconds || 0) + Math.max(0, activeSeconds - idleSeconds),
        })
        .eq("id", sessionId);

      return NextResponse.json({
        ok: true,
        snapshot: {
          ...snapshot,
          screenshot_url: await signedSnapshotUrl(db, snapshot.screenshot_storage_path),
        },
        storage_warning: storageWarning,
      });
    }

    return NextResponse.json({ ok: false, error: "Unsupported work tracking action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Work tracking action failed." },
      { status: 500 },
    );
  }
}
