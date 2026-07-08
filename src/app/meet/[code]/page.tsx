import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase";
import { buildProductMetadata } from "@/lib/product-metadata";
import MeetClient from "./MeetClient";

interface MeetingMeta {
    title: string | null;
    agenda: string | null;
    created_by: string | null;
    created_by_admin: string | null;
    scheduled_for: string | null;
    status: string | null;
}

async function fetchMeeting(code: string) {
    if (!supabaseAdmin) return null;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const db = supabaseAdmin as any;
    const { data: meeting } = await db
        .from("team_meetings")
        .select("title, agenda, created_by, created_by_admin, scheduled_for, status")
        .eq("room_code", code)
        .maybeSingle();
    if (!meeting) return null;

    let hostName: string | null = null;
    if (meeting.created_by) {
        const { data: host } = await db
            .from("team_members")
            .select("full_name")
            .eq("id", meeting.created_by)
            .maybeSingle();
        hostName = host?.full_name ?? null;
    } else if (meeting.created_by_admin) {
        hostName = "CDS Space Admin";
    }
    return { ...(meeting as MeetingMeta), hostName };
}

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
    const { code } = await params;
    const meeting = await fetchMeeting(code);
    const title = meeting?.title?.trim() || "Meeting Room";
    const host = meeting?.hostName?.trim();
    const description = host
        ? `Join "${title}" hosted by ${host} on cMeet - CDS Space's live meeting room.`
        : `Join "${title}" on cMeet - CDS Space's live meeting room.`;
    return buildProductMetadata({
        product: "cMeet",
        title: host ? `${title} with ${host}` : title,
        description,
        path: `/meet/${code}`,
    });
}

export default function Page() {
    return <MeetClient />;
}
