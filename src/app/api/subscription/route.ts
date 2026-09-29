import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

async function loadPendingSubscription(userId: string) {
    const { data: pending, error } = await supabaseAdmin!
        .from("subscriptions")
        .select("id, plan, industry, design_quantity, amount, currency, invoice_id, created_at")
        .eq("user_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error || !pending) return null;

    const { data: invoice } = pending.invoice_id
        ? await supabaseAdmin!
            .from("finance_invoices")
            .select("invoice_number, public_token, total, currency, status")
            .eq("id", pending.invoice_id)
            .maybeSingle()
        : { data: null };
    return { ...pending, invoice: invoice || null };
}

// Billing is monthly from activation; the design allowance resets on the 1st of
// each month (see the reset below). Returned so clients can show both dates.
function billingDates(subscription: { activated_at?: string | null; created_at?: string | null } | null) {
    if (!subscription) return { next_billing_at: null, quota_resets_at: null };
    const now = new Date();
    const quotaReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const start = new Date(subscription.activated_at || subscription.created_at || now.toISOString());
    const next = new Date(start);
    while (next <= now) next.setUTCMonth(next.getUTCMonth() + 1);
    return { next_billing_at: next.toISOString(), quota_resets_at: quotaReset.toISOString() };
}

export async function GET() {
    try {
        const session = await verifyUser();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { user } = session;

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

        const pending = await loadPendingSubscription(user.id);

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

                return NextResponse.json({ subscription: updated, pending, ...billingDates(updated) });
            }
        }

        return NextResponse.json({ subscription, pending, ...billingDates(subscription) });
    } catch (error) {
        console.error("API Error [subscription]:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PATCH(_request: Request) {
    try {
        const session = await verifyUser();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        return NextResponse.json({
            error: "Plan changes require a priced checkout and verified payment.",
            checkout: "/api/subscription/checkout",
        }, { status: 409 });
    } catch (error) {
        console.error("API Error [subscription PATCH]:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
