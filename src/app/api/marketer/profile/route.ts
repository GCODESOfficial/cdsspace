import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/glashdb/server";
import { getVerifiedAuthUser } from "@/lib/glashdb/auth-user";

export async function PATCH(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (await createClient()) as any;
  const user = await getVerifiedAuthUser(db.auth);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const fullName = String(body.fullName || "").trim();
  const displayName = String(body.displayName || fullName).trim();
  const phoneNumber = String(body.phoneNumber || "").trim();
  const country = String(body.country || "").trim();
  const code = String(body.marketerCode || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!fullName || !displayName || !phoneNumber || !country) return NextResponse.json({ error: "Name, display name, phone and country are required." }, { status: 400 });
  if (!/^[A-Z][A-Z0-9]{3,23}$/.test(code)) return NextResponse.json({ error: "Code must start with a letter and contain 4–24 letters or numbers." }, { status: 400 });
  const { data: taken } = await db.from("brand_marketers").select("user_id").eq("marketer_code", code).neq("user_id", user.id).maybeSingle();
  if (taken) return NextResponse.json({ error: "That marketer code is already in use." }, { status: 409 });
  const patch = { full_name: fullName, display_name: displayName, phone_number: phoneNumber, country, city: String(body.city || "").trim() || null, address: String(body.address || "").trim() || null, profile_photo_url: String(body.profilePhotoUrl || "").trim() || null, marketer_code: code, status: "active", profile_completed_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const { data, error } = await db.from("brand_marketers").update(patch).eq("user_id", user.id).select("*").single();
  if (error) return NextResponse.json({ error: /duplicate|unique/i.test(error.message) ? "That marketer code is already in use." : error.message }, { status: 400 });
  return NextResponse.json({ profile: data });
}
