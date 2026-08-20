import { NextResponse } from "next/server";
import { verifyAdmin, verifyUser } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { isLegacyClientUuid } from "@/lib/client-routes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const admin = await verifyAdmin();
    const userSession = await verifyUser();

    if (!admin && !userSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientActorRequested = searchParams.get("actor") === "client";
    if (clientActorRequested && !userSession) {
      return NextResponse.json({ error: "Client session required" }, { status: 401 });
    }

    const isAdmin = !!admin && !clientActorRequested;
    const userId = isAdmin ? admin.id : userSession!.user.id;
    // Environment-authenticated admins do not necessarily have a profiles row.
    // Notifications are profile-scoped UUIDs, so never query the UUID column with
    // the email fallback returned by the legacy admin session helper.
    if (isAdmin && !isLegacyClientUuid(userId)) {
      return NextResponse.json({ notifications: [] });
    }

    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    let query = supabaseAdmin
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.eq("is_read", false);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ notifications: data });
  } catch (err) {
    console.error("GET /api/notifications error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await verifyAdmin();
    const userSession = await verifyUser();

    if (!admin && !userSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { ids, markAll } = body;

    const clientActorRequested = body.actor === "client";
    if (clientActorRequested && !userSession) {
      return NextResponse.json({ error: "Client session required" }, { status: 401 });
    }

    const isAdmin = !!admin && !clientActorRequested;
    const userId = isAdmin ? admin.id : userSession!.user.id;
    if (isAdmin && !isLegacyClientUuid(userId)) {
      return NextResponse.json({ success: true });
    }

    if (!ids && !markAll) {
      return NextResponse.json(
        { error: "ids or markAll is required" },
        { status: 400 }
      );
    }

    let query = supabaseAdmin
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (!markAll && ids && Array.isArray(ids)) {
      query = query.in("id", ids);
    }

    const { error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PATCH /api/notifications error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
