import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Try design_requests first
    const { data: designRequest, error: designError } = await supabaseAdmin
      .from("design_requests")
      .select("*, profiles!user_id(id, email, full_name, company_name, avatar_url)")
      .eq("id", id)
      .maybeSingle();

    if (designError) {
      throw designError;
    }

    let order = designRequest;
    let orderType = "design_request";

    // If not found in design_requests, try banner_requests
    if (!order) {
      const { data: bannerRequest, error: bannerError } = await supabaseAdmin
        .from("banner_requests")
        .select("*, profiles!user_id(id, email, full_name, company_name, avatar_url)")
        .eq("id", id)
        .maybeSingle();

      if (bannerError) {
        throw bannerError;
      }

      if (!bannerRequest) {
        return NextResponse.json(
          { error: "Order not found" },
          { status: 404 }
        );
      }

      order = bannerRequest;
      orderType = "banner_request";
    }

    // Fetch status_updates history for this order
    const { data: statusUpdates, error: statusError } = await supabaseAdmin
      .from("status_updates")
      .select("*")
      .eq("entity_id", id)
      .order("created_at", { ascending: false });

    if (statusError) {
      throw statusError;
    }

    return NextResponse.json({
      order,
      order_type: orderType,
      status_updates: statusUpdates ?? [],
    });
  } catch (error) {
    console.error("Admin order GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { status, admin_notes } = body;

    // Determine which table the order belongs to
    const { data: designCheck } = await supabaseAdmin
      .from("design_requests")
      .select("id, status, user_id")
      .eq("id", id)
      .maybeSingle();

    let table: "design_requests" | "banner_requests";
    let entityType: string;
    let previousStatus: string | null = null;
    let userId: string | null = null;

    if (designCheck) {
      table = "design_requests";
      entityType = "design_request";
      previousStatus = designCheck.status;
      userId = designCheck.user_id;
    } else {
      const { data: bannerCheck } = await supabaseAdmin
        .from("banner_requests")
        .select("id, status, user_id")
        .eq("id", id)
        .maybeSingle();

      if (!bannerCheck) {
        return NextResponse.json(
          { error: "Order not found" },
          { status: 404 }
        );
      }

      table = "banner_requests";
      entityType = "banner_request";
      previousStatus = bannerCheck.status;
      userId = bannerCheck.user_id;
    }

    // Build update payload
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (status !== undefined) {
      updateData.status = status;
    }
    if (admin_notes !== undefined) {
      updateData.admin_notes = admin_notes;
    }

    // Update the order
    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from(table)
      .update(updateData)
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) {
      throw updateError;
    }

    // If status changed, insert status_update and notification
    if (status && status !== previousStatus) {
      const adminEmail =
        "email" in admin ? (admin as { email: string }).email : "admin";

      // Insert status update record
      const { error: statusInsertError } = await supabaseAdmin
        .from("status_updates")
        .insert({
          entity_type: entityType,
          entity_id: id,
          previous_status: previousStatus,
          new_status: status,
          note: admin_notes ?? null,
          updated_by: adminEmail,
        });

      if (statusInsertError) {
        console.error("Failed to insert status update:", statusInsertError);
      }

      // Insert notification for the client
      if (userId) {
        const { error: notifError } = await supabaseAdmin
          .from("notifications")
          .insert({
            user_id: userId,
            type: "status_change",
            title: "Order Status Updated",
            message: `Your order status has been updated from ${previousStatus} to ${status}.`,
            link: `/orders/${id}`,
            is_read: false,
          });

        if (notifError) {
          console.error("Failed to insert notification:", notifError);
        }
      }
    }

    return NextResponse.json({ order: updatedOrder });
  } catch (error) {
    console.error("Admin order PATCH error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
