import { supabaseAdmin } from "@/lib/supabase";
import { getSuperAdminProfileId } from "@/lib/super-admin-profile";

/**
 * Best-effort notification to the super admin's bell (legacy `notifications`
 * table polled by AdminNotificationBell every 10s).
 *
 * Known `type` values (see 20260321_chat_notifications_status.sql +
 * 20260708_hrm_interactive.sql): order_update, new_message, status_change,
 * new_order, team_checkin, team_checkout, team_alert, work_tracking.
 *
 * Never throws - a failed notification must not break the calling flow.
 */
export async function notifySuperAdmin(input: {
  type: "team_checkin" | "team_checkout" | "team_alert" | "work_tracking" | "status_change";
  title: string;
  message: string;
  link?: string;
}) {
  try {
    const userId = await getSuperAdminProfileId();
    if (!userId || !supabaseAdmin) return;
    const { error } = await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      type: input.type,
      title: input.title,
      message: input.message,
      link: input.link ?? null,
      is_read: false,
    });
    if (error) {
      // Fall back to a constraint-safe type if the migration extending the
      // notifications_type_check constraint has not been applied yet.
      const { error: fallbackError } = await supabaseAdmin.from("notifications").insert({
        user_id: userId,
        type: "status_change",
        title: input.title,
        message: input.message,
        link: input.link ?? null,
        is_read: false,
      });
      if (fallbackError) console.error("[notify-admin] insert failed:", fallbackError.message);
    }
  } catch (err) {
    console.error("[notify-admin] failed:", err);
  }
}
