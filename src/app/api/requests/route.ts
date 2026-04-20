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

        const { data: requests, error: fetchError } = await supabaseAdmin!
            .from("design_requests")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

        if (fetchError) {
            console.error("Supabase fetch error:", fetchError);
            return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
        }

        return NextResponse.json({ requests });
    } catch (error) {
        console.error("API Error [requests]:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { title, description, category, asset_paths } = body;

        // 1. Get current count to generate sequential ID
        const { count, error: countError } = await supabaseAdmin!
            .from("design_requests")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id);

        if (countError) {
            console.error("Supabase count error:", countError);
            return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
        }

        const displayId = `REQ-${String((count ?? 0) + 1).padStart(3, "0")}`;

        // 2. Insert the new design request
        const insertPayload: any = {
            user_id: user.id,
            display_id: displayId,
            title,
            description,
            status: "PENDING",
        };
        if (category) insertPayload.category = category;
        if (asset_paths) insertPayload.asset_paths = asset_paths;

        const { data: newRequest, error: insertError } = await supabaseAdmin!
            .from("design_requests")
            .insert(insertPayload)
            .select()
            .single();

        if (insertError) {
            console.error("Supabase insert error:", insertError);
            return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
        }

        // 3. Increment design_count in user's active subscription
        // Fetch current design_count first, then update
        const { data: subscription } = await supabaseAdmin!
            .from("subscriptions")
            .select("id, design_count")
            .eq("user_id", user.id)
            .eq("status", "active")
            .limit(1)
            .maybeSingle();

        if (subscription) {
            await supabaseAdmin!
                .from("subscriptions")
                .update({ design_count: (subscription.design_count ?? 0) + 1 })
                .eq("id", subscription.id);
        }

        return NextResponse.json({ request: newRequest });
    } catch (error) {
        console.error("API Error [requests POST]:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ error: "Missing ID" }, { status: 400 });
        }

        // Find the request
        const { data: req, error: findError } = await supabaseAdmin!
            .from("design_requests")
            .select("*")
            .eq("id", id)
            .eq("user_id", user.id)
            .maybeSingle();

        if (findError) {
            console.error("Supabase find error:", findError);
            return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
        }

        if (!req) {
            return NextResponse.json({ error: "Request not found" }, { status: 404 });
        }

        // If status is PENDING or IN_REVIEW, decrement design_count
        if (req.status === "PENDING" || req.status === "IN_REVIEW") {
            const { data: subscription } = await supabaseAdmin!
                .from("subscriptions")
                .select("id, design_count")
                .eq("user_id", user.id)
                .eq("status", "active")
                .limit(1)
                .maybeSingle();

            if (subscription) {
                await supabaseAdmin!
                    .from("subscriptions")
                    .update({ design_count: Math.max((subscription.design_count ?? 0) - 1, 0) })
                    .eq("id", subscription.id);
            }
        }

        // Delete the request
        const { error: deleteError } = await supabaseAdmin!
            .from("design_requests")
            .delete()
            .eq("id", id)
            .eq("user_id", user.id);

        if (deleteError) {
            console.error("Supabase delete error:", deleteError);
            return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("API Error [requests DELETE]:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
