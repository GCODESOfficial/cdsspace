import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase";
import { buildProductMetadata } from "@/lib/product-metadata";
import ResumeClient from "./ResumeClient";

async function fetchResume(username: string) {
    if (!supabaseAdmin) return null;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const db = supabaseAdmin as any;
    const { data: member } = await db
        .from("team_members")
        .select("id, full_name, role_title, department, avatar_url, is_active")
        .eq("username", username.toLowerCase())
        .maybeSingle();
    if (!member || !member.is_active) return null;

    const { data: resume } = await db
        .from("team_resumes")
        .select("headline, about, avatar_url, is_public")
        .eq("team_member_id", member.id)
        .maybeSingle();
    if (!resume?.is_public) return { member, resume: null };
    return { member, resume };
}

function firstSentence(text?: string | null, max = 180) {
    if (!text) return "";
    const trimmed = text.trim().replace(/\s+/g, " ");
    const end = trimmed.search(/[.!?]\s/);
    const sentence = end > 0 ? trimmed.slice(0, end + 1) : trimmed;
    return sentence.length > max ? sentence.slice(0, max - 1) + "…" : sentence;
}

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
    const { username } = await params;
    const data = await fetchResume(username);
    if (!data?.resume) {
        return buildProductMetadata({
            product: "cResume",
            title: username,
            description: `View this CDS Space team member's public resume on cResume.`,
            path: `/${username}`,
        });
    }
    const name = data.member.full_name || username;
    const role = (data.resume.headline || data.member.role_title || data.member.department || "Team Member").trim();
    const bio = firstSentence(data.resume.about) || `${name} is a member of the CDS Space team shaping iconic brands across design, engineering, and strategy.`;
    const avatar = data.resume.avatar_url || data.member.avatar_url || undefined;

    return buildProductMetadata({
        product: "cResume",
        // Name comes first and bold-appearing because OG renderers render the title in bold.
        title: `${name} - ${role}`,
        description: bio,
        path: `/${username}`,
        image: avatar,
        imageAlt: `${name} - ${role}`,
    });
}

export default function Page() {
    return <ResumeClient />;
}
