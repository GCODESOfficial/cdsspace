/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { getTeamSession } from "@/lib/team-auth";
import {
  attendanceScores,
  attendanceStatus,
  isAfterAutoCheckout,
  isEarlyLogout,
  lagosDate,
  lagosMinutes,
  locationFlags,
  MAX_DAILY_SESSIONS,
  officeRequiredFor,
  overtimeMinutes,
  TIMEBOOK_SCHEDULE,
  validateLeavePeriod,
  workMinutes,
  type WorkMode,
} from "@/lib/timebook";
import { getTimebookOffice } from "@/lib/timebook-office";
import { memberHasAccessAnywhere } from "@/lib/team-login-security";
import { notifySuperAdmin } from "@/lib/notify-admin";
import { autoCheckoutOpenTimeEntries } from "@/lib/timebook-auto-checkout";
import { ADMIN_FEATURE_PERMISSION_KEYS, notifyAdminFeatureEvent } from "@/lib/admin-feature-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || null;
}

function bypassCodeHash(code: string) {
  return crypto.createHash("sha256").update(code.trim().toUpperCase().replace(/\s+/g, "")).digest("hex");
}

function statusForEntry(entry: any, flexibleBreak = false) {
  if (!entry?.clock_in_at) return "offline";
  if (entry.clock_out_at) return "offline";
  if (!flexibleBreak) {
    const minutes = lagosMinutes();
    if (minutes >= TIMEBOOK_SCHEDULE.breakStartMinutes && minutes < TIMEBOOK_SCHEDULE.breakEndMinutes) {
      return "on_break";
    }
  }
  return entry.current_status || "available";
}

function locationFromBody(body: any) {
  // Clients send coordinates either nested under `location` or as flat
  // top-level fields (my-day / timebook pages) - accept both shapes.
  const loc = body?.location ?? body ?? {};
  const num = (value: any) => {
    if (value == null || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    latitude: num(loc.latitude),
    longitude: num(loc.longitude),
    accuracy: num(loc.accuracy),
    clientCapturedAt: loc.captured_at || null,
  };
}

function hasLocation(loc: ReturnType<typeof locationFromBody>) {
  return Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude);
}

async function ensureProfile(db: any, memberId: string) {
  const { data: existing, error } = await db
    .from("team_time_profiles")
    .select("*")
    .eq("team_member_id", memberId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (existing) return existing;

  const { data: inserted, error: insertError } = await db
    .from("team_time_profiles")
    .insert({
      team_member_id: memberId,
      work_mode: "onsite",
      hybrid_office_days: [],
    })
    .select("*")
    .single();
  if (insertError) throw new Error(insertError.message);
  return inserted;
}

// Completed check-in/out cycles recorded on the entry. Entries clocked out
// before the multi-session feature have an empty `sessions` array but a
// clock_out_at - count that as one completed session.
function completedSessions(entry: any): Array<{ clock_in_at: string; clock_out_at: string; minutes: number }> {
  const sessions = Array.isArray(entry?.sessions) ? entry.sessions : [];
  if (sessions.length === 0 && entry?.clock_in_at && entry?.clock_out_at) {
    return [{
      clock_in_at: entry.session_started_at || entry.clock_in_at,
      clock_out_at: entry.clock_out_at,
      minutes: entry.total_work_minutes || 0,
    }];
  }
  return sessions;
}

async function getTodayEntry(db: any, memberId: string, workDate: string) {
  const { data, error } = await db
    .from("team_time_entries")
    .select("*")
    .eq("team_member_id", memberId)
    .eq("work_date", workDate)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function validateBypassCode(db: any, code: string, memberId: string) {
  const normalized = String(code || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized) return null;
  const { data, error } = await db
    .from("team_geofence_bypass_codes")
    .select("*")
    .eq("code_hash", bypassCodeHash(normalized))
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Invalid admin bypass code.");
  if (data.status !== "active") throw new Error("This admin bypass code is no longer active.");
  if (new Date(data.expires_at) < new Date()) {
    await db.from("team_geofence_bypass_codes").update({ status: "expired" }).eq("id", data.id);
    throw new Error("This admin bypass code has expired.");
  }
  if (data.assigned_team_member_id && data.assigned_team_member_id !== memberId) {
    throw new Error("This admin bypass code was generated for another team member.");
  }
  return data;
}

async function logEvent(db: any, req: NextRequest, input: {
  entry: any;
  memberId: string;
  eventType: string;
  workDate: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  location?: ReturnType<typeof locationFromBody>;
  distance?: number | null;
  inside?: boolean | null;
  flags?: string[];
  metadata?: Record<string, any>;
}) {
  await db.from("team_time_events").insert({
    entry_id: input.entry?.id ?? null,
    team_member_id: input.memberId,
    event_type: input.eventType,
    work_date: input.workDate,
    from_status: input.fromStatus ?? null,
    to_status: input.toStatus ?? null,
    latitude: input.location?.latitude ?? null,
    longitude: input.location?.longitude ?? null,
    accuracy: input.location?.accuracy ?? null,
    distance_meters: input.distance ?? null,
    inside_geofence: input.inside ?? null,
    ip_address: clientIp(req),
    user_agent: req.headers.get("user-agent"),
    device_label: input.metadata?.device_label ?? null,
    flags: input.flags ?? [],
    metadata: input.metadata ?? {},
  });
}

export async function GET() {
  const session = await getTeamSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getGlashDbAdmin() as any;
    const workDate = lagosDate();
    const monthStart = `${workDate.slice(0, 7)}-01`;
    await autoCheckoutOpenTimeEntries({ workDate, source: "team_timebook_get" }).catch((error) => {
      console.error("[timebook] auto checkout failed:", error);
    });
    const profile = await ensureProfile(db, session.id);
    const entry = await getTodayEntry(db, session.id, workDate);

    const { data: history } = await db
      .from("team_time_entries")
      .select("*")
      .eq("team_member_id", session.id)
      .gte("work_date", monthStart)
      .lte("work_date", workDate)
      .order("work_date", { ascending: false })
      .limit(31);

    const { data: leaveRequests } = await db
      .from("team_leave_requests")
      .select("*")
      .eq("team_member_id", session.id)
      .order("created_at", { ascending: false })
      .limit(8);

    const leaveIds = (leaveRequests ?? []).map((leave: any) => leave.id).filter(Boolean);
    const { data: clarificationMessages, error: clarificationError } = leaveIds.length
      ? await db
        .from("team_leave_clarification_messages")
        .select("id, leave_request_id, sender_type, sender_member_id, sender_label, message, created_at")
        .in("leave_request_id", leaveIds)
        .order("created_at", { ascending: true })
      : { data: [], error: null };
    if (clarificationError) throw new Error(clarificationError.message);
    const clarificationsByLeave = new Map<string, any[]>();
    for (const message of clarificationMessages ?? []) {
      const current = clarificationsByLeave.get(message.leave_request_id) ?? [];
      current.push(message);
      clarificationsByLeave.set(message.leave_request_id, current);
    }
    const hydratedLeaveRequests = (leaveRequests ?? []).map((leave: any) => ({
      ...leave,
      clarifications: clarificationsByLeave.get(leave.id) ?? [],
    }));

    return NextResponse.json({
      ok: true,
      profile,
      today: entry ? { ...entry, effective_status: statusForEntry(entry, profile.flexible_break_enabled) } : null,
      work_date: workDate,
      max_sessions: MAX_DAILY_SESSIONS,
      sessions_used: entry ? completedSessions(entry).length + (entry.clock_in_at && !entry.clock_out_at ? 1 : 0) : 0,
      office_required: !(await memberHasAccessAnywhere(session.id))
        && officeRequiredFor(profile.work_mode, profile.hybrid_office_days ?? [], workDate),
      history: history ?? [],
      leave_requests: hydratedLeaveRequests,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Timebook is not ready." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getTeamSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");
  const db = getGlashDbAdmin() as any;
  const workDate = lagosDate();

  try {
    // A member explicitly pressing Check out must win over the safety sweep.
    // Previously this sweep ran first and closed the row automatically after
    // 18:15, making the manual checkout appear to lose the member's check-in.
    if (action !== "clock_out") {
      await autoCheckoutOpenTimeEntries({ workDate, source: "team_timebook_post" }).catch((error) => {
        console.error("[timebook] auto checkout failed:", error);
      });
    }
    const profile = await ensureProfile(db, session.id);
    const workMode = (profile.work_mode || "onsite") as WorkMode;
    // A member a super admin has allowed to work from anywhere is never held
    // to the office geofence; their location is still recorded below.
    const officeRequired = !(await memberHasAccessAnywhere(session.id))
      && officeRequiredFor(workMode, profile.hybrid_office_days ?? [], workDate);

    if (action === "request_leave") {
      const { leave_type, start_date, end_date, reason } = body;
      if (!leave_type || !start_date || !end_date) {
        return NextResponse.json({ ok: false, error: "Leave type and dates are required." }, { status: 400 });
      }
      const validationError = validateLeavePeriod(String(leave_type), String(start_date), String(end_date));
      if (validationError) {
        return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
      }
      const { data, error } = await db
        .from("team_leave_requests")
        .insert({
          team_member_id: session.id,
          leave_type,
          start_date,
          end_date,
          reason: reason || null,
        })
        .select("*")
        .single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, leave_request: data });
    }

    if (action === "reply_leave_clarification") {
      const leaveId = String(body.leave_id || "");
      const message = String(body.message || "").trim();
      if (!leaveId || !message) {
        return NextResponse.json({ ok: false, error: "Enter your response before sending." }, { status: 400 });
      }
      if (message.length > 2000) {
        return NextResponse.json({ ok: false, error: "Keep the response within 2,000 characters." }, { status: 400 });
      }

      const { data: request, error: requestError } = await db
        .from("team_leave_requests")
        .select("id, team_member_id, leave_type, start_date, end_date, status")
        .eq("id", leaveId)
        .eq("team_member_id", session.id)
        .maybeSingle();
      if (requestError) throw new Error(requestError.message);
      if (!request) return NextResponse.json({ ok: false, error: "Leave request not found." }, { status: 404 });
      if (request.status !== "pending") {
        return NextResponse.json({ ok: false, error: "This leave request has already been reviewed." }, { status: 409 });
      }

      const { data: adminQuestion } = await db
        .from("team_leave_clarification_messages")
        .select("id")
        .eq("leave_request_id", leaveId)
        .eq("sender_type", "admin")
        .limit(1)
        .maybeSingle();
      if (!adminQuestion) {
        return NextResponse.json({ ok: false, error: "HR has not requested clarification on this leave request." }, { status: 409 });
      }

      const { data: clarification, error: clarificationInsertError } = await db
        .from("team_leave_clarification_messages")
        .insert({
          leave_request_id: leaveId,
          sender_type: "team_member",
          sender_member_id: session.id,
          sender_label: session.full_name,
          message,
        })
        .select("id, leave_request_id, sender_type, sender_member_id, sender_label, message, created_at")
        .single();
      if (clarificationInsertError) throw new Error(clarificationInsertError.message);

      await notifyAdminFeatureEvent({
        permissionKeys: ADMIN_FEATURE_PERMISSION_KEYS.timebook,
        title: `${session.full_name} replied to a leave clarification`,
        body: message,
        link: "/admin/timebook",
        teamLink: "/team/timebook",
        eyebrow: "HRM · Leave request",
        details: {
          "Team member": session.full_name,
          "Leave type": String(request.leave_type || "").replace(/_/g, " "),
          Dates: `${request.start_date} to ${request.end_date}`,
        },
      });

      return NextResponse.json({ ok: true, clarification });
    }

    let entry = await getTodayEntry(db, session.id, workDate);
    const isNightRecheckIn = action === "clock_in" && !!entry?.clock_out_at && isAfterAutoCheckout();
    const now = new Date().toISOString();
    const loc = locationFromBody(body);
    const office = await getTimebookOffice();
    const geo = locationFlags(loc, office, { requireCoordinates: (action === "clock_in" && !isNightRecheckIn) || action === "location_ping" });
    const commonLocationPatch = hasLocation(loc) ? {
      last_location_lat: loc.latitude,
      last_location_lng: loc.longitude,
      last_location_accuracy: loc.accuracy,
      last_location_distance_meters: geo.distance,
      last_location_inside_geofence: geo.inside,
      last_location_at: now,
    } : {};

    if (action === "clock_in") {
      // Face verification is no longer required to clock in. Check-in is gated by
      // the logged-in session (username/password) + the office geofence below,
      // with a super-admin bypass code for anyone outside the geofence.
      if (workMode === "approved_leave") {
        return NextResponse.json({ ok: false, error: "Your work mode is set to approved leave." }, { status: 400 });
      }
      if (entry?.clock_in_at && !entry.clock_out_at) {
        return NextResponse.json({ ok: false, error: "You are already clocked in.", entry }, { status: 409 });
      }
      // Re-check-in after a checkout is allowed up to MAX_DAILY_SESSIONS
      // check-in/out cycles per day.
      const doneSessions = entry ? completedSessions(entry) : [];
      if (doneSessions.length >= MAX_DAILY_SESSIONS) {
        return NextResponse.json({
          ok: false,
          error: `You have reached the daily limit of ${MAX_DAILY_SESSIONS} check-ins. See you tomorrow!`,
          entry,
        }, { status: 400 });
      }
      let bypassCode: any = null;
      if (officeRequired && !isNightRecheckIn && !geo.inside) {
        if (body?.geofence_bypass_code) {
          try {
            bypassCode = await validateBypassCode(db, body.geofence_bypass_code, session.id);
          } catch (error) {
            return NextResponse.json({
              ok: false,
              error: error instanceof Error ? error.message : "Invalid admin bypass code.",
              allow_bypass: true,
              distance_meters: geo.distance,
              flags: geo.flags,
            }, { status: 403 });
          }
        } else {
          const limit = Math.round(geo.effectiveRadius ?? office.radiusMeters);
          const reason = geo.distance == null
            ? "their location could not be read (GPS off or permission denied)"
            : `they are ~${geo.distance >= 1000 ? `${(geo.distance / 1000).toFixed(1)}km` : `${geo.distance}m`} from the office (limit ${limit}m)`;
          void notifySuperAdmin({
            type: "team_alert",
            title: "Geofence check-in blocked",
            message: `${session.full_name} tried to clock in but ${reason}. They may request a bypass code.`,
            link: "/admin/timebook",
          });
          return NextResponse.json({
            ok: false,
            error: geo.distance == null
              ? "We could not read your location. Turn on GPS / allow location access in your browser (and make sure you are not using a VPN), then try again - or use a super-admin bypass code."
              : `Office geofence check failed. You are ~${geo.distance >= 1000 ? `${(geo.distance / 1000).toFixed(1)}km` : `${geo.distance}m`} away - you must be within ${limit}m of the office to clock in today, or use a super-admin bypass code.`,
            allow_bypass: true,
            distance_meters: geo.distance,
            flags: geo.flags,
          }, { status: 403 });
        }
      }

      const isResume = !!entry?.clock_out_at;
      const sessionNumber = doneSessions.length + 1;
      const status = isResume ? entry.attendance_status : attendanceStatus(now);
      const flags = Array.from(new Set([
        ...(isResume ? entry.flags ?? [] : []),
        ...geo.flags,
        ...(isNightRecheckIn ? ["night_session"] : []),
        ...(bypassCode ? ["geofence_bypass"] : []),
      ]));
      let data: any;
      if (isResume) {
        // Re-check-in: keep the first clock-in (attendance status is judged on
        // it) and open a fresh session. Worked minutes so far stay accumulated
        // in `sessions` / total_work_minutes.
        const result = await db
          .from("team_time_entries")
          .update({
            clock_out_at: null,
            session_started_at: now,
            sessions: doneSessions,
            current_status: "available",
            early_logout: false,
            geofence_bypass_code_id: bypassCode?.id ?? entry.geofence_bypass_code_id ?? null,
            geofence_bypass_reason: bypassCode?.reason ?? entry.geofence_bypass_reason ?? null,
            flags,
            ...commonLocationPatch,
          })
          .eq("id", entry.id)
          .eq("clock_out_at", entry.clock_out_at)
          .select("*")
          .maybeSingle();
        if (result.error) return NextResponse.json({ ok: false, error: result.error.message }, { status: 500 });
        if (!result.data) {
          const concurrentEntry = await getTodayEntry(db, session.id, workDate);
          return NextResponse.json({
            ok: false,
            error: concurrentEntry?.clock_out_at ? "This attendance session was updated in another tab. Try again." : "You are already clocked in.",
            entry: concurrentEntry,
          }, { status: 409 });
        }
        data = result.data;
      } else {
        const payload = {
          team_member_id: session.id,
          work_date: workDate,
          work_mode: workMode,
          office_required: officeRequired,
          attendance_status: status,
          current_status: "available",
          clock_in_at: now,
          session_started_at: now,
          sessions: [],
          clock_in_lat: loc.latitude,
          clock_in_lng: loc.longitude,
          clock_in_accuracy: loc.accuracy,
          clock_in_distance_meters: geo.distance,
          clock_in_inside_geofence: geo.inside,
          geofence_bypass_code_id: bypassCode?.id ?? null,
          geofence_bypass_reason: bypassCode?.reason ?? null,
          clock_in_face_verified: false,
          clock_in_face_event_id: null,
          flags,
          scores: attendanceScores(status, 0, 0),
          ...commonLocationPatch,
        };
        const result = await db
          .from("team_time_entries")
          // Never overwrite an existing attendance row during a concurrent
          // check-in. The daily unique constraint is the final race guard.
          .insert(payload)
          .select("*")
          .single();
        if (result.error) {
          if (String(result.error.code || "") === "23505") {
            const concurrentEntry = await getTodayEntry(db, session.id, workDate);
            return NextResponse.json({
              ok: false,
              error: concurrentEntry?.clock_out_at ? "You have already completed this attendance session." : "You are already clocked in.",
              entry: concurrentEntry,
            }, { status: 409 });
          }
          return NextResponse.json({ ok: false, error: result.error.message }, { status: 500 });
        }
        data = result.data;
      }
      entry = data;
      if (bypassCode) {
        await db
          .from("team_geofence_bypass_codes")
          .update({
            used_by: session.id,
            used_entry_id: entry.id,
            used_at: now,
          })
          .eq("id", bypassCode.id);
      }
      await logEvent(db, req, {
        entry,
        memberId: session.id,
        eventType: "clock_in",
        workDate,
        toStatus: "available",
        location: loc,
        distance: geo.distance,
        inside: geo.inside,
        flags,
        metadata: {
          work_mode: workMode,
          office_required: officeRequired,
          night_session: isNightRecheckIn,
          session_number: sessionNumber,
          geofence_bypass_code_id: bypassCode?.id ?? null,
          geofence_bypass_reason: bypassCode?.reason ?? null,
        },
      });
      {
        const statusLabel = status === "on_time" ? "on time" : String(status).replace(/_/g, " ");
        const where = bypassCode
          ? "with a bypass code"
          : isNightRecheckIn
            ? "as a night work session"
          : geo.inside
            ? "inside the office geofence"
            : geo.distance != null
              ? `~${geo.distance >= 1000 ? `${(geo.distance / 1000).toFixed(1)}km` : `${geo.distance}m`} from the office`
              : "location unavailable";
        void notifySuperAdmin({
          type: "team_checkin",
          title: `${session.full_name} checked in`,
          message: `${session.full_name} clocked in ${statusLabel} (${where})${sessionNumber > 1 ? ` - session ${sessionNumber} of ${MAX_DAILY_SESSIONS} today` : ""}.`,
          link: "/admin/work-tracking",
        });
      }
      return NextResponse.json({ ok: true, entry: { ...entry, effective_status: statusForEntry(entry, profile.flexible_break_enabled) } });
    }

    if (action === "clock_out" && entry?.clock_in_at && entry.clock_out_at) {
      const wasAutomaticallyClosed = Array.isArray(entry.flags) && entry.flags.includes("auto_clock_out");
      return NextResponse.json({
        ok: true,
        entry: { ...entry, effective_status: statusForEntry(entry, profile.flexible_break_enabled) },
        already_clocked_out: true,
        attendance_preserved: true,
        message: wasAutomaticallyClosed
          ? "Your attendance was already safely checked out. Your original check-in and worked time remain recorded."
          : "You were already checked out. Your attendance remains recorded.",
      });
    }

    if (!entry?.clock_in_at) {
      return NextResponse.json({ ok: false, error: "Clock in first." }, { status: 400 });
    }

    if (entry.clock_out_at) {
      return NextResponse.json({ ok: false, error: "You are not currently clocked in." }, { status: 400 });
    }

    if (action === "break_start" || action === "break_end") {
      const fromStatus = entry.current_status;
      const patch = action === "break_start"
        ? { break_start_at: entry.break_start_at ?? now, current_status: "on_break", ...commonLocationPatch }
        : { break_end_at: now, current_status: "available", ...commonLocationPatch };
      const { data, error } = await db
        .from("team_time_entries")
        .update(patch)
        .eq("id", entry.id)
        .select("*")
        .single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      await logEvent(db, req, {
        entry: data,
        memberId: session.id,
        eventType: action,
        workDate,
        fromStatus,
        toStatus: data.current_status,
        location: loc,
        distance: geo.distance,
        inside: geo.inside,
        flags: geo.flags,
      });
      return NextResponse.json({ ok: true, entry: { ...data, effective_status: statusForEntry(data, profile.flexible_break_enabled) } });
    }

    if (action === "status_update") {
      const status = String(body?.status || "");
      if (!["available", "busy", "in_meeting", "on_break"].includes(status)) {
        return NextResponse.json({ ok: false, error: "Invalid status." }, { status: 400 });
      }
      const fromStatus = entry.current_status;
      const { data, error } = await db
        .from("team_time_entries")
        .update({ current_status: status, ...commonLocationPatch })
        .eq("id", entry.id)
        .select("*")
        .single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      await logEvent(db, req, {
        entry: data,
        memberId: session.id,
        eventType: "status_update",
        workDate,
        fromStatus,
        toStatus: status,
        location: loc,
        distance: geo.distance,
        inside: geo.inside,
        flags: geo.flags,
      });
      return NextResponse.json({ ok: true, entry: { ...data, effective_status: statusForEntry(data, profile.flexible_break_enabled) } });
    }

    if (action === "location_ping") {
      const { data, error } = await db
        .from("team_time_entries")
        .update(commonLocationPatch)
        .eq("id", entry.id)
        .select("*")
        .single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      await logEvent(db, req, {
        entry: data,
        memberId: session.id,
        eventType: "location_ping",
        workDate,
        fromStatus: entry.current_status,
        toStatus: entry.current_status,
        location: loc,
        distance: geo.distance,
        inside: geo.inside,
        flags: geo.flags,
      });
      return NextResponse.json({ ok: true, entry: data });
    }

    if (action === "clock_out") {
      // Minutes for the CURRENT session only (session_started_at is null on
      // entries created before multi-session support - fall back to clock_in_at),
      // then accumulate with any earlier completed sessions today.
      const locationMeasured = hasLocation(loc);
      const sessionStart = entry.session_started_at || entry.clock_in_at;
      const priorSessions = Array.isArray(entry.sessions) ? entry.sessions : [];
      const sessionMinutes = workMinutes(sessionStart, now, entry.break_start_at, entry.break_end_at);
      const totalMinutes = priorSessions.reduce((sum: number, s: any) => sum + (Number(s?.minutes) || 0), 0) + sessionMinutes;
      const sessions = [...priorSessions, { clock_in_at: sessionStart, clock_out_at: now, minutes: sessionMinutes }];
      const overtime = overtimeMinutes(now);
      const early = isEarlyLogout(now);
      const flags = Array.from(new Set([...(entry.flags ?? []), ...geo.flags, ...(early ? ["early_logout"] : [])]));
      const scores = attendanceScores(entry.attendance_status, totalMinutes, overtime);
      const { data, error } = await db
        .from("team_time_entries")
        .update({
          clock_out_at: now,
          sessions,
          clock_out_lat: locationMeasured ? loc.latitude : null,
          clock_out_lng: locationMeasured ? loc.longitude : null,
          clock_out_accuracy: locationMeasured ? loc.accuracy : null,
          clock_out_distance_meters: locationMeasured ? geo.distance : null,
          clock_out_inside_geofence: locationMeasured ? geo.inside : null,
          current_status: "offline",
          total_work_minutes: totalMinutes,
          overtime_minutes: overtime,
          early_logout: early,
          flags,
          scores,
          ...commonLocationPatch,
        })
        .eq("id", entry.id)
        .is("clock_out_at", null)
        .select("*")
        .maybeSingle();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      // A cron or another tab may have closed the row while this request was
      // calculating totals. Treat that as a successful, preserved checkout.
      if (!data) {
        const latest = await getTodayEntry(db, session.id, workDate);
        return NextResponse.json({
          ok: true,
          entry: latest ? { ...latest, effective_status: statusForEntry(latest, profile.flexible_break_enabled) } : entry,
          already_clocked_out: true,
          attendance_preserved: true,
          message: "Your attendance is checked out and your worked time remains recorded.",
        });
      }

      await db
        .from("team_work_tracking_sessions")
        .update({ status: "stopped", ended_at: now, pause_reason: "attendance_closed" })
        .eq("team_member_id", session.id)
        .eq("work_date", workDate)
        .in("status", ["active", "paused"]);
      await logEvent(db, req, {
        entry: data,
        memberId: session.id,
        eventType: "clock_out",
        workDate,
        fromStatus: entry.current_status,
        toStatus: "offline",
        location: loc,
        distance: locationMeasured ? geo.distance : null,
        inside: locationMeasured ? geo.inside : null,
        flags,
        metadata: { total_work_minutes: totalMinutes, overtime_minutes: overtime, early_logout: early, session_number: sessions.length },
      });
      void notifySuperAdmin({
        type: "team_checkout",
        title: `${session.full_name} clocked out`,
        message: `${session.full_name} clocked out after ${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m${early ? " (early logout)" : ""}${overtime > 0 ? ` with ${overtime}m overtime` : ""}${sessions.length > 1 ? ` (session ${sessions.length} of ${MAX_DAILY_SESSIONS})` : ""}.`,
        link: "/admin/timebook",
      });
      return NextResponse.json({
        ok: true,
        entry: { ...data, effective_status: statusForEntry(data, profile.flexible_break_enabled) },
        attendance_preserved: true,
        message: "Checked out. Your attendance and worked time have been recorded.",
      });
    }

    return NextResponse.json({ ok: false, error: "Unsupported timebook action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Timebook action failed." },
      { status: 500 },
    );
  }
}
