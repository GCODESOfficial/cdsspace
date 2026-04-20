import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Find first active subscription for user, join profiles
        const { data: subscription, error: fetchError } = await supabaseAdmin!
            .from("subscriptions")
            .select("*, user:profiles(*)")
            .eq("user_id", user.id)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (fetchError) {
            console.error("Supabase fetch error:", fetchError);
            return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
        }

        // Monthly Reset Logic
        if (subscription) {
            const now = new Date();
            const lastReset = new Date(subscription.last_reset_at || subscription.created_at);

            // If month or year has changed since last reset
            if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
                const { data: updated, error: updateError } = await supabaseAdmin!
                    .from("subscriptions")
                    .update({
                        design_count: 0,
                        last_reset_at: now.toISOString(),
                    })
                    .eq("id", subscription.id)
                    .select("*, user:profiles(*)")
                    .single();

                if (updateError) {
                    console.error("Supabase update error:", updateError);
                    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
                }

                return NextResponse.json({ subscription: updated });
            }
        }

        return NextResponse.json({ subscription });
    } catch (error) {
        console.error("API Error [subscription]:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { plan } = body;

        if (!plan) {
            return NextResponse.json({ error: "Missing plan" }, { status: 400 });
        }

        const { data: updated, error: updateError } = await supabaseAdmin!
            .from("subscriptions")
            .update({ plan })
            .eq("user_id", user.id)
            .eq("status", "active")
            .select();

        if (updateError) {
            console.error("Supabase update error:", updateError);
            return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
        }

        return NextResponse.json({ success: true, updated });
    } catch (error) {
        console.error("API Error [subscription PATCH]:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
