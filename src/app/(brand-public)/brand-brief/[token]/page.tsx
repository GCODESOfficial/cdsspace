import type { Metadata } from "next";
import { getSupabaseAdmin } from "@/lib/supabase";
import { BrandBriefForm } from "./brand-brief-form";

type Params = Promise<{ token: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
    const { token } = await params;
    const sb = getSupabaseAdmin() as any;
    const { data } = await sb
        .from("brand_briefs")
        .select("invite_label, status, brand_name")
        .eq("public_token", token)
        .maybeSingle();

    const label = data?.brand_name || data?.invite_label || "Brand Brief";
    return {
        title: `${label} - Brand Brief · CDS Space`,
        description:
            "Tell us about your brand. Fill in a few questions so CDS Space can craft the right strategy for you - no account needed.",
        robots: { index: false, follow: false },
    };
}

export default async function Page({ params }: { params: Params }) {
    const { token } = await params;
    const sb = getSupabaseAdmin() as any;
    const { data } = await sb
        .from("brand_briefs")
        .select("*")
        .eq("public_token", token)
        .maybeSingle();

    if (!data) {
        return (
            <main className="min-h-[70vh] bg-brand-bg flex items-center justify-center px-6 py-16">
                <div className="max-w-md text-center bg-white rounded-3xl shadow-xl p-8 border border-gray-100">
                    <h1 className="text-xl font-bold text-[#0D1B39] mb-2">Link not found</h1>
                    <p className="text-gray-600 text-sm">
                        This brand-brief link is invalid. If you expected this to work, reach out to CDS Space
                        and ask for a fresh link.
                    </p>
                </div>
            </main>
        );
    }

    if (data.status === "archived") {
        return (
            <main className="min-h-[70vh] bg-brand-bg flex items-center justify-center px-6 py-16">
                <div className="max-w-md text-center bg-white rounded-3xl shadow-xl p-8 border border-gray-100">
                    <h1 className="text-xl font-bold text-[#0D1B39] mb-2">Link archived</h1>
                    <p className="text-gray-600 text-sm">
                        This brief link is no longer active. Please ask CDS Space for a new one.
                    </p>
                </div>
            </main>
        );
    }

    return <BrandBriefForm token={token} initial={data} />;
}
