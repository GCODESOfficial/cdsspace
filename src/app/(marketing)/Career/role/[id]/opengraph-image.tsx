import { ImageResponse } from "next/og";
import { renderBrandCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/brand-card";
import { getOgFonts } from "@/lib/og/fonts";
import { fetchRoleMeta, roleTypeLabel } from "@/lib/careers/role-meta";

export const runtime = "nodejs";
export const alt = "Open role at CDS Space";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

type Params = Promise<{ id: string }>;

export default async function Image({ params }: { params: Params }) {
    const { id } = await params;
    const fonts = getOgFonts();

    const role = await fetchRoleMeta(id);

    if (!role) {
        return new ImageResponse(
            await renderBrandCard({
                eyebrow: "We're hiring",
                title: "Join CDS Space",
                description: "This role link is no longer available. Browse current openings at CDS Space.",
                domainPath: "/Career",
            }),
            { ...size, fonts },
        );
    }

    const typeLabel = roleTypeLabel(role.role_type);
    const where = role.location ? ` · ${role.location}` : "";

    return new ImageResponse(
        await renderBrandCard({
            eyebrow: typeLabel,
            title: role.title,
            description: `${typeLabel}${where} - Apply for the ${role.title} role at CDS Space.`,
            domainPath: "/Career",
        }),
        { ...size, fonts },
    );
}
