/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { getTeamSession } from "@/lib/team-auth";
import { lagosDate } from "@/lib/timebook";
import {
  DEFAULT_CAPTURE_INTERVAL_SECONDS,
  DEFAULT_IDLE_THRESHOLD_SECONDS,
  DEFAULT_SCREENSHOT_RETENTION_DAYS,
  normalizeText,
  weekRange,
} from "@/lib/work-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVITY_CATEGORIES = new Set([
  "productive_work",
  "design",
  "development",
  "content",
  "meeting",
  "learning",
  "research",
  "communication",
  "project_management",
  "administration",
]);

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
      "Work activity uses persistent attendance-linked heartbeats and member-selected task context. It does not request screen sharing, record video or store screenshots.",
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

async function stopOpenSessions(
  db: any,
  memberId: string,
  workDate: string,
  endedAt: string,
  reason = "attendance_closed",
) {
  const { data, error } = await db
    .from("team_work_tracking_sessions")
    .update({ status: "stopped", ended_at: endedAt, pause_reason: reason })
    .eq("team_member_id", memberId)
    .eq("work_date", workDate)
    .in("status", ["active", "paused"])
    .select("*");
  if (error) throw new Error(error.message);
  return data || [];
}

function inactiveAttendanceResponse(entry: any, error: string) {
  return NextResponse.json({
    ok: false,
    error,
    attendance_state: entry?.clock_in_at ? "checked_out" : "not_checked_in",
    attendance_preserved: Boolean(entry?.clock_in_at),
    clock_in_at: entry?.clock_in_at ?? null,
    clock_out_at: entry?.clock_out_at ?? null,
  }, { status: 409 });
}

function cleanText(value: unknown, max = 600) {
  return String(value || "").trim().slice(0, max) || null;
}

type ReportAttachmentInput = {
  source_kind?: unknown;
  source_id?: unknown;
  title?: unknown;
  external_url?: unknown;
  storage_path?: unknown;
  mime_type?: unknown;
  size_bytes?: unknown;
};

async function validateReportAttachments(db: any, session: { id: string; department: string | null }, raw: unknown) {
  const attachments = Array.isArray(raw) ? raw.slice(0, 10) as ReportAttachmentInput[] : [];
  if (Array.isArray(raw) && raw.length > 10) throw new Error("Attach no more than 10 documents to one report.");

  const cdocIds = attachments.filter((item) => item.source_kind === "cdoc").map((item) => String(item.source_id || "")).filter(Boolean);
  const protectedIds = attachments.filter((item) => item.source_kind === "protected").map((item) => String(item.source_id || "")).filter(Boolean);
  const [cdocResult, protectedResult] = await Promise.all([
    cdocIds.length
      ? db.from("team_cdocs").select("id,title").in("id", cdocIds).eq("created_by", session.id)
      : Promise.resolve({ data: [] }),
    protectedIds.length
      ? db.from("team_protected_documents").select("id,title").in("id", protectedIds).eq("uploaded_by", session.id)
      : Promise.resolve({ data: [] }),
  ]);
  const cdocs = new Map((cdocResult.data || []).map((doc: any) => [doc.id, doc]));
  const protectedDocs = new Map((protectedResult.data || []).map((doc: any) => [doc.id, doc]));

  return attachments.map((item) => {
    const sourceKind = String(item.source_kind || "");
    if (sourceKind === "cdoc") {
      const doc = cdocs.get(String(item.source_id || "")) as any;
      if (!doc) throw new Error("You can only attach cDocs that you created.");
      return { source_kind: "cdoc", source_id: doc.id, title: String(doc.title).slice(0, 180), external_url: null, storage_path: null, mime_type: null, size_bytes: null };
    }
    if (sourceKind === "protected") {
      const doc = protectedDocs.get(String(item.source_id || "")) as any;
      if (!doc) throw new Error("You can only attach protected documents that you created.");
      return { source_kind: "protected", source_id: doc.id, title: String(doc.title).slice(0, 180), external_url: null, storage_path: null, mime_type: null, size_bytes: null };
    }
    if (sourceKind === "external") {
      const title = String(item.title || "External document").trim().slice(0, 180);
      const externalUrl = String(item.external_url || "").trim().slice(0, 2048);
      let parsed: URL;
      try { parsed = new URL(externalUrl); } catch { throw new Error("Enter a valid external document URL."); }
      if (parsed.protocol !== "https:") throw new Error("External document links must use HTTPS.");
      return { source_kind: "external", source_id: null, title, external_url: externalUrl, storage_path: null, mime_type: null, size_bytes: null };
    }
    if (sourceKind === "upload") {
      const storagePath = String(item.storage_path || "");
      const sizeBytes = Number(item.size_bytes || 0);
      if (!storagePath.startsWith(`work-reports/${session.id}/`) || item.mime_type !== "application/pdf" || sizeBytes <= 0 || sizeBytes > 5 * 1024 * 1024) {
        throw new Error("One of the uploaded PDF attachments is invalid.");
      }
      return { source_kind: "upload", source_id: null, title: String(item.title || "PDF attachment").slice(0, 180), external_url: null, storage_path: storagePath, mime_type: "application/pdf", size_bytes: sizeBytes };
    }
    throw new Error("Unsupported weekly-report attachment type.");
  });
}

function cleanCategory(value: unknown) {
  const category = String(value || "");
  return ACTIVITY_CATEGORIES.has(category) ? category : "productive_work";
}

function activityScores(category: string) {
  if (category === "development" || category === "design") return { productivity: 90, focus: 88 };
  if (category === "content" || category === "project_management") return { productivity: 86, focus: 84 };
  if (category === "learning" || category === "research") return { productivity: 82, focus: 86 };
  if (category === "meeting" || category === "communication") return { productivity: 78, focus: 74 };
  if (category === "administration") return { productivity: 80, focus: 78 };
  return { productivity: 84, focus: 82 };
}

async function resolveTaskContext(db: any, memberId: string, taskId: string | null) {
  if (!taskId) return null;
  const { data } = await db
    .from("task_board_tasks")
    .select("id,title,board_id,task_boards(title)")
    .eq("id", taskId)
    .maybeSingle();
  if (!data) return null;
  const { data: membership } = await db
    .from("task_board_members")
    .select("board_id")
    .eq("board_id", data.board_id)
    .eq("team_member_id", memberId)
    .maybeSingle();
  if (!membership) return null;
  const boardRelation = data.task_boards as unknown as { title?: string } | { title?: string }[] | null;
  const boardTitle = Array.isArray(boardRelation) ? boardRelation[0]?.title : boardRelation?.title;
  return { id: data.id, title: data.title, board_title: boardTitle || null };
}

async function writeHeartbeat(input: {
  db: any;
  memberId: string;
  entry: any;
  trackingSession: any;
  body: any;
  forceCheckpoint: boolean;
}) {
  const { db, memberId, entry, trackingSession, body, forceCheckpoint } = input;
  if (trackingSession.status !== "active") {
    return { session: trackingSession, checkpoint: null };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const previousMetadata = trackingSession.metadata || {};
  const category = cleanCategory(body.focus_category || previousMetadata.focus_category);
  const hasFocusDetail = Object.prototype.hasOwnProperty.call(body, "focus_detail");
  const hasTaskContext = Object.prototype.hasOwnProperty.call(body, "task_id");
  const requestedTaskId = cleanText(body.task_id, 40);
  const task = await resolveTaskContext(db, memberId, requestedTaskId);
  const detail = (hasFocusDetail ? cleanText(body.focus_detail, 600) : previousMetadata.focus_detail) || null;
  const taskTitle = task?.title || (hasTaskContext ? cleanText(body.task_title, 180) : previousMetadata.task_title) || null;
  const boardTitle = task?.board_title || (hasTaskContext ? cleanText(body.board_title, 180) : previousMetadata.board_title) || null;
  const lastHeartbeatAt = previousMetadata.last_heartbeat_at
    ? new Date(previousMetadata.last_heartbeat_at).getTime()
    : NaN;
  const elapsedSeconds = Number.isFinite(lastHeartbeatAt)
    ? Math.max(1, Math.min(120, Math.round((now.getTime() - lastHeartbeatAt) / 1000)))
    : 60;
  const lastCheckpointAt = trackingSession.last_capture_at
    ? new Date(trackingSession.last_capture_at).getTime()
    : 0;
  const shouldCheckpoint = forceCheckpoint || now.getTime() - lastCheckpointAt >= 5 * 60 * 1000;
  const metadata = {
    ...previousMetadata,
    tracking_mode: "activity_heartbeat",
    focus_category: category,
    focus_detail: detail,
    task_id: task?.id || (hasTaskContext ? null : previousMetadata.task_id) || null,
    task_title: taskTitle,
    board_title: boardTitle,
    page_path: cleanText(body.page_path, 400),
    page_title: cleanText(body.page_title, 300),
    last_interaction_at: cleanText(body.last_interaction_at, 50),
    last_heartbeat_at: nowIso,
    checkpoint_count: Number(previousMetadata.checkpoint_count || 0) + (shouldCheckpoint ? 1 : 0),
  };

  let checkpoint = null;
  if (shouldCheckpoint) {
    const scores = activityScores(category);
    const focusLabel = detail || taskTitle || category.replace(/_/g, " ");
    const { data, error } = await db
      .from("team_work_tracking_snapshots")
      .insert({
        session_id: trackingSession.id,
        team_member_id: memberId,
        time_entry_id: entry?.id ?? null,
        work_date: trackingSession.work_date,
        captured_at: nowIso,
        local_captured_at: nowIso,
        active_app: "CDS Team Portal",
        page_title: cleanText(body.page_title, 300),
        page_url: cleanText(body.page_path, 400),
        project_hint: taskTitle || boardTitle,
        activity_state: "active",
        idle_seconds: 0,
        screenshot_storage_path: null,
        screenshot_sha256: null,
        ai_status: "analyzed",
        ai_summary: `${category === "learning" ? "Studying / researching" : "Working"}: ${focusLabel}${taskTitle && detail !== taskTitle ? ` · Task: ${taskTitle}` : ""}.`,
        ai_categories: [category],
        detected_apps: ["CDS Team Portal"],
        detected_websites: [],
        detected_projects: [taskTitle || boardTitle].filter(Boolean),
        detected_deliverables: [],
        productivity_score: scores.productivity,
        focus_score: scores.focus,
        confidence: 100,
        metadata: {
          source: "member_focus_heartbeat",
          evidence_type: "member_declared_task_context",
          task_id: task?.id || null,
          board_title: boardTitle,
          focus_detail: detail,
          last_interaction_at: metadata.last_interaction_at,
          image_retained: false,
        },
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    checkpoint = data;
  }

  const { data: updated, error: updateError } = await db
    .from("team_work_tracking_sessions")
    .update({
      time_entry_id: entry?.id ?? trackingSession.time_entry_id ?? null,
      last_capture_at: shouldCheckpoint ? nowIso : trackingSession.last_capture_at,
      // Keep the legacy screenshot counter untouched: these are text-only
      // evidence checkpoints and never contain a captured screen.
      screenshot_count: Number(trackingSession.screenshot_count || 0),
      active_seconds: Number(trackingSession.active_seconds || 0) + elapsedSeconds,
      idle_seconds: 0,
      metadata,
    })
    .eq("id", trackingSession.id)
    .eq("team_member_id", memberId)
    .select("*")
    .single();
  if (updateError) throw new Error(updateError.message);
  return { session: updated, checkpoint };
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
      db.from("team_work_tracking_daily_reports").select("*").eq("team_member_id", session.id).eq("work_date", workDate).maybeSingle(),
      db
        .from("team_work_tracking_snapshots")
        .select("id, captured_at, active_app, page_title, page_url, project_hint, activity_state, idle_seconds, ai_status, ai_summary, ai_categories, detected_apps, detected_websites, detected_projects, detected_deliverables, productivity_score, focus_score, confidence, metadata")
        .eq("team_member_id", session.id)
        .eq("work_date", workDate)
        .order("captured_at", { ascending: false })
        .limit(30),
      db.from("team_work_tracking_weekly_reports").select("*").eq("team_member_id", session.id).eq("week_start", weekRange(workDate).week_start).maybeSingle(),
      db.from("team_work_tracking_self_reports").select("*").eq("team_member_id", session.id).eq("week_start", weekRange(workDate).week_start).maybeSingle(),
      db.from("team_work_tracking_report_comparisons").select("*").eq("team_member_id", session.id).eq("week_start", weekRange(workDate).week_start).maybeSingle(),
    ]);

    const [attachmentResult, cdocResult, protectedResult] = await Promise.all([
      selfReport.data?.id
        ? db.from("team_work_tracking_self_report_attachments").select("*").eq("self_report_id", selfReport.data.id).order("created_at", { ascending: true })
        : Promise.resolve({ data: [] }),
      db.from("team_cdocs").select("id,title,slug").eq("created_by", session.id).eq("is_archived", false).order("updated_at", { ascending: false }).limit(200),
      db.from("team_protected_documents").select("id,title").eq("uploaded_by", session.id).order("created_at", { ascending: false }).limit(200),
    ]);
    const ownedCdocIds = new Set((cdocResult.data || []).map((doc: any) => doc.id));
    const ownedProtectedDocumentIds = new Set((protectedResult.data || []).map((doc: any) => doc.id));
    const ownedAttachments = (attachmentResult.data || []).filter((attachment: any) => {
      if (attachment.source_kind === "cdoc") return ownedCdocIds.has(attachment.source_id);
      if (attachment.source_kind === "protected") return ownedProtectedDocumentIds.has(attachment.source_id);
      return attachment.source_kind === "external" || attachment.source_kind === "upload";
    });
    const selfReportWithAttachments = selfReport.data
      ? { ...selfReport.data, attachments: ownedAttachments }
      : null;

    let currentSession = activeSession;
    if (currentSession && entry?.clock_out_at) {
      await stopOpenSessions(db, session.id, workDate, entry.clock_out_at);
      currentSession = null;
    }

    return NextResponse.json({
      ok: true,
      work_date: workDate,
      settings,
      today: entry,
      active_session: currentSession?.status === "stopped" ? null : currentSession,
      daily_report: daily.data || null,
      snapshots: snapshots.data || [],
      weekly_report: weeklyReport.data || null,
      self_report: selfReportWithAttachments,
      attachment_sources: {
        cdocs: cdocResult.data || [],
        protected_documents: (protectedResult.data || []).map((doc: any) => ({ id: doc.id, title: doc.title })),
      },
      comparison: comparison.data || null,
      week: weekRange(workDate),
      tracking_mode: "activity_heartbeat",
      attendance_state: entry?.clock_in_at ? (entry.clock_out_at ? "checked_out" : "checked_in") : "not_checked_in",
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Work activity is not ready." },
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
      return NextResponse.json({ ok: false, error: "Work activity is currently disabled." }, { status: 403 });
    }
    const entry = await getTodayEntry(db, session.id, workDate);

    if (action === "start_session") {
      if (!entry?.clock_in_at || entry?.clock_out_at) {
        return inactiveAttendanceResponse(
          entry,
          entry?.clock_out_at
            ? "Attendance is checked out for today. Your earlier check-in remains recorded."
            : "Check in through Attendance before starting a work focus.",
        );
      }
      const existing = await getActiveSession(db, session.id, workDate);
      if (existing) return NextResponse.json({ ok: true, session: existing, settings });

      const { data, error } = await db
        .from("team_work_tracking_sessions")
        .insert({
          team_member_id: session.id,
          time_entry_id: entry.id,
          work_date: workDate,
          status: entry.current_status === "on_break" ? "paused" : "active",
          pause_reason: entry.current_status === "on_break" ? "break_time" : null,
          capture_interval_seconds: 300,
          metadata: {
            started_from: "team_portal",
            tracking_mode: "activity_heartbeat",
            user_agent: req.headers.get("user-agent"),
          },
        })
        .select("*")
        .single();
      if (error) {
        // Concurrent tabs can both try to create the same daily session. The
        // database uniqueness guard keeps one; return that session to both.
        if (String(error.code || "") === "23505") {
          const concurrentSession = await getActiveSession(db, session.id, workDate);
          if (concurrentSession) return NextResponse.json({ ok: true, session: concurrentSession, settings });
        }
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, session: data, settings });
    }

    if (action === "stop_session") {
      const sessionId = cleanText(body.session_id, 40);
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
      const sessionId = cleanText(body.session_id, 40);
      if (!sessionId) return NextResponse.json({ ok: false, error: "session_id is required." }, { status: 400 });
      if (action === "resume_session" && (!entry?.clock_in_at || entry?.clock_out_at)) {
        if (entry?.clock_out_at) {
          await stopOpenSessions(db, session.id, workDate, entry.clock_out_at);
        }
        return inactiveAttendanceResponse(
          entry,
          entry?.clock_out_at
            ? "Attendance is checked out. Your earlier check-in remains recorded."
            : "Check in before resuming work.",
        );
      }
      const { data, error } = await db
        .from("team_work_tracking_sessions")
        .update({
          status: action === "pause_session" ? "paused" : "active",
          pause_reason: action === "pause_session" ? normalizeText(body.reason) || "member_pause" : null,
        })
        .eq("id", sessionId)
        .eq("team_member_id", session.id)
        .select("*")
        .single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, session: data });
    }

    if (action === "heartbeat" || action === "set_context") {
      if (!entry?.clock_in_at || entry?.clock_out_at) {
        if (entry?.clock_out_at) {
          await stopOpenSessions(db, session.id, workDate, entry.clock_out_at);
        }
        return inactiveAttendanceResponse(
          entry,
          entry?.clock_out_at
            ? "Attendance is checked out. Your earlier check-in remains recorded."
            : "Attendance session is not active. Check in to begin work tracking.",
        );
      }
      const trackingSession = await getActiveSession(db, session.id, workDate);
      if (!trackingSession) {
        return NextResponse.json({ ok: false, error: "Work session is not active." }, { status: 409 });
      }
      if (entry.current_status === "on_break" && trackingSession.status === "active") {
        const { data } = await db
          .from("team_work_tracking_sessions")
          .update({ status: "paused", pause_reason: "break_time" })
          .eq("id", trackingSession.id)
          .select("*")
          .single();
        return NextResponse.json({ ok: true, session: data, checkpoint: null });
      }
      const result = await writeHeartbeat({
        db,
        memberId: session.id,
        entry,
        trackingSession,
        body,
        forceCheckpoint: action === "set_context",
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "submit_self_report" || action === "save_self_report_draft") {
      const range = weekRange(body.week_start || workDate);
      const isDraft = action === "save_self_report_draft";
      const attachments = await validateReportAttachments(db, session, body.attachments);
      const payload = {
        team_member_id: session.id,
        week_start: range.week_start,
        week_end: range.week_end,
        tasks_completed: normalizeText(body.tasks_completed),
        challenges: normalizeText(body.challenges),
        wins: normalizeText(body.wins),
        goals_next_week: normalizeText(body.goals_next_week),
        submitted_at: new Date().toISOString(),
        is_draft: isDraft,
      };
      const { data, error } = await db
        .from("team_work_tracking_self_reports")
        .upsert(payload, { onConflict: "team_member_id,week_start" })
        .select("*")
        .single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      const { error: deleteError } = await db
        .from("team_work_tracking_self_report_attachments")
        .delete()
        .eq("self_report_id", data.id)
        .eq("team_member_id", session.id);
      if (deleteError) return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
      let savedAttachments: any[] = [];
      if (attachments.length) {
        const { data: insertedAttachments, error: attachmentError } = await db
          .from("team_work_tracking_self_report_attachments")
          .insert(attachments.map((attachment) => ({ ...attachment, self_report_id: data.id, team_member_id: session.id })))
          .select("*");
        if (attachmentError) return NextResponse.json({ ok: false, error: attachmentError.message }, { status: 500 });
        savedAttachments = insertedAttachments || [];
      }
      return NextResponse.json({ ok: true, self_report: { ...data, attachments: savedAttachments }, draft: isDraft });
    }

    return NextResponse.json({ ok: false, error: "Unsupported work activity action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Work activity action failed." },
      { status: 500 },
    );
  }
}
