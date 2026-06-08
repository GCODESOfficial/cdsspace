/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { getTeamSession } from "@/lib/team-auth";
import {
  attendanceScores,
  attendanceStatus,
  isEarlyLogout,
  lagosDate,
  lagosMinutes,
  locationFlags,
  officeRequiredFor,
  overtimeMinutes,
  TIMEBOOK_SCHEDULE,
  workMinutes,
  type WorkMode,
} from "@/lib/timebook";

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
  const loc = body?.location ?? {};
  return {
    latitude: loc.latitude == null ? null : Number(loc.latitude),
    longitude: loc.longitude == null ? null : Number(loc.longitude),
    accuracy: loc.accuracy == null ? null : Number(loc.accuracy),
    clientCapturedAt: loc.captured_at || null,
  };
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

async function recentFaceVerification(db: any, memberId: string) {
  const { data: profile, error: profileError } = await db
    .from("team_face_profiles")
    .select("status, last_verified_at")
    .eq("team_member_id", memberId)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!profile || profile.status !== "active" || !profile.last_verified_at) return null;
  const verifiedAt = new Date(profile.last_verified_at).getTime();
  if (!Number.isFinite(verifiedAt) || Date.now() - verifiedAt > 16 * 60 * 60 * 1000) return null;
  const { data: event } = await db
    .from("team_face_verification_events")
    .select("id, created_at")
    .eq("team_member_id", memberId)
    .eq("success", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return event || { id: null, created_at: profile.last_verified_at };
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
    const profile = await ensureProfile(db, session.id);
    const entry = await getTodayEntry(db, session.id, workDate);

    const { data: history } = await db
      .from("team_time_entries")
      .select("*")
      .eq("team_member_id", session.id)
      .order("work_date", { ascending: false })
      .limit(30);

    const { data: leaveRequests } = await db
      .from("team_leave_requests")
      .select("*")
      .eq("team_member_id", session.id)
      .order("created_at", { ascending: false })
      .limit(8);

    return NextResponse.json({
      ok: true,
      profile,
      today: entry ? { ...entry, effective_status: statusForEntry(entry, profile.flexible_break_enabled) } : null,
      work_date: workDate,
      office_required: officeRequiredFor(profile.work_mode, profile.hybrid_office_days ?? [], workDate),
      history: history ?? [],
      leave_requests: leaveRequests ?? [],
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
    const profile = await ensureProfile(db, session.id);
    const workMode = (profile.work_mode || "onsite") as WorkMode;
    const officeRequired = officeRequiredFor(workMode, profile.hybrid_office_days ?? [], workDate);

    if (action === "request_leave") {
      const { leave_type, start_date, end_date, reason } = body;
      if (!leave_type || !start_date || !end_date) {
        return NextResponse.json({ ok: false, error: "Leave type and dates are required." }, { status: 400 });
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

    let entry = await getTodayEntry(db, session.id, workDate);
    const now = new Date().toISOString();
    const loc = locationFromBody(body);
    const geo = locationFlags(loc);
    const commonLocationPatch = {
      last_location_lat: loc.latitude,
      last_location_lng: loc.longitude,
      last_location_accuracy: loc.accuracy,
      last_location_distance_meters: geo.distance,
      last_location_inside_geofence: geo.inside,
      last_location_at: now,
    };

    if (action === "clock_in") {
      const faceEvent = await recentFaceVerification(db, session.id);
      if (!faceEvent) {
        return NextResponse.json({
          ok: false,
          error: "Fresh face verification is required before clock-in. Please sign out and sign in again with face verification.",
          requires_face_verification: true,
        }, { status: 403 });
      }
      if (workMode === "approved_leave") {
        return NextResponse.json({ ok: false, error: "Your work mode is set to approved leave." }, { status: 400 });
      }
      if (entry?.clock_in_at && !entry.clock_out_at) {
        return NextResponse.json({ ok: false, error: "You are already clocked in.", entry }, { status: 409 });
      }
      let bypassCode: any = null;
      if (officeRequired && !geo.inside) {
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
          return NextResponse.json({
            ok: false,
            error: "Office geofence check failed. You must be within 150m of CDS Space HQ to clock in today, or use a super-admin bypass code.",
            allow_bypass: true,
            distance_meters: geo.distance,
            flags: geo.flags,
          }, { status: 403 });
        }
      }

      const status = attendanceStatus(now);
      const flags = Array.from(new Set([
        ...geo.flags,
        ...(bypassCode ? ["geofence_bypass"] : []),
      ]));
      const payload = {
        team_member_id: session.id,
        work_date: workDate,
        work_mode: workMode,
        office_required: officeRequired,
        attendance_status: status,
        current_status: "available",
        clock_in_at: now,
        clock_in_lat: loc.latitude,
        clock_in_lng: loc.longitude,
        clock_in_accuracy: loc.accuracy,
        clock_in_distance_meters: geo.distance,
        clock_in_inside_geofence: geo.inside,
        geofence_bypass_code_id: bypassCode?.id ?? null,
        geofence_bypass_reason: bypassCode?.reason ?? null,
        clock_in_face_verified: true,
        clock_in_face_event_id: faceEvent.id,
        flags,
        scores: attendanceScores(status, 0, 0),
        ...commonLocationPatch,
      };
      const { data, error } = await db
        .from("team_time_entries")
        .upsert(payload, { onConflict: "team_member_id,work_date" })
        .select("*")
        .single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
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
          geofence_bypass_code_id: bypassCode?.id ?? null,
          geofence_bypass_reason: bypassCode?.reason ?? null,
        },
      });
      return NextResponse.json({ ok: true, entry: { ...entry, effective_status: statusForEntry(entry, profile.flexible_break_enabled) } });
    }

    if (!entry?.clock_in_at) {
      return NextResponse.json({ ok: false, error: "Clock in first." }, { status: 400 });
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
      const totalMinutes = workMinutes(entry.clock_in_at, now, entry.break_start_at, entry.break_end_at);
      const overtime = overtimeMinutes(now);
      const early = isEarlyLogout(now);
      const flags = Array.from(new Set([...(entry.flags ?? []), ...geo.flags, ...(early ? ["early_logout"] : [])]));
      const scores = attendanceScores(entry.attendance_status, totalMinutes, overtime);
      const { data, error } = await db
        .from("team_time_entries")
        .update({
          clock_out_at: now,
          clock_out_lat: loc.latitude,
          clock_out_lng: loc.longitude,
          clock_out_accuracy: loc.accuracy,
          clock_out_distance_meters: geo.distance,
          clock_out_inside_geofence: geo.inside,
          current_status: "offline",
          total_work_minutes: totalMinutes,
          overtime_minutes: overtime,
          early_logout: early,
          flags,
          scores,
          ...commonLocationPatch,
        })
        .eq("id", entry.id)
        .select("*")
        .single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      await logEvent(db, req, {
        entry: data,
        memberId: session.id,
        eventType: "clock_out",
        workDate,
        fromStatus: entry.current_status,
        toStatus: "offline",
        location: loc,
        distance: geo.distance,
        inside: geo.inside,
        flags,
        metadata: { total_work_minutes: totalMinutes, overtime_minutes: overtime, early_logout: early },
      });
      return NextResponse.json({ ok: true, entry: data });
    }

    return NextResponse.json({ ok: false, error: "Unsupported timebook action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Timebook action failed." },
      { status: 500 },
    );
  }
}
