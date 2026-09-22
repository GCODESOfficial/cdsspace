import { ImageResponse } from "next/og";
import { supabaseAdmin } from "@/lib/supabase";
import { OG_CONTENT_TYPE, OG_SIZE, renderSolidBlueCard } from "@/lib/og/brand-card";
import { getOgFonts } from "@/lib/og/fonts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "cMeet meeting invitation";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

type Params = Promise<{ code: string }>;

export default async function Image({ params }: { params: Params }) {
  const { code } = await params;
  const fonts = getOgFonts();

  try {
    if (!supabaseAdmin) throw new Error("Meeting service unavailable");
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const db = supabaseAdmin as any;
    const { data } = await db
      .from("team_meetings")
      .select("title")
      .eq("room_code", code)
      .maybeSingle();

    if (!data) {
      return new ImageResponse(
        await renderSolidBlueCard({
          eyebrow: "cMeet",
          title: "Meeting invitation",
          showDomain: false,
        }),
        { ...size, fonts },
      );
    }

    const topic = String(data.title || "Meeting invitation").trim();
    return new ImageResponse(
      await renderSolidBlueCard({ eyebrow: "cMeet", title: topic, showDomain: false }),
      { ...size, fonts },
    );
  } catch {
    return new ImageResponse(
      await renderSolidBlueCard({
        eyebrow: "cMeet",
        title: "Meeting invitation",
        showDomain: false,
      }),
      { ...size, fonts },
    );
  }
}
