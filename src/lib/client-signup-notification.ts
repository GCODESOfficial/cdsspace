import "server-only";

import { supabaseAdmin } from "@/lib/supabase";

interface NewClientSummary {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
}

/**
 * Create the admin-facing account-created notice exactly once: this helper is
 * called only from the branch that inserted a new profile. The notification
 * bell already handles its sound and unread counter.
 */
export async function notifyAdminOfNewClient(profile: NewClientSummary) {
  const configuredAdminEmail = (
    process.env.SUPER_ADMIN_EMAIL ||
    process.env.NEXT_PUBLIC_ADMIN_EMAIL ||
    process.env.ADMIN_EMAIL ||
    "ceo@cdsspace.pro"
  ).trim().toLowerCase();

  const { data: adminProfile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .ilike("email", configuredAdminEmail)
    .limit(1)
    .maybeSingle();

  if (!adminProfile?.id) return;

  const clientName = profile.full_name || profile.company_name || profile.email || "A new client";
  const message = `${clientName} (${profile.email}) created a CDS Space account.`;
  const notice = {
    user_id: adminProfile.id,
    type: "new_client",
    title: "New client account",
    message,
    link: "/admin/clients/list",
    is_read: false,
  };

  // Auth providers or a database trigger may create the profile before the
  // dashboard sees it. Keep the alert idempotent when both paths converge.
  const { data: existingNotice } = await supabaseAdmin
    .from("notifications")
    .select("id")
    .eq("user_id", adminProfile.id)
    .eq("title", notice.title)
    .eq("message", message)
    .limit(1)
    .maybeSingle();
  if (existingNotice?.id) return;

  const { error } = await supabaseAdmin.from("notifications").insert(notice);

  // Older live schemas may still have a constrained notification-type list.
  // Preserve the same user-facing account alert with a widely supported type
  // until that constraint is upgraded, without ever blocking signup.
  if (error && /constraint|check|type/i.test(error.message || "")) {
    const { error: fallbackError } = await supabaseAdmin.from("notifications").insert({
      ...notice,
      type: "status_change",
    });
    if (fallbackError) throw new Error(fallbackError.message);
    return;
  }

  if (error) throw new Error(error.message);
}
