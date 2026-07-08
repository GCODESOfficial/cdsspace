import { NextResponse } from "next/server";
import { getTeamSession } from "@/lib/team-auth";
import { glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RecentProject = {
  id: string;
  title: string;
  category: string | null;
  cover_image: string | null;
  updated_at: string;
};

type Meeting = {
  id: string;
  title: string;
  scheduled_for: string | null;
  room_code: string;
  status: string;
};

export async function GET() {
  const session = await getTeamSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Independent lookups run together to keep the overview snappy.
  const [projects, unreadMessages, meetingIds, resumeRows] = await Promise.all([
    glashQuery<RecentProject>(
      `select distinct p.id,
              p.name as title,
              p.category,
              null::text as cover_image,
              p.updated_at
         from public.finance_projects p
         left join public.project_assignments pa on pa.project_id = p.id
        where p.status <> 'archived'
          and (
            p.project_manager_id = $1
            or p.department_lead_id = $1
            or pa.team_member_id = $1
            or (
              pa.department is not null
              and (
                lower(pa.department) = lower(coalesce($2::text, ''))
                or exists (
                  select 1 from public.team_member_departments tmd
                    join public.departments d on d.id = tmd.department_id
                   where tmd.team_member_id = $1 and lower(d.name) = lower(pa.department)
                )
              )
            )
          )
        order by p.updated_at desc
        `,
      [session.id, session.department ?? ""],
    ).catch(() => []),
    glashQuery<{ id: string }>(
      `select id
         from public.team_notifications
        where recipient_id = $1
          and kind = 'chat_message'
          and read_at is null`,
      [session.id],
    ).catch(() => []),
    glashQuery<{ meeting_id: string }>(
      `select meeting_id
         from public.team_meeting_participants
        where team_member_id = $1`,
      [session.id],
    ).catch(() => []),
    glashQuery<Record<string, unknown>>(
      `select headline, about, avatar_url, location, skills, past_roles, projects, education
         from public.team_resumes
        where team_member_id = $1
        limit 1`,
      [session.id],
    ).catch(() => []),
  ]);

  // Resume completion — the share of key profile fields that are filled in.
  // Drives the "finish your resume" nudge on the overview.
  const resume = resumeRows[0] || null;
  const RESUME_FIELDS = ["headline", "about", "avatar_url", "location", "skills", "past_roles", "projects", "education"];
  const isFilled = (v: unknown) => {
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "string") return v.trim().length > 0;
    return true;
  };
  const resumeCompletion = resume
    ? Math.round((RESUME_FIELDS.filter((k) => isFilled(resume[k])).length / RESUME_FIELDS.length) * 100)
    : 0;

  let upcomingMeetings: Meeting[] = [];
  if (meetingIds.length) {
    upcomingMeetings = await glashQuery<Meeting>(
      `select id, title, scheduled_for, room_code, status
         from public.team_meetings
        where id = any($1::uuid[])
          and status = any($2::text[])
        order by scheduled_for asc nulls last
        limit 5`,
      [meetingIds.map((row) => row.meeting_id), ["scheduled", "live"]],
    ).catch(() => []);
  }

  const recentProjects = projects.slice(0, 5);

  return NextResponse.json({
    ok: true,
    data: {
      member: { full_name: session.full_name, role_title: session.role_title },
      stats: {
        assigned_work: projects.length,
        unread_messages: unreadMessages.length,
        upcoming_meetings: upcomingMeetings.length,
      },
      recent_work: recentProjects,
      upcoming_meetings: upcomingMeetings,
      resume_completion: resumeCompletion,
    },
  });
}
