import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { code, whatsapp } = await req.json();

  if (!/^\+?[0-9]{7,15}$/.test(whatsapp)) {
    return NextResponse.json({ success: false, message: "Invalid contact number format." });
  }

  const { data, error } = await supabase
    .from("access_codes")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ success: false, message: "Invalid project code." });
  }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ success: false, message: "Code expired." });
  }

  const normalizedInput = whatsapp.replace(/\D/g, "");
  const normalizedStored = (data.whatsapp_contact || "").replace(/\D/g, "");

  if (normalizedInput !== normalizedStored) {
    return NextResponse.json({ success: false, message: "Contact number does not match code." });
  }

  const res = NextResponse.json({ success: true });

  // ✅ Set cookie for 2 days
  res.cookies.set("verified", "true", {
    path: "/",
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 2, // 2 days
  });

  return res;
}
