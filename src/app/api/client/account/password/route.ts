import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/glashdb/server";
import { readClientDashboardSessionUser } from "@/lib/client-dashboard-session";
import { clearClientLoginFailures } from "@/lib/client-login-security";

export const dynamic = "force-dynamic";

function validNewPassword(password: string) {
  return password.length >= 10
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Enter your current and new passwords." }, { status: 400 });
  }
  if (!validNewPassword(newPassword)) {
    return NextResponse.json(
      { error: "Use at least 10 characters with uppercase, lowercase and a number." },
      { status: 400 },
    );
  }
  if (currentPassword === newPassword) {
    return NextResponse.json({ error: "Choose a password you have not just used." }, { status: 400 });
  }

  const db = await createClient();
  const user = await readClientDashboardSessionUser(db.auth);
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error: signInError } = await db.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (signInError) {
    return NextResponse.json({ error: "Your current password is incorrect." }, { status: 400 });
  }

  const { error: updateError } = await db.auth.updateUser({ password: newPassword });
  if (updateError) {
    return NextResponse.json({ error: updateError.message || "Could not change your password." }, { status: 400 });
  }

  await clearClientLoginFailures(user.email);

  return NextResponse.json({ ok: true });
}
