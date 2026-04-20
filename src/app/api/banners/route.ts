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

        const { data: banners, error: fetchError } = await supabaseAdmin!
            .from("banner_requests")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

        if (fetchError) {
            console.error("Supabase fetch error:", fetchError);
            return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
        }

        return NextResponse.json({ banners });
    } catch (error) {
        console.error("API Error [banners GET]:", error);
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
        const { title, size, quality, environment, executionMode, designBrief, quantity, fulfillmentType, shipping, status } = body;

        // Generate sequential display ID (BNR-001, BNR-002, etc.)
        const { count, error: countError } = await supabaseAdmin!
            .from("banner_requests")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id);

        if (countError) {
            console.error("Supabase count error:", countError);
            return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
        }

        const displayId = `BNR-${String((count ?? 0) + 1).padStart(3, "0")}`;

        const { data: newBanner, error: insertError } = await supabaseAdmin!
            .from("banner_requests")
            .insert({
                user_id: user.id,
                display_id: displayId,
                title: title || "Untitled Banner",
                size: size || "85x200",
                quality: quality || "Standard",
                environment: environment || "Indoor",
                execution_mode: executionMode || "Create",
                design_brief: designBrief,
                quantity: typeof quantity === "string" ? (parseInt(quantity) || 1) : (quantity || 1),
                fulfillment_type: fulfillmentType || "Door-to-door",
                country: shipping?.country,
                state: shipping?.state,
                city: shipping?.city,
                street_address: shipping?.streetAddress,
                recipient_name: shipping?.recipientName,
                phone_number: shipping?.phoneNumber,
                instructions: shipping?.instructions,
                pickup_station: shipping?.pickupStation,
                status: status || "PENDING",
            })
            .select()
            .single();

        if (insertError) {
            console.error("Supabase insert error:", insertError);
            return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
        }

        return NextResponse.json({ banner: newBanner });
    } catch (error) {
        console.error("API Error [banners POST]:", error);
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
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json({ error: "Missing Banner ID" }, { status: 400 });
        }

        const { data: updatedBanner, error: updateError } = await supabaseAdmin!
            .from("banner_requests")
            .update(updates)
            .eq("id", id)
            .eq("user_id", user.id)
            .select()
            .single();

        if (updateError) {
            console.error("Supabase update error:", updateError);
            return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
        }

        return NextResponse.json({ banner: updatedBanner });
    } catch (error) {
        console.error("API Error [banners PATCH]:", error);
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

        const { error: deleteError } = await supabaseAdmin!
            .from("banner_requests")
            .delete()
            .eq("id", id)
            .eq("user_id", user.id);

        if (deleteError) {
            console.error("Supabase delete error:", deleteError);
            return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("API Error [banners DELETE]:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
