import type { Metadata } from "next";
import CareerClient from "../../CareerClient";
import { fetchRoleMeta, roleTypeLabel } from "@/lib/careers/role-meta";

const SITE_URL = "https://cdsspace.pro";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
    const { id } = await params;
    const role = await fetchRoleMeta(id);
    const url = `${SITE_URL}/Career/role/${id}`;

    if (!role) {
        return {
            title: "Open Role - CDS Space Careers",
            description: "This role link is no longer available. Browse current openings at CDS Space.",
            alternates: { canonical: url },
        };
    }

    const typeLabel = roleTypeLabel(role.role_type);
    const where = role.location || "CDS Space";
    const title = `${role.title} - CDS Space Careers`;
    const description = `${typeLabel} · ${where}. Apply for the ${role.title} role at CDS Space.`;

    return {
        title,
        description,
        alternates: { canonical: url },
        openGraph: {
            title,
            description,
            url,
            siteName: "CDS Space",
            type: "article",
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
        },
    };
}

export default async function RoleSharePage({ params }: { params: Params }) {
    const { id } = await params;
    return <CareerClient initialRoleId={id} />;
}
